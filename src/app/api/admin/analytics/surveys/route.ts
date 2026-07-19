import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { getSurveyOverview } from '@/lib/surveyAnalytics';

export async function GET() {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  return NextResponse.json(await getSurveyOverview());
}
