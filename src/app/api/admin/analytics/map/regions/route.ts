import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { getRegionOverview } from '@/lib/mapOverview';
import { REGIONS } from '@/lib/regions';

const sidoSchema = z.string().refine(
  (value) => Object.hasOwn(REGIONS, value) && Array.isArray(REGIONS[value]) && REGIONS[value].length > 0,
  { message: '유효하지 않은 시도입니다' },
).optional();

export async function GET(req: NextRequest) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const parsed = sidoSchema.safeParse(req.nextUrl.searchParams.get('sido') ?? undefined);
  if (!parsed.success) return NextResponse.json({ error: '유효하지 않은 시도입니다' }, { status: 400 });

  return NextResponse.json(await getRegionOverview(undefined, parsed.data));
}
