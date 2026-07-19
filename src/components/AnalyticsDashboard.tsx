'use client';

import { useEffect, useState } from 'react';
import { usePolling } from '@/components/usePolling';
import BarChart from '@/components/charts/BarChart';
import LineChart from '@/components/charts/LineChart';
import type { DashboardStats } from '@/lib/analyticsStats';
import InfoTip from '@/components/InfoTip';

type Period = 'day' | 'week' | 'month';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: '일' },
  { key: 'week', label: '주' },
  { key: 'month', label: '월' },
];
function useLgViewport() {
  const [isLg, setIsLg] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsLg(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return isLg;
}


const STATUS_LABEL: Record<string, string> = {
  RECEIVED: '접수',
  ASSIGNED: '배정',
  ACCEPTED: '수락',
  DISPATCHED: '출동',
  COMPLETED: '완료',
  CANCELED: '취소',
};

function refreshTime(updatedAt?: string) {
  return updatedAt
    ? `마지막 갱신 ${new Date(updatedAt).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })}`
    : '마지막 갱신 —';
}

function seconds(value: number | null) {
  if (value == null) return '—';
  if (value < 60) return `${Math.round(value)}초`;
  return `${Math.floor(value / 60)}분 ${Math.round(value % 60)}초`;
}

function percent(value: number | null) {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`;
}

function won(value: number | null) {
  return value == null ? '—' : `${new Intl.NumberFormat('ko-KR').format(value)}원`;
}

function Section({ title, tip, updatedAt, children, id }: { title: string; tip: string; updatedAt?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-admin-md border border-border bg-white p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-fg">{title}</h2>
          <InfoTip text={tip} />
        </div>
        <span className="font-mono text-[11px] text-muted">{refreshTime(updatedAt)}</span>
      </div>
      {children}
    </section>
  );
}

function TimingStats({ title, description, tip, stats }: { title: string; description: string; tip: string; stats: { mean: number | null; median: number | null; p90: number | null } }) {
  return (
    <div className="rounded-admin-sm bg-neutral-50 p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-fg">{title}</h3>
        <InfoTip text={tip} />
      </div>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div><dt className="text-muted">평균</dt><dd className="mt-1 font-mono font-semibold">{seconds(stats.mean)}</dd></div>
        <div><dt className="text-muted">중앙값</dt><dd className="mt-1 font-mono font-semibold">{seconds(stats.median)}</dd></div>
        <div><dt className="text-muted">P90</dt><dd className="mt-1 font-mono font-semibold">{seconds(stats.p90)}</dd></div>
      </dl>
    </div>
  );
}

function AnalyticsDashboardData({ period, setPeriod, isLg }: { period: Period; setPeriod: (period: Period) => void; isLg: boolean }) {
  const { data, error } = usePolling<DashboardStats>(
    isLg ? `/api/admin/analytics/dashboard?period=${period}` : null,
    45_000,
  );
  const updatedAt = data?.updatedAt;

  return (
    <main className="min-h-screen bg-neutral-50 text-[14px] text-fg">
      <div className="p-4 lg:hidden">
        <p className="rounded-admin-md border border-border bg-white p-5 text-center text-sm text-muted">분석 대시보드는 데스크톱에서 이용할 수 있습니다.</p>
      </div>
      <div className="hidden lg:block">
        <div className="mx-auto max-w-7xl p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">분석 현황</h1>
              <p className="mt-1 text-sm text-muted">운영 처리와 고객 경험 지표를 기간별로 확인합니다.</p>
            </div>
            <div className="flex rounded-admin-sm border border-border bg-white p-1" aria-label="분석 기간">
              {PERIODS.map((item) => (
                <button key={item.key} type="button" onClick={() => setPeriod(item.key)} aria-pressed={period === item.key} className={`rounded-admin-sm px-3 py-1.5 text-sm font-semibold ${period === item.key ? 'bg-brand-600 text-white' : 'text-muted hover:bg-neutral-50'}`}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
          {!data ? <p className="rounded-admin-md border border-border bg-white p-6 text-sm text-muted">분석 데이터를 불러오는 중…</p> : (
            <div className="grid gap-5">
              <Section id="operational" title="운영 상태" tip="현재 스냅샷입니다. 상태별 건수와 확인요망 건수, 미완료 건의 긴급도 분포를 표시합니다." updatedAt={updatedAt}>
                <div className="grid gap-4 xl:grid-cols-2">
                  <BarChart label="운영 상태 분포" data={Object.entries(data.operational.byStatus).map(([status, value]) => ({ label: STATUS_LABEL[status] ?? status, value }))} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-admin-sm bg-neutral-50 p-4"><p className="text-sm text-muted">확인 요망</p><p className="mt-1 font-mono text-lg font-bold">{data.operational.needsAttention}건</p></div>
                    <div className="rounded-admin-sm bg-neutral-50 p-4 sm:col-span-2">
                      <p className="text-sm text-muted">긴급도 분포 (미완료)</p>
                      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                        <div><dt className="text-muted">초긴급</dt><dd className="mt-1 font-mono font-semibold">{data.operational.byUrgencyOpen.CRITICAL}건</dd></div>
                        <div><dt className="text-muted">긴급</dt><dd className="mt-1 font-mono font-semibold">{data.operational.byUrgencyOpen.URGENT}건</dd></div>
                        <div><dt className="text-muted">일반</dt><dd className="mt-1 font-mono font-semibold">{data.operational.byUrgencyOpen.NORMAL}건</dd></div>
                      </dl>
                    </div>
                  </div>
                </div>
              </Section>
              <Section title="접수 · 완료 추이" tip="선택 기간의 모든 KST 날짜를 포함하며, 접수 생성 시각과 완료 시각을 각각 KST 날짜로 집계합니다." updatedAt={updatedAt}>
                <div className="grid gap-6 xl:grid-cols-2">
                  <div><h3 className="mb-2 text-sm font-bold">접수</h3><LineChart label="접수 추이" data={data.trend.map((item) => ({ label: item.bucket, value: item.received }))} /></div>
                  <div><h3 className="mb-2 text-sm font-bold">완료</h3><LineChart label="완료 추이" data={data.trend.map((item) => ({ label: item.bucket, value: item.completed }))} /></div>
                </div>
              </Section>
              <Section title="처리 성능" tip="운영은 최초 제안 및 응답완료 제안, 고객은 접수 단위의 최종 수락을 기준으로 계산합니다." updatedAt={updatedAt}>
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="space-y-3">
                    <TimingStats title="운영 관점" description="최초 제안까지 시간·응답완료 제안 수락률" tip="접수 생성→최초 제안 시간입니다. 기간은 접수 생성 시각 기준입니다." stats={data.performance.op.firstOfferSec} />
                    <div className="rounded-admin-sm border border-border p-4">
                      <div className="flex items-center gap-2"><p className="text-sm text-muted">응답완료 제안 수락률</p><InfoTip text="응답 완료 제안 중 수락 비율 = ACCEPTED/(ACCEPTED+REJECTED), 응답시각 기준" /></div><p className="mt-1 font-mono text-xl font-bold">{percent(data.performance.op.offerAcceptRate)}</p><p className="mt-1 text-sm text-muted">수락 {data.performance.op.accepted} · 거절 {data.performance.op.rejected}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <TimingStats title="고객 관점" description="최종 수락까지 시간·접수 단위 성공률" tip="접수 생성→최종 수락(respondedAt), 접수당 1건이며 최종 수락 응답시각 기준입니다." stats={data.performance.cust.acceptSec} />
                    <div className="rounded-admin-sm border border-border p-4">
                      <div className="flex items-center gap-2"><p className="text-sm text-muted">접수 단위 성공률</p><InfoTip text="기간 내 생성된 접수 중 수락된 제안이 하나 이상 있는 접수의 비율입니다. 접수당 1건으로 계산합니다." /></div><p className="mt-1 font-mono text-xl font-bold">{percent(data.performance.cust.requestSuccessRate)}</p><p className="mt-1 text-sm text-muted">성공 접수 {data.performance.cust.requestsWithAccepted} / 전체 {data.performance.cust.totalRequests}</p>
                    </div>
                  </div>
                </div>
              </Section>
              <Section id="money" title="돈 흐름" tip="설문 결제는 제출된 설문만 제출 시각 KST에 귀속하며, 수수료는 적립 시각 KST에 귀속하고 PENDING과 PAID를 별도로 집계합니다." updatedAt={updatedAt}>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-admin-sm bg-neutral-50 p-4"><p className="text-sm text-muted">설문 결제 합계</p><p className="mt-1 font-mono text-lg font-bold">{won(data.money.surveyPaid.sum)}</p></div>
                  <div className="rounded-admin-sm bg-neutral-50 p-4"><p className="text-sm text-muted">설문 결제 건수</p><p className="mt-1 font-mono text-lg font-bold">{data.money.surveyPaid.count}건</p></div>
                  <div className="rounded-admin-sm bg-neutral-50 p-4"><p className="text-sm text-muted">설문 결제 평균</p><p className="mt-1 font-mono text-lg font-bold">{won(data.money.surveyPaid.avg)}</p></div>
                  <div className="rounded-admin-sm border border-border p-4"><p className="text-sm text-muted">수수료 PENDING</p><p className="mt-1 font-mono text-lg font-bold">{won(data.money.commission.PENDING)}</p></div>
                  <div className="rounded-admin-sm border border-border p-4"><p className="text-sm text-muted">수수료 PAID</p><p className="mt-1 font-mono text-lg font-bold">{won(data.money.commission.PAID)}</p></div>
                </div>
              </Section>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
export default function AnalyticsDashboard() {
  const [period, setPeriod] = useState<Period>('week');
  const isLg = useLgViewport();

  return <AnalyticsDashboardData key={period} period={period} setPeriod={setPeriod} isLg={isLg} />;
}
