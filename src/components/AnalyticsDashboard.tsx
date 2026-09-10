'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePolling } from '@/components/usePolling';
import type { DashboardStats } from '@/lib/analyticsStats';
import styles from '@/components/analytics-board.module.css';

const periods = [
  { key: 'day', label: '오늘' },
  { key: 'week', label: '최근 7일' },
  { key: 'month', label: '최근 30일' },
] as const;
type Period = (typeof periods)[number]['key'];
const number = (value: number) => value.toLocaleString('ko-KR');
const won = (value: number) => `${number(Math.round(value))}원`;
const dayLabel = (value: string) =>
  `${Number(value.slice(5, 7))}월 ${Number(value.slice(8, 10))}일`;

function Trend({ rows }: { rows: DashboardStats['trend'] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const active = rows.find((row) => row.bucket === selected) ?? rows.at(-1);
  const peak = Math.max(
    1,
    ...rows.flatMap((row) => [row.received, row.completed]),
  );
  return (
    <section className={styles.panel} aria-labelledby="trend-title">
      <header className={styles.panelHead}>
        <h2 id="trend-title">일별 접수와 완료</h2>
        <div className={styles.legend}>
          <span>
            <i />새 접수
          </span>
          <span>
            <i />
            작업 완료
          </span>
        </div>
      </header>
      <div className={styles.panelBody}>
        <p className={styles.muted}>
          같은 날짜의 두 막대를 비교하세요. 완료 건에는 이전에 접수된 작업도
          포함됩니다.
        </p>
        {!rows.length ? (
          <p className={styles.state}>표시할 기간 데이터가 없습니다.</p>
        ) : (
          <>
            <div className={styles.dayReadout}>
              <span>
                하루 최대{' '}
                {number(
                  peak === 1 &&
                    rows.every((row) => !row.received && !row.completed)
                    ? 0
                    : peak,
                )}
                건
              </span>
              <span>날짜를 누르면 정확한 건수를 확인할 수 있습니다.</span>
            </div>
            <div className={styles.chartScroll}>
              <div
                className={styles.chart}
                role="group"
                aria-label="일별 접수·완료 비교"
              >
                {rows.map((row) => (
                  <button
                    type="button"
                    key={row.bucket}
                    className={styles.day}
                    onClick={() => setSelected(row.bucket)}
                    aria-pressed={active?.bucket === row.bucket}
                    aria-label={`${dayLabel(row.bucket)} 새 접수 ${number(row.received)}건, 작업 완료 ${number(row.completed)}건`}
                  >
                    <span className={styles.bars} aria-hidden="true">
                      <span
                        className={styles.bar}
                        style={{ height: `${(row.received / peak) * 100}%` }}
                      />
                      <span
                        className={styles.bar}
                        style={{ height: `${(row.completed / peak) * 100}%` }}
                      />
                    </span>
                    <span className={styles.dayLabel}>
                      {rows.length > 10
                        ? row.bucket.slice(8)
                        : row.bucket.slice(5).replace('-', '.')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {active && (
              <p role="status" className={styles.dayReadout}>
                <strong>{dayLabel(active.bucket)}</strong>
                <span>
                  새 접수 {number(active.received)}건 · 작업 완료{' '}
                  {number(active.completed)}건
                </span>
              </p>
            )}
          </>
        )}
      </div>
      <details className={styles.details}>
        <summary>날짜별 수치 보기</summary>
        <table className={styles.dailyTable}>
          <caption className="sr-only">날짜별 접수와 완료 건수</caption>
          <thead>
            <tr>
              <th scope="col">날짜</th>
              <th scope="col">새 접수</th>
              <th scope="col">작업 완료</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.bucket}>
                <td>{row.bucket}</td>
                <td>{number(row.received)}건</td>
                <td>{number(row.completed)}건</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

export default function AnalyticsDashboard() {
  const [period, setPeriod] = useState<Period>('week');
  const [refreshing, setRefreshing] = useState(false);
  const { data, error, refresh } = usePolling<DashboardStats>(
    `/api/admin/analytics/dashboard?period=${period}`,
    45_000,
  );
  const received = data?.trend.reduce((sum, row) => sum + row.received, 0) ?? 0;
  const completed =
    data?.trend.reduce((sum, row) => sum + row.completed, 0) ?? 0;
  const statuses = data?.operational.byStatus;
  const awaiting = statuses?.RECEIVED ?? 0,
    assigned = statuses?.ASSIGNED ?? 0,
    active = (statuses?.ACCEPTED ?? 0) + (statuses?.DISPATCHED ?? 0);
  const first = data?.trend[0]?.bucket,
    last = data?.trend.at(-1)?.bucket;
  const range =
    first && last
      ? first === last
        ? `${first} · 한국 시간`
        : `${first} — ${last} · 오늘 포함`
      : '기간을 확인하는 중';
  async function reload() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>분석 현황</h1>
          <p>
            접수가 얼마나 들어오고, 작업이 얼마나 처리되고 있는지 확인합니다.
          </p>
        </div>
        <div className={styles.tools}>
          <span className={styles.updated}>
            {data
              ? `${new Date(data.updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })} 기준`
              : ''}
          </span>
          <button
            type="button"
            className={styles.button}
            disabled={refreshing}
            onClick={reload}
          >
            {refreshing ? '갱신 중…' : '새로고침'}
          </button>
        </div>
      </header>
      {error && (
        <div className={styles.error} role="alert">
          <p>
            {data
              ? '최신 수치를 불러오지 못했습니다. 마지막 조회 결과입니다.'
              : '분석 데이터를 불러오지 못했습니다.'}
          </p>
          <button
            className={styles.button}
            onClick={reload}
            disabled={refreshing}
          >
            다시 시도
          </button>
        </div>
      )}
      <section
        id="operational"
        className={styles.live}
        aria-label="현재 남은 업무"
      >
        <div className={styles.liveTitle}>
          <span>
            지금 남은 업무 · 전체 기간
            {data && (
              <small className={styles.urgentNote}>
                이 중 초긴급{' '}
                {number(data.operational.byUrgencyOpen.CRITICAL ?? 0)}건 · 긴급{' '}
                {number(data.operational.byUrgencyOpen.URGENT ?? 0)}건
              </small>
            )}
          </span>
          <strong>
            {data ? `${number(awaiting + assigned + active)}건` : '—'}
          </strong>
        </div>
        <div className={styles.liveCounts}>
          <Link href="/admin?tab=RECEIVED">
            배정 대기 <b>{data ? number(awaiting) : '—'}</b>
          </Link>
          <Link href="/admin?tab=ASSIGNED">
            수락 대기 <b>{data ? number(assigned) : '—'}</b>
          </Link>
          <Link href="/admin?tab=ACTIVE">
            출동·작업 중 <b>{data ? number(active) : '—'}</b>
          </Link>
        </div>
      </section>
      <div className={styles.periodBar}>
        <div>
          <h2>기간별 운영 실적</h2>
          <p>{range}</p>
        </div>
        <div className={styles.segment} role="group" aria-label="분석 기간">
          {periods.map((item) => (
            <button
              type="button"
              key={item.key}
              aria-pressed={period === item.key}
              onClick={() => setPeriod(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {!data && !error && (
        <p role="status" className={styles.state}>
          분석 데이터를 불러오는 중…
        </p>
      )}
      {data && (
        <>
          <dl className={styles.metrics} aria-label="선택 기간 요약">
            <div className={styles.metric}>
              <dt>새 접수</dt>
              <dd className={styles.value}>
                {number(received)}
                <small>건</small>
              </dd>
              <dd className={styles.note}>선택 기간에 들어온 모든 접수</dd>
            </div>
            <div className={styles.metric}>
              <dt>작업 완료</dt>
              <dd className={styles.value}>
                {number(completed)}
                <small>건</small>
              </dd>
              <dd className={styles.note}>선택 기간에 완료 처리된 작업</dd>
            </div>
            <div className={styles.metric}>
              <dt>담당자 수락 비율</dt>
              <dd className={styles.value}>
                {data.performance.cust.requestSuccessRate === null
                  ? '집계 없음'
                  : `${Math.round(data.performance.cust.requestSuccessRate * 100)}%`}
              </dd>
              <dd className={styles.note}>
                새 접수 {number(data.performance.cust.totalRequests)}건 중{' '}
                {number(data.performance.cust.requestsWithAccepted)}건 수락
              </dd>
            </div>
          </dl>
          <div className={styles.bodyGrid}>
            <Trend key={period} rows={data.trend} />
            <section className={styles.panel} aria-labelledby="paid-title">
              <header className={styles.panelHead}>
                <h2 id="paid-title">고객이 신고한 작업 금액</h2>
              </header>
              <div className={styles.panelBody}>
                <p className={styles.muted}>선택 기간에 제출된 설문 기준</p>
                <p className={styles.amount}>
                  {won(data.money.surveyPaid.sum)}
                </p>
                <dl>
                  <div className={styles.fact}>
                    <dt>금액 입력 설문</dt>
                    <dd>{number(data.money.surveyPaid.count)}건</dd>
                  </div>
                  <div className={styles.fact}>
                    <dt>건당 평균</dt>
                    <dd>
                      {data.money.surveyPaid.avg === null
                        ? '집계 없음'
                        : won(data.money.surveyPaid.avg)}
                    </dd>
                  </div>
                </dl>
                <p className={styles.muted} style={{ marginTop: 15 }}>
                  고객이 설문에 직접 입력한 금액입니다. 실제 입금·회계 확정액을
                  뜻하지 않습니다.
                </p>
                <Link className={styles.link} href="/admin/settlements">
                  월별 금액과 신고 원본 보기 ↗
                </Link>
              </div>
            </section>
          </div>
          <details className={styles.basis}>
            <summary>숫자는 어떤 기준으로 집계하나요?</summary>
            <ul>
              <li>
                지금 남은 업무는 기간 선택과 관계없이 현재 완료·취소되지 않은
                접수입니다.
              </li>
              <li>
                새 접수에는 이후 취소된 건도 포함합니다. 완료는 완료일
                기준이므로 새 접수 수와 직접 비교한 완료율은 표시하지 않습니다.
              </li>
              <li>
                담당자 수락 비율은 선택 기간에 들어온 접수 중 조회 시점까지
                수락된 배정이 있는 접수의 비율입니다.
              </li>
              <li>
                고객 신고 금액은 설문 응답일 기준이며, 0원은 포함하고 금액
                미입력 설문은 제외합니다.
              </li>
              <li>
                모든 날짜는 한국 시간 기준입니다. ‘최근 7일’과 ‘최근 30일’에는
                오늘이 포함됩니다.
              </li>
            </ul>
          </details>
        </>
      )}
    </main>
  );
}
