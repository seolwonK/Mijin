'use client';

import { useState } from 'react';
import { REGIONS, hasSigungu } from '@/lib/regions';
import { usePolling } from '@/components/usePolling';
import AdminMetricStrip from '@/components/AdminMetricStrip';
import AdminDataTable, { type Column } from '@/components/AdminDataTable';
import { AlertIcon } from '@/components/icons';

type Candidate = {
  name: string;
  kind: 'PROVIDER' | 'TECHNICIAN';
  assigned30d: number;
  avgRating: number;
  reviewCount: number;
};

type RankedCandidate = Candidate & { rank: number };

type RotationResponse = {
  candidates: Candidate[];
  meta: {
    chainLabel: string;
    criticalNotApplied: boolean;
    distanceTieUnresolved: boolean;
  };
};

type ColKey = 'rank' | 'name' | 'kind' | 'assigned30d' | 'avgRating' | 'reviewCount';

const selectClass =
  'rounded-admin-md border border-admin-border bg-admin-surface px-3 py-1.5 text-[12.5px] text-admin-ink focus:border-admin-cyan focus:outline-none disabled:text-admin-faint';

function KindBadge({ kind }: { kind: 'PROVIDER' | 'TECHNICIAN' }) {
  return (
    <span className="inline-block rounded-admin-sm bg-admin-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-admin-dim">
      {kind === 'PROVIDER' ? '업체' : '기술자'}
    </span>
  );
}

// 한계 배지 2종(AC-2) — 지역/상태와 무관하게 항상 노출한다. 예측 정직성 원칙(가상 접수엔
// 좌표가 없어 거리 단계가 자연 생략된다는 것을 사용자가 항상 인지해야 함) — 조건부로 숨기면
// "지금은 정확하다"는 오해를 유발한다.
function LimitBadges() {
  return (
    <div className="flex flex-wrap gap-2 px-4 py-2.5">
      <span className="inline-flex items-center gap-1.5 rounded-admin-md border border-admin-amber/30 bg-admin-amber/10 px-2.5 py-1 text-[11.5px] text-admin-amber">
        <AlertIcon className="h-3.5 w-3.5 shrink-0" />
        동률 시 거리로 결정될 수 있음
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-admin-md border border-admin-red/30 bg-admin-red/10 px-2.5 py-1 text-[11.5px] text-admin-red">
        <AlertIcon className="h-3.5 w-3.5 shrink-0" />
        초긴급(CRITICAL)은 거리 우선 — 이 순번 미적용
      </span>
    </div>
  );
}

