'use client';

import { useState } from 'react';
import AdminDataTable, { type Column } from '@/components/AdminDataTable';
import InfoTip from '@/components/InfoTip';
import PageHeader from '@/components/PageHeader';
import { usePolling } from '@/components/usePolling';
import { KST_OFFSET_MS } from '@/lib/kst';

type Row = {
  payeeId: string;
  name: string;
  type: '업체' | '기술자';
  total: number;
  aggregatedCount: number;
  completedCount: number;
  missingCount: number;
  coverage: number;
};

type ColumnKey = 'name' | 'total' | 'completedCount' | 'aggregatedCount' | 'missingCount' | 'coverage';

function currentKstMonth() {
  const kst = new Date(Date.now() + KST_OFFSET_MS);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function won(n: number) {
  return `${n.toLocaleString('ko-KR')}원`;
}

const columns: Column<Row, ColumnKey>[] = [
  {
    key: 'name',
    label: '대상',
    sortable: true,
    sortValue: (row) => row.name,
    render: (row) => row.name,
  },
  {
    key: 'total',
    label: '고객 신고 총수금액',
    align: 'right',
    sortable: true,
    sortValue: (row) => row.total,
    render: (row) => won(row.total),
  },
  {
    key: 'completedCount',
    label: '완료',
    align: 'right',
    sortable: true,
    sortValue: (row) => row.completedCount,
    render: (row) => `${row.completedCount}건`,
  },
  {
    key: 'aggregatedCount',
    label: '집계',
    align: 'right',
    sortable: true,
    sortValue: (row) => row.aggregatedCount,
    render: (row) => `${row.aggregatedCount}건`,
  },
  {
    key: 'missingCount',
    label: '미입력',
    align: 'right',
    sortable: true,
    sortValue: (row) => row.missingCount,
    render: (row) => `${row.missingCount}건`,
  },
  {
    key: 'coverage',
    label: '커버리지',
    align: 'right',
    sortable: true,
    sortValue: (row) => row.coverage,
    render: (row) => `${Math.round(row.coverage * 100)}%`,
  },
];

function SettlementSection({ title, rows }: { title: '업체' | '기술자'; rows: Row[] }) {
  return (
    <section className="rounded-admin-md border border-border bg-white">
      <h2 className="border-b border-border px-3.5 py-2.5 text-sm font-bold text-fg">{title}</h2>
      {rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted">해당 기간 집계 데이터 없음</p>
      ) : (
        <AdminDataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.payeeId}
          defaultSort={{ key: 'total', dir: -1 }}
        />
      )}
    </section>
  );
}

export default function AdminSettlementsPage() {
  const [month, setMonth] = useState(currentKstMonth);
  const { data, error } = usePolling<{ month: string; providers: Row[]; technicians: Row[] }>(
    `/api/admin/settlements?month=${month}`,
    15_000,
  );
  const loading = !data && !error;

  return (
    <main className="min-h-screen">
      <div className="md:hidden">
        <PageHeader title="정산 집계 리포트" back="/admin" width="max-w-none" />
      </div>
      <div className="hidden items-center justify-between border-b border-border px-4 py-1.5 md:flex">
        <h1 className="text-sm font-bold text-fg">정산 집계 리포트</h1>
      </div>

      <div className="space-y-4 px-4 pt-2 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-fg">
            정산 월
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              aria-label="정산 월"
              className="rounded-admin-md border border-border px-2 py-1.5 text-sm font-normal text-fg focus:border-admin-cyan-ink focus:outline-none"
            />
          </label>
          <a
            href={`/api/admin/settlements?month=${month}&format=csv`}
            className="text-sm font-semibold text-brand-600 hover:underline"
          >
            CSV 내보내기
          </a>
        </div>

        <p className="flex items-center gap-1.5 text-sm text-muted">
          총액은 고객 신고 총수금액 참고치이며 세무/회계 확정치가 아닙니다.
          <InfoTip text="고객이 설문에 입력한 총수금액을 기준으로 집계한 참고치입니다. 세무 또는 회계 확정 금액으로 사용할 수 없습니다. 완료 건수는 설문에 응답(제출)한 건 기준이며, 미응답 건은 커버리지에 포함되지 않습니다." />
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="rounded-admin-md border border-border p-6 text-center text-sm text-muted">불러오는 중…</p>
        ) : (
          <>
            <SettlementSection title="업체" rows={data?.providers ?? []} />
            <SettlementSection title="기술자" rows={data?.technicians ?? []} />
          </>
        )}
      </div>
    </main>
  );
}
