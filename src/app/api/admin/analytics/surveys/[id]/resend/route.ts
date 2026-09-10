import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { resendSurvey } from '@/lib/surveyReminder';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!await requireSession('ADMIN')) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  const { id } = await context.params;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return NextResponse.json({ error: '설문을 확인해 주세요.' }, { status: 400 });
  try {
    const result = await resendSurvey(id, req.nextUrl.origin);
    return NextResponse.json(result, {
      status: result.status, headers: { 'Cache-Control': 'no-store', ...('retryAfter' in result ? { 'Retry-After': String(result.retryAfter) } : {}) },
    });
  } catch (error) {
    console.error('[survey reminder]', error);
    return NextResponse.json({ error: '발송 결과를 확인하지 못했습니다. 잠시 후 목록을 새로고침해 주세요.' }, { status: 500 });
  }
}