// 지역 순환 현황(AC-2) — Option C(합성 NORMAL 요청으로 getCandidates 재사용) 결과를 그대로
// 보여준다. 정렬은 API가 이미 실제 배정 사슬 순서로 반환하므로 이 화면에서 재정렬하지 않는다
// (테이블 정렬을 켜면 "순위"가 실제 배정 순서와 어긋나는 거짓 정보가 된다).
export default function AdminRotationPage() {
  const [sido, setSido] = useState('');
  const [sigungu, setSigungu] = useState('');

  const queryUrl = sido
    ? `/api/admin/rotation?sido=${encodeURIComponent(sido)}&sigungu=${encodeURIComponent(sigungu)}`
    : null;
  const { data, error } = usePolling<RotationResponse>(queryUrl, 30_000);

  const candidates = data?.candidates ?? [];
  const rankedRows: RankedCandidate[] = candidates.map((c, i) => ({ ...c, rank: i + 1 }));
  const sigungus = REGIONS[sido] ?? [];

  const totalAssigned30d = candidates.reduce((sum, c) => sum + c.assigned30d, 0);
  const rated = candidates.filter((c) => c.reviewCount > 0);
  const avgRating =
    rated.length > 0 ? rated.reduce((sum, c) => sum + c.avgRating, 0) / rated.length : null;

  const columns: Column<RankedCandidate, ColKey>[] = [
    {
      key: 'rank',
      label: '순위',
      width: '64px',
      render: (r) => (
        <span className={`font-mono font-bold ${r.rank === 1 ? 'text-admin-cyan' : 'text-admin-faint'}`}>
          {r.rank}
        </span>
      ),
    },
    { key: 'name', label: '이름', render: (r) => <span className="font-semibold">{r.name}</span> },
    { key: 'kind', label: '종류', width: '88px', render: (r) => <KindBadge kind={r.kind} /> },
    {
      key: 'assigned30d',
      label: '30일 배정(전체)',
      width: '140px',
      align: 'right',
      render: (r) => <span className="font-mono text-admin-dim">{r.assigned30d}건</span>,
    },
    {
      key: 'avgRating',
      label: '평균 별점',
      width: '100px',
      align: 'right',
      render: (r) => <span className="font-mono text-admin-dim">★{r.avgRating.toFixed(1)}</span>,
    },
    {
      key: 'reviewCount',
      label: '후기 수',
      width: '90px',
      align: 'right',
      render: (r) => <span className="font-mono text-admin-dim">{r.reviewCount}건</span>,
    },
  ];

  return (
    <main className="min-h-screen">
      {/* 모바일 — AdminShell 자체가 데스크톱(md+) 전용 커맨드센터 셸이라(AdminShell.tsx:13),
          이 화면도 동일 전제를 따른다. 데이터 밀도가 높은 순번 테이블이라 축소 없이 안내만. */}
      <div className="p-6 md:hidden">
        <h1 className="text-lg font-bold">지역 순환 현황</h1>
        <p className="mt-2 rounded-xl bg-neutral-50 p-4 text-sm text-muted">
          이 화면은 데스크톱(가로 화면)에서 이용해 주세요.
        </p>
      </div>

      <div className="hidden bg-admin-bg text-admin-ink md:block">
        <div className="flex flex-wrap items-center gap-3 border-b border-admin-border px-4 py-3">
          <h1 className="text-sm font-bold">지역 순환 현황</h1>
          <select
            value={sido}
            onChange={(e) => {
              setSido(e.target.value);
              setSigungu('');
            }}
            className={selectClass}
            aria-label="시/도 선택"
          >
            <option value="">시/도 선택</option>
            {Object.keys(REGIONS).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={sigungu}
            onChange={(e) => setSigungu(e.target.value)}
            disabled={!sido || !hasSigungu(sido)}
            className={selectClass}
            aria-label="시/군/구 선택"
          >
            <option value="">{sido && !hasSigungu(sido) ? '해당 없음' : '전체(시/도)'}</option>
            {sigungus.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          {data?.meta && (
            <span className="ml-auto font-mono text-[10.5px] text-admin-faint">
              {data.meta.chainLabel}
            </span>
          )}
        </div>

        <LimitBadges />

        {!sido ? (
          <p className="p-8 text-center text-sm text-admin-faint">
            지역(시/도)을 선택하면 해당 지역의 순번 예측을 볼 수 있습니다
          </p>
        ) : error ? (
          <p className="px-4 py-2 text-sm text-admin-red">{error}</p>
        ) : !data ? (
          <p className="p-8 text-center text-sm text-admin-faint">불러오는 중…</p>
        ) : (
          <>
            <AdminMetricStrip
              metrics={[
                { label: '총 후보 수', value: candidates.length },
                { label: '30일 배정 합계', value: `${totalAssigned30d}건` },
                { label: '평균 별점', value: avgRating != null ? `★${avgRating.toFixed(1)}` : '—' },
              ]}
            />
            {rankedRows.length === 0 ? (
              <p className="p-8 text-center text-sm text-admin-faint">
                해당 지역을 담당하는 배정 대상이 없습니다
              </p>
            ) : (
              <AdminDataTable columns={columns} rows={rankedRows} rowKey={(r) => `${r.kind}:${r.name}:${r.rank}`} />
            )}
          </>
        )}
      </div>
    </main>
  );
}
