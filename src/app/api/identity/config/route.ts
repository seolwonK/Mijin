import { NextResponse } from 'next/server';
import { getIdentityPublicConfig } from '@/lib/identity/config';

// 브라우저가 본인인증을 시작하기 전에 받아가는 공개 설정(provider / storeId / channelKey).
// 값은 런타임 환경변수에서 읽는다 — 근거는 src/lib/identity/config.ts 주석 참조.
// 설정이 깨져 있으면 500 을 돌려 가입 화면이 "설정 오류"를 명확히 보여주게 한다
// (조용히 mock 으로 떨어져 실서비스에서 무인증 가입이 열리는 것을 막는다).
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(getIdentityPublicConfig(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '본인인증 설정 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
