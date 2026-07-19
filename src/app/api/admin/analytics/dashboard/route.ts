import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { getDashboardStats } from '@/lib/analyticsStats';

const periodSchema = z.enum(['day', 'week', 'month']);

export async function GET(req: NextRequest) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const parsed = periodSchema.safeParse(searchParams.get('period') ?? 'day');
  if (!parsed.success) {
    return NextResponse.json({ error: 'period는 day, week, month 중 하나여야 합니다' }, { status: 400 });
  }

  return NextResponse.json(await getDashboardStats(parsed.data));
}
