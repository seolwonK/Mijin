import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { getSolapiBalance } from '@/lib/sms/solapi';

// 문자(SOLAPI) 충전 잔액. SOLAPI 가 허용 IP 에서만 API 를 받아 로컬에서는 조회되지 않으므로
// 운영 서버를 거쳐 관리자만 본다.
export async function GET() {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  try {
    return NextResponse.json(await getSolapiBalance());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
