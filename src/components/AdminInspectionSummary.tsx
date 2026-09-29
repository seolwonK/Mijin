'use client';

// 관리자 대시보드의 "정기 전기점검" 요약 띠. 접수 요약(.metrics) 바로 아래에 놓인다.
// 데이터는 대시보드가 GET /api/admin/inspections 를 폴링해 넘겨준다 — 이 컴포넌트는 그리기만 한다.
import Link from 'next/link';
import { useMemo } from 'react';
import { TIME_SLOT_LABEL, formatPhone, formatShortDate } from '@/lib/inspection';
import { type InspectionSummaryInput, summarizeInspections } from '@/lib/adminInspectionSummary';
import queue from '@/components/admin-queue.module.css';
import styles from '@/components/admin-inspection-summary.module.css';

const INSPECTIONS = '/admin/inspections';
const SCHEDULE = `${INSPECTIONS}?tab=schedule`;
const PENDING = `${INSPECTIONS}?status=PENDING_PAYMENT`;
const DUES = `${INSPECTIONS}?tab=dues`;

const count = (value: number | null) => (value == null ? '—' : value.toLocaleString('ko-KR'));

function Metric({ href, label, value, note, attention, ariaLabel, title }: {
  href: string; label: string; value: number | null; note: string; attention?: boolean; ariaLabel: string; title?: string;
}) {
  return <Link href={href} className={queue.metric} data-attention={!!attention} aria-label={ariaLabel} title={title}>
    <span className={queue.metricLabel}>{label}</span>
    <span className={queue.metricMain}><strong>{count(value)}</strong><span>{note}</span></span>
  </Link>;
}

export default function AdminInspectionSummary({ data, error }: {
  data: InspectionSummaryInput | null; error?: string | null;
}) {
  const s = useMemo(() => (data ? summarizeInspections(data) : null), [data]);
  const loading = !s;
  const aria = (label: string, value: number | undefined, tail: string) =>
    loading ? `${label} 불러오는 중, ${tail}` : `${label} ${count(value ?? 0)}건, ${tail}`;
  const breakdown = s
    ? `미확정 ${count(s.unconfirmed)} · 지난 점검 ${count(s.overdue)} · 월 입금 ${count(s.duePayments)}`
    : '미확정 — · 지난 점검 — · 월 입금 —';
  // 처리할 일이 월 입금뿐이면 월 입금 탭으로 바로 보낸다.
  const actionHref = s && s.duePayments > 0 && s.duePayments === s.needsAction ? DUES : SCHEDULE;
  const actionTail = actionHref === DUES ? '월 입금 확인 보기' : '점검 일정 보기';

  return <section className={styles.band} aria-labelledby="inspection-summary-title">
    <div className={styles.head}>
      <h2 id="inspection-summary-title"><Link href={INSPECTIONS}>정기 전기점검</Link></h2>
      {s && <span className={styles.today}>{formatShortDate(data!.today)} 기준</span>}
    </div>
    <div className={styles.metrics}>
      <Metric href={PENDING} label="입금 대기" value={s?.pendingPayment ?? null} note="입금 확인 필요"
        ariaLabel={aria('입금 대기', s?.pendingPayment, '입금 대기 구독 보기')} />
      <Metric href={SCHEDULE} label="오늘 점검" value={s?.todayVisits ?? null} note="전화·방문 확정"
        ariaLabel={aria('오늘 점검', s?.todayVisits, '점검 일정 보기')} />
      <Metric href={SCHEDULE} label="이번 주 점검" value={s?.weekVisits ?? null} note="오늘 포함 7일"
        ariaLabel={aria('이번 주 점검', s?.weekVisits, '점검 일정 보기')} />
      <Metric href={actionHref} label="처리 필요" value={s?.needsAction ?? null} note={breakdown} title={breakdown}
        attention={!!s?.needsAction}
        ariaLabel={loading ? '처리 필요 불러오는 중, 점검 일정 보기' : `처리 필요 ${count(s.needsAction)}건(${breakdown}), ${actionTail}`} />
    </div>
    {s && <div className={styles.lists}>
      <div className={styles.group}>
        <span className={styles.groupLabel}>오늘 점검</span>
        {s.todayList.length ? <ul>{s.todayList.map(v => <li key={v.visitId} className={styles.chip}>
          <span>{TIME_SLOT_LABEL[v.timeSlot]}</span><strong>{v.contactName}</strong><span>{v.address}</span><span>{v.round}회차</span>{v.method === 'ONSITE' ? <strong>방문</strong> : <span>전화</span>}
        </li>)}{s.todayVisits > s.todayList.length && <li className={styles.more}><Link href={SCHEDULE}>외 {count(s.todayVisits - s.todayList.length)}건</Link></li>}</ul>
          : <p className={styles.empty}>오늘 예정된 점검이 없어요</p>}
      </div>
      <div className={styles.group}>
        <span className={styles.groupLabel}>최근 입금 대기</span>
        {s.recentPending.length ? <ul>{s.recentPending.map(p => <li key={p.planId} className={styles.chip}>
          <span>{formatShortDate(p.createdDate)} 신청</span><strong>{p.contactName}</strong><span className={styles.num}>{formatPhone(p.contactPhone)}</span>
        </li>)}</ul>
          : <p className={styles.empty}>입금 대기 신청이 없어요</p>}
      </div>
    </div>}
    {error && <p role="status" className={`${queue.pageError} ${styles.error}`}>{data ? '전기점검 현황을 갱신하지 못했습니다. 마지막 조회 결과입니다.' : '전기점검 현황을 불러오지 못했습니다. 새로고침해 주세요.'}</p>}
  </section>;
}
