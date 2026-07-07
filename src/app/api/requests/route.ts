import { NextRequest, NextResponse } from 'next/server';
import { randomInt, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { sendSms } from '@/lib/sms';
import { smsRequestReceived } from '@/lib/sms/templates';
import { transcribeVoiceNote, VOICE_PLACEHOLDER } from '@/lib/stt';
import { uploadsRoot } from '@/lib/uploads';

const MAX_VOICE_BYTES = 15 * 1024 * 1024; // 3분 녹음도 수 MB 수준 — 여유 상한

const EXT_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a', // iOS Safari MediaRecorder
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
};

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
  const contentType = req.headers.get('content-type') ?? '';
  let body: unknown;
  let voice: File | null = null;

  if (contentType.includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
    }
    const v = form.get('voice');
    voice = v instanceof File && v.size > 0 ? v : null;
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

  // 음성 검증 + 저장 (레코드 생성 전에 저장해 파일 없는 음성 접수 방지)
  let voicePath: string | null = null;
  let voiceMime: string | null = null;
  let voiceBytes: Uint8Array | null = null;
  if (voice) {
    voiceMime = (voice.type || '').split(';')[0].trim().toLowerCase();
    const ext = EXT_BY_MIME[voiceMime];
    if (!ext) {
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
      const dir = path.join(uploadsRoot(), 'voice-notes');
      await fs.mkdir(dir, { recursive: true });
      const fileName = `${randomUUID()}.${ext}`;
      await fs.writeFile(path.join(dir, fileName), voiceBytes);
      voicePath = path.join('uploads', 'voice-notes', fileName);
    } catch (e) {
      console.error('[requests] 음성 저장 실패', e);
      if (!data.description) {
        return NextResponse.json(
          { error: '음성 저장에 실패했습니다. 다시 시도해 주세요.' },
          { status: 500 },
        );
      }
      // 텍스트가 있으면 음성 없이 접수 진행
      voicePath = null;
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
      voicePath,
      voiceMime,
    },
  });

  // 서버 STT (STT_PROVIDER 설정 시) — 고객 응답을 지연시키지 않도록 대기하지 않음
  if (voiceBytes && voiceMime) {
    void transcribeVoiceNote(request.id, voiceBytes, voiceMime);
  }

  await sendSms(
    request.customerPhone,
    smsRequestReceived(request.customerName),
    request.id,
  );
  return NextResponse.json({ id: request.id, lookupCode });
}
