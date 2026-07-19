'use client';

import InfoTip from '@/components/InfoTip';
import { useIsLg } from '@/components/useIsLg';
import { usePolling } from '@/components/usePolling';
import type { SurveyOverview } from '@/lib/surveyAnalytics';


function percent(value: number | null) {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`;
}

function won(value: number | null) {
  return value == null ? '—' : `${new Intl.NumberFormat('ko-KR').format(value)}원`;
}

function refreshTime(updatedAt?: string) {
  return updatedAt
    ? `마지막 갱신 ${new Date(updatedAt).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })}`
    : '마지막 갱신 —';
}

export default function AnalyticsSurveys() {
  const isLg = useIsLg();
  const { data, error } = usePolling<SurveyOverview>(
    isLg ? '/api/admin/analytics/surveys' : null,
    45_000,
  );

  return (
    <main className="min-h-screen bg-neutral-50 text-[14px] text-fg">
      <div className="p-4 lg:hidden">
        <p className="rounded-admin-md border border-border bg-white p-5 text-center text-sm text-muted">
          설문 현황은 데스크톱에서 이용할 수 있습니다.
        </p>
      </div>
      <div className="hidden lg:block">
        <div className="mx-auto max-w-7xl p-6">
          <div className="mb-6 flex items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold">설문 현황</h1>
              <p className="mt-1 text-sm text-muted">설문 응답과 미제출 현황, 결제 통계를 확인합니다.</p>
            </div>
            <span className="font-mono text-[11px] text-muted">{refreshTime(data?.updatedAt)}</span>
          </div>
          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
          {!data ? (
            <p className="rounded-admin-md border border-border bg-white p-6 text-sm text-muted">
              설문 데이터를 불러오는 중…
            </p>
          ) : (
            <div className="grid gap-5">
              <section className="rounded-admin-md border border-border bg-white p-5">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold">응답률</h2>
                  <InfoTip text="제출 설문 ÷ 발송 설문" />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-admin-sm bg-neutral-50 p-4">
                    <p className="text-sm text-muted">발송 대비 제출 비율</p>
                    <p className="mt-1 font-mono text-xl font-bold">{percent(data.responseRate)}</p>
                  </div>
                  <div className="rounded-admin-sm bg-neutral-50 p-4">
                    <p className="text-sm text-muted">제출 / 발송</p>
                    <p className="mt-1 font-mono text-xl font-bold">{data.submitted} / {data.total}건</p>
                  </div>
                </div>
              </section>

              <section className="rounded-admin-md border border-border bg-white p-5">
                <h2 className="text-base font-bold">미제출 목록</h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="border-b border-border text-muted">
                      <tr>
                        <th className="px-3 py-2 font-semibold">접수번호</th>
                        <th className="px-3 py-2 font-semibold">고객명</th>
                        <th className="px-3 py-2 font-semibold">전화</th>
                        <th className="px-3 py-2 text-right font-semibold">경과일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.pending.items.map((survey) => (
                        <tr key={survey.surveyId} className="border-b border-border last:border-0">
                          <td className="px-3 py-3 font-mono">{survey.requestCode}</td>
                          <td className="px-3 py-3">{survey.customerName}</td>
                          <td className="px-3 py-3"><a className="text-brand-600 underline" href={`tel:${survey.customerPhone}`}>{survey.customerPhone}</a></td>
                          <td className="px-3 py-3 text-right font-mono">{survey.elapsedDays}일</td>
                        </tr>
                      ))}
                      {data.pending.items.length === 0 && (
                        <tr><td colSpan={4} className="px-3 py-6 text-center text-muted">미제출 설문이 없습니다.</td></tr>
                      )}
                    </tbody>
                  </table>
                {data.pending.total > data.pending.items.length && (
                  <p className="mt-3 text-sm text-muted">
                    외 {data.pending.total - data.pending.items.length}건
                  </p>
                )}
                </div>
              </section>

              <section className="rounded-admin-md border border-border bg-white p-5">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold">결제 통계</h2>
                  <InfoTip text="제출된 설문만 집계" />
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div className="rounded-admin-sm bg-neutral-50 p-4"><p className="text-sm text-muted">합계</p><p className="mt-1 font-mono text-xl font-bold">{won(data.paidStats.sum)}</p></div>
                  <div className="rounded-admin-sm bg-neutral-50 p-4"><p className="text-sm text-muted">건수</p><p className="mt-1 font-mono text-xl font-bold">{data.paidStats.count}건</p></div>
                  <div className="rounded-admin-sm bg-neutral-50 p-4"><p className="text-sm text-muted">평균</p><p className="mt-1 font-mono text-xl font-bold">{won(data.paidStats.avg)}</p></div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
