import { NextRequest, NextResponse } from 'next/server';
import { runAutoAssign } from '@/lib/autoAssign';

// 외부 cron 백업용. instrumentation 워커와 동일한 로직을 실행한다.
// - 일반 cron/curl: POST + x-cron-secret 헤더
// - Vercel Cron:   GET + Authorization: Bearer <CRON_SECRET> (자동 첨부)
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get('x-cron-secret') === secret) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  const result = await runAutoAssign();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
