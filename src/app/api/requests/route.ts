import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { sendSms } from '@/lib/sms';
import { smsRequestReceived } from '@/lib/sms/templates';
import { transcribeVoiceNote, VOICE_PLACEHOLDER } from '@/lib/stt';
import { collectPhotoUploads, saveRequestPhotos, type PhotoUpload } from '@/lib/photos';
import { geocode } from '@/lib/geo';
import { autoAssignNewRequest } from '@/lib/autoAssign';

// 좌표 없이 주소만 입력된 접수의 좌표 백필 — 고객 응답을 지연시키지 않도록
// STT 와 같은 fire-and-forget 패턴. 실패해도 접수는 그대로(거리 미확인 폴백).
async function backfillRequestCoords(requestId: string, address: string) {
  try {
    const geo = await geocode(address);
    if (!geo) return;
    await prisma.serviceRequest.update({
      where: { id: requestId },
      data: { lat: geo.lat, lng: geo.lng },
    });
  } catch {
    // 백필 실패는 무시 — 관리자 화면에서 좌표 수동 보정 가능
  }
}

// 인메모리 레이트리밋: IP당 10분에 10회 (identity/verify·tech/signup 등과 동형).
// 이 라우트는 접수 1건마다 sendSms 를 await 로 실발송하므로(아래 POST 말미),
// 제한이 없으면 인증·캡차 없이 임의 번호로 무한 반복해 과금과 제3자 문자 폭탄을
// 만들 수 있다. 긴급 출동 접수라 정상 사용자를 막으면 안 되므로 가입 계열(5회)보다
// 여유를 두되, IP당 10분 10건으로 비용 상한을 건다.
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
  }
  const h = hits.get(ip);
  if (!h || h.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + 10 * 60_000 });
    return false;
  }
  h.count++;
  return h.count > 10;
}

const MAX_VOICE_BYTES = 15 * 1024 * 1024; // 3분 녹음도 수 MB 수준 — 여유 상한

// 지원 녹음 포맷 (브라우저 MediaRecorder 산출물)
const SUPPORTED_VOICE_MIMES = new Set([
  'audio/webm', // Chrome/삼성인터넷
  'audio/mp4', // iOS Safari
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
]);

const createSchema = z.object({
  customerName: z.string().trim().min(1, '이름을 입력해 주세요').max(50),
  customerPhone: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .pipe(z.string().regex(/^0\d{8,10}$/, '전화번호 형식이 올바르지 않습니다')),
  // 음성만으로 접수할 수 있으므로 min(1) 없음 — 텍스트/음성 중 하나는 아래에서 강제
  description: z.string().trim().max(2000),
  urgency: z.enum(['CRITICAL', 'URGENT', 'NORMAL']),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  address: z.string().trim().max(200).nullish(),
});

async function generateLookupCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const exists = await prisma.serviceRequest.findUnique({
      where: { lookupCode: code },
      select: { id: true },
    });
    if (!exists) return code;
  }
  throw new Error('접수번호 생성에 실패했습니다');
}

