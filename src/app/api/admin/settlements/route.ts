import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { kstMonthString } from '@/lib/kst';
import { getSettlementReport, getSettlementSourceRows, toSettlementCsv } from '@/lib/settlementReport';

function resolvedMonth(month: string | null): string {
  return month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : kstMonthString();
}

export async function GET(req: NextRequest) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const requestedMonth = req.nextUrl.searchParams.get('month');
  const month = resolvedMonth(requestedMonth);
  if (req.nextUrl.searchParams.get('format') === 'csv') {
    const rows = await getSettlementSourceRows(undefined, { month });
    return new NextResponse(toSettlementCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="settlements-${month}.csv"`,
      },
    });
  }

  return NextResponse.json(await getSettlementReport(undefined, { month }));
}
