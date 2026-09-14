import { NextResponse } from 'next/server';

// 브라우저가 런타임에 받아가는 공개 사이트 설정. 값은 서버 환경변수에서 읽는다 — NEXT_PUBLIC_ 은
// `next build` 시점에 번들로 인라인되는데 CloudType 은 환경변수를 컨테이너 런타임에만 주입하므로
// 정적 프리렌더 페이지에 빈 값이 박힌다(src/lib/identity/config.ts 와 같은 이유·같은 패턴).
export const dynamic = 'force-dynamic';

// GA4 측정 ID 형식만 통과시킨다 — 잘못된 값이 <script src> 로 흘러가지 않게.
const GA_ID_PATTERN = /^G-[A-Z0-9]{4,}$/;

export async function GET() {
  const raw = process.env.GA_MEASUREMENT_ID?.trim() ?? '';
  const gaMeasurementId = GA_ID_PATTERN.test(raw) ? raw : null;
  return NextResponse.json(
    { gaMeasurementId },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
