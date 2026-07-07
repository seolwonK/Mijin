import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { geocode } from '@/lib/geo/kakao';
import { isValidBizRegNo, normalizeBizRegNo } from '@/lib/bizRegNo';
import { uploadsRoot } from '@/lib/uploads';

// 업체 셀프 가입 신청. PENDING 상태로 생성되며 관리자 승인 후 이용 가능.
// multipart/form-data: 텍스트 필드 + bizCert(사업자등록증 이미지/PDF)

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

const fieldsSchema = z.object({
  loginId: z.string().trim().min(3, '아이디는 3자 이상').max(30),
  password: z.string().min(8, '비밀번호는 8자 이상'),
  name: z.string().trim().min(1, '업체명을 입력해 주세요').max(50),
  phone: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .pipe(z.string().regex(/^0\d{8,10}$/, '전화번호 형식이 올바르지 않습니다')),
  address: z.string().trim().min(1, '주소를 입력해 주세요').max(200),
  bizRegNo: z.string().trim().min(1, '사업자등록번호를 입력해 주세요'),
});

// 인메모리 레이트리밋: IP당 10분에 5회 (가입 신청 남용 방지)
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
  return h.count > 5;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: '신청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }

  const parsed = fieldsSchema.safeParse({
    loginId: form.get('loginId'),
    password: form.get('password'),
    name: form.get('name'),
    phone: form.get('phone'),
    address: form.get('address'),
    bizRegNo: form.get('bizRegNo'),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요' },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const bizRegNo = normalizeBizRegNo(data.bizRegNo);
  if (!isValidBizRegNo(bizRegNo)) {
    return NextResponse.json(
      { error: '사업자등록번호가 올바르지 않습니다 (10자리 숫자, 검증번호 불일치)' },
      { status: 400 },
    );
  }

  const file = form.get('bizCert');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: '사업자등록증 사진을 첨부해 주세요' },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: '파일이 너무 큽니다 (8MB 이하)' },
      { status: 400 },
    );
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: '이미지(JPG/PNG/WEBP/HEIC) 또는 PDF만 첨부할 수 있습니다' },
      { status: 400 },
    );
  }

  const [dupLogin, dupBiz] = await Promise.all([
    prisma.user.findUnique({ where: { loginId: data.loginId }, select: { id: true } }),
    prisma.provider.findUnique({ where: { bizRegNo }, select: { id: true } }),
  ]);
  if (dupLogin) {
    return NextResponse.json({ error: '이미 사용 중인 아이디입니다' }, { status: 409 });
  }
  if (dupBiz) {
    return NextResponse.json(
      { error: '이미 가입 신청된 사업자등록번호입니다' },
      { status: 409 },
    );
  }

  // 좌표는 지오코딩 시도만 (키 없거나 실패해도 신청은 진행 — 승인 시 관리자가 보완)
  const geo = await geocode(data.address);

  const user = await prisma.user.create({
    data: {
      loginId: data.loginId,
      passwordHash: await bcrypt.hash(data.password, 10),
      name: data.name,
      phone: data.phone,
      role: 'PROVIDER',
      provider: {
        create: {
          address: data.address,
          lat: geo?.lat ?? null,
          lng: geo?.lng ?? null,
          bizRegNo,
          approvalStatus: 'PENDING',
        },
      },
    },
    include: { provider: { select: { id: true } } },
  });
  const providerId = user.provider!.id;

  try {
    const dir = path.join(uploadsRoot(), 'biz-certs');
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${providerId}.${ext}`);
    await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));
    await prisma.provider.update({
      where: { id: providerId },
      data: { bizCertPath: path.join('uploads', 'biz-certs', `${providerId}.${ext}`) },
    });
  } catch (e) {
    // 파일 저장 실패 시 신청 자체를 롤백 (증빙 없는 신청 방지)
    await prisma.provider.delete({ where: { id: providerId } });
    await prisma.user.delete({ where: { id: user.id } });
    console.error('[signup] 사업자등록증 저장 실패', e);
    return NextResponse.json(
      { error: '파일 저장에 실패했습니다. 다시 시도해 주세요.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
