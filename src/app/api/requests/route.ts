import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { sendSms } from '@/lib/sms';
import { smsRequestReceived } from '@/lib/sms/templates';

const createSchema = z.object({
  customerName: z.string().trim().min(1, '이름을 입력해 주세요').max(50),
  customerPhone: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .pipe(z.string().regex(/^0\d{8,10}$/, '전화번호 형식이 올바르지 않습니다')),
  description: z.string().trim().min(1, '고장 내용을 입력해 주세요').max(2000),
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

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요' },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const lookupCode = await generateLookupCode();
  const request = await prisma.serviceRequest.create({
    data: {
      lookupCode,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      description: data.description,
      urgency: data.urgency,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      address: data.address || null,
    },
  });
  await sendSms(
    request.customerPhone,
    smsRequestReceived(request.customerName),
    request.id,
  );
  return NextResponse.json({ id: request.id, lookupCode });
}