function formNum(v: FormDataEntryValue | null): number | null {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: '접수 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    );
  }

  const contentType = req.headers.get('content-type') ?? '';
  let body: unknown;
  let voice: File | null = null;
  let photos: PhotoUpload[] = [];

  if (contentType.includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
    }
    const v = form.get('voice');
    voice = v instanceof File && v.size > 0 ? v : null;
    // 사진은 여기서 장수·용량·형식만 본다. 실제 저장(R2)은 접수 행이 생긴 뒤에 한다.
    // 사유별로 반환문을 따로 두는 것은 아래 음성 게이트와 같은 방식이다 —
    // 어느 사유를 때렸는지 응답 문구만으로 특정할 수 있어야 한다.
    const collected = await collectPhotoUploads(form);
    if ('error' in collected) {
      if (collected.error === 'TOO_MANY') {
        return NextResponse.json(
          { error: '사진은 최대 5장까지 첨부할 수 있습니다' },
          { status: 400 },
        );
      }
      if (collected.error === 'TOO_LARGE') {
        return NextResponse.json(
          { error: '사진 용량이 너무 큽니다 (장당 최대 10MB)' },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: '지원하지 않는 사진 형식입니다 (JPG·PNG·WEBP만 가능)' },
        { status: 400 },
      );
    }
    photos = collected.photos;
    body = {
      customerName: form.get('customerName') ?? '',
      customerPhone: form.get('customerPhone') ?? '',
      description: form.get('description') ?? '',
      urgency: form.get('urgency') ?? '',
      lat: formNum(form.get('lat')),
      lng: formNum(form.get('lng')),
      address: typeof form.get('address') === 'string' ? form.get('address') : null,
    };
  } else {
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
    }
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요' },
      { status: 400 },
    );
  }
  const data = parsed.data;

  if (!data.description && !voice) {
    return NextResponse.json(
      { error: '고장 내용을 입력하거나 음성으로 남겨 주세요' },
      { status: 400 },
    );
  }

  // 음성 검증 + 저장 — 컨테이너 파일시스템은 재배포 시 초기화되므로 DB(StoredFile)에 저장
  let voiceFileId: string | null = null;
  let voiceMime: string | null = null;
  let voiceBytes: Uint8Array<ArrayBuffer> | null = null;
  if (voice) {
    voiceMime = (voice.type || '').split(';')[0].trim().toLowerCase();
    if (!SUPPORTED_VOICE_MIMES.has(voiceMime)) {
      return NextResponse.json(
        { error: '지원하지 않는 음성 형식입니다' },
        { status: 400 },
      );
    }
    if (voice.size > MAX_VOICE_BYTES) {
      return NextResponse.json(
        { error: '음성 파일이 너무 큽니다 (최대 15MB)' },
        { status: 400 },
      );
    }
    voiceBytes = new Uint8Array(await voice.arrayBuffer());
    try {
      const stored = await prisma.storedFile.create({
        data: { mime: voiceMime, data: voiceBytes },
        select: { id: true },
      });
      voiceFileId = stored.id;
    } catch (e) {
      console.error('[requests] 음성 저장 실패', e);
      if (!data.description) {
        return NextResponse.json(
          { error: '음성 저장에 실패했습니다. 다시 시도해 주세요.' },
          { status: 500 },
        );
      }
      // 텍스트가 있으면 음성 없이 접수 진행
      voiceFileId = null;
      voiceMime = null;
      voiceBytes = null;
    }
  }

  const lookupCode = await generateLookupCode();
  const request = await prisma.serviceRequest.create({
    data: {
      lookupCode,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      description: data.description || VOICE_PLACEHOLDER,
      urgency: data.urgency,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      address: data.address || null,
      voiceFileId,
      voiceMime,
    },
  });

  // 현장 사진 저장 — 실패한 사진은 내부적으로 생략되고 접수는 그대로 진행된다(photos.ts).
  await saveRequestPhotos(request.id, photos);

  // 서버 STT (STT_PROVIDER 설정 시) — 고객 응답을 지연시키지 않도록 대기하지 않음
  if (voiceBytes && voiceMime) {
    void transcribeVoiceNote(request.id, voiceBytes, voiceMime);
  }

  // 백그라운드 후처리(고객 응답 비대기): ① 주소만 있으면 좌표 백필 → ② 즉시 자동배정.
  // 순서 보장: 좌표가 채워진 뒤 배정해야 추천 사슬의 거리 단계까지 정상 작동한다.
  // 실패해도 접수는 유지되고, 워커(대기시간 경로)가 안전망으로 재시도한다.
  void (async () => {
    if (request.address && request.lat == null) {
      await backfillRequestCoords(request.id, request.address);
    }
    await autoAssignNewRequest(request.id);
  })();

  await sendSms(
    request.customerPhone,
    smsRequestReceived(request.customerName),
    request.id,
  );
  return NextResponse.json({ id: request.id, lookupCode });
}
