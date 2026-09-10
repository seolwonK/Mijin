import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { kstMonthString } from '@/lib/kst';
import { getSettlementReport, getSettlementSourceRows, toSettlementCsv } from '@/lib/settlementReport';
import { getSettlementDetail } from '@/lib/settlementDetail';
import { z } from 'zod';

function resolvedMonth(month: string | null): string {
  return month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : kstMonthString();
}

export async function GET(req: NextRequest) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const requestedMonth = req.nextUrl.searchParams.get('month');
  const month = resolvedMonth(requestedMonth);
  if (req.nextUrl.searchParams.has('payeeId') || req.nextUrl.searchParams.has('kind')) {
    const parsed = z.object({
      payeeId: z.string().min(1).max(100), kind: z.enum(['PROVIDER', 'TECHNICIAN']),
      page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    }).safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) return NextResponse.json({ error: '집계 상세 조회 조건을 확인해 주세요.' }, { status: 400 });
    const detail = await getSettlementDetail({ month, ...parsed.data });
    return detail ? NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } })
      : NextResponse.json({ error: '집계 대상을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (req.nextUrl.searchParams.get('format') === 'csv') {
    const rows = await getSettlementSourceRows(undefined, { month });
    return new NextResponse(toSettlementCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="settlements-${month}.csv"`,
      },
    });
  }

  return NextResponse.json(await getSettlementReport(undefined, { month }), { headers: { 'Cache-Control': 'no-store' } });
}
