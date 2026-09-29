import { randomInt } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

// 고객 임시 비밀번호 발급 — 고객이 비밀번호를 잊었을 때의 유일한 복구 경로다.
//
// 고객 쪽 재설정(문자 인증)은 문자 발송이 멈춰 있고 본인인증도 없어 만들 수 없다. 그래서
// 고객이 전화하면 관리자가 신청서의 이름·연락처로 본인을 확인한 뒤 임시 비밀번호를 발급해
// **전화로 불러 준다**. 평문은 이 응답에 한 번만 실리고 어디에도 저장되지 않는다. 고객은
// 로그인 뒤 마이페이지에서 새 비밀번호로 바꾼다(api/my/password).

// 불러 주기 쉬운 문자만 쓴다 — 0/O, 1/l/I 처럼 전화로 헷갈리는 글자를 뺐다.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const LENGTH = 10;

function tempPassword(): string {
  let out = '';
  for (let i = 0; i < LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireSession('ADMIN'))) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  const { id } = await params;

  const plan = await prisma.inspectionPlan.findUnique({
    where: { id },
    select: { user: { select: { id: true, role: true, loginId: true } } },
  });
  if (!plan) {
    return NextResponse.json({ error: '구독을 찾을 수 없습니다' }, { status: 404 });
  }
  // 구독 소유자는 항상 고객이지만, 이 입구로 관리자·업체 계정의 비밀번호가 바뀌는 일은
  // 어떤 경우에도 없어야 한다.
  if (plan.user.role !== 'CUSTOMER') {
    return NextResponse.json({ error: '고객 계정이 아닙니다.' }, { status: 409 });
  }

  const password = tempPassword();
  await prisma.user.update({
    where: { id: plan.user.id },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });
  return NextResponse.json(
    { ok: true, loginId: plan.user.loginId, tempPassword: password },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
