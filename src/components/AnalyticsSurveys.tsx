"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useConfirm } from '@/components/useConfirm';
import { readApiJson, requestError } from '@/lib/clientApi';
import styles from '@/components/admin-report.module.css';
import { usePolling } from '@/components/usePolling';
import type { SurveyFilter, SurveyListItem, SurveyOverview, SurveyQuery } from '@/lib/surveyAnalytics';

const filters: { value: SurveyFilter; label: string }[] = [
  { value: 'ALL', label: '전체' }, { value: 'SUBMITTED', label: '응답 완료' }, { value: 'PENDING', label: '미응답' },
];
const button = styles.button;
const number = (value: number) => value.toLocaleString('ko-KR');
const won = (value: number) => `${number(value)}원`;
const date = (value: string) => new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul' });
const rating = (survey: SurveyListItem) => survey.submittedAt && survey.rating != null ? `${survey.rating} / 5` : '—';

function Amount({ survey }: { survey: SurveyListItem }) {
  if (!survey.submittedAt) return <span className="text-muted" aria-label="미응답으로 금액 없음">—</span>;
  if (survey.paidAmount == null) return <span className="text-sm font-normal text-muted">금액 미입력</span>;
  return <span className="font-semibold tabular-nums">{won(survey.paidAmount)}</span>;
}

export default function AnalyticsSurveys() {
  const [query, setQuery] = useState<SurveyQuery>({ status: 'ALL', page: 1, q: '' });
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const sending = useRef(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const [confirm, confirmUI] = useConfirm('admin');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1_000); return () => clearInterval(timer); }, []);
  const params = new URLSearchParams({ status: query.status, page: String(query.page) });
  if (query.q) params.set('q', query.q);
  const { data, error, refresh } = usePolling<SurveyOverview>(`/api/admin/analytics/surveys?${params}`, 45_000);
  const list = data?.surveys;
  const loading = !data && !error;
  const summary = [
    { label: '전체 설문', value: data ? `${number(data.total)}건` : '—', note: '생성된 모든 설문' },
    { label: '응답 완료', value: data ? `${number(data.submitted)}건` : '—', note: `응답률 ${data?.responseRate == null ? '—' : `${(data.responseRate * 100).toFixed(1)}%`}` },
    { label: '미응답', value: data ? `${number(data.total - data.submitted)}건` : '—', note: '고객 응답 대기' },
    { label: '고객 입력 금액 합계', value: data ? won(data.paidStats.sum) : '—', note: data ? `${number(data.paidStats.count)}건 입력 · 평균 ${data.paidStats.avg == null ? '—' : won(Math.round(data.paidStats.avg))}` : '—' },
  ];
  async function reload() {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }

  async function resend(survey: SurveyListItem) {
    if (sending.current) return;
    sending.current = true;
    try {
      if (!await confirm({ title: '만족도 설문 재발송', message: `${survey.customerName} · ${survey.customerPhone}\n접수 ${survey.requestCode}의 설문 링크를 문자로 다시 보냅니다.`, confirmText: '재발송' })) return;
      setSendingId(survey.surveyId); setFeedback(null);
      const result = await readApiJson<{ simulated: boolean }>(await fetch(`/api/admin/analytics/surveys/${encodeURIComponent(survey.surveyId)}/resend`, { method:'POST', signal:AbortSignal.timeout(30_000) }));
      setFeedback({ message: result.simulated ? `${survey.requestCode} · 테스트 발송을 기록했습니다. 실제 문자는 전송하지 않았습니다.` : `${survey.requestCode} · 설문 문자 발송을 요청했습니다.`, error:false });
    } catch (error) { setFeedback({ message:requestError(error), error:true }); }
    finally { sending.current=false; setSendingId(null); await refresh(); }
  }
  function reminder(survey: SurveyListItem) {
    const delivery = survey.delivery;
    const recent = delivery && now-new Date(delivery.createdAt).getTime()<60_000;
    return <div>{!survey.submittedAt && <button type="button" className={button} disabled={!!sendingId || !!recent} onClick={()=>resend(survey)} aria-label={`${survey.requestCode} 설문 재발송`}>{sendingId===survey.surveyId?'발송 중…':recent?'1분 후 재발송':'설문 재발송'}</button>}
      {delivery && <p className={`${styles.delivery} ${delivery.status==='FAILED'?styles.deliveryError:''}`}>{delivery.status==='FAILED'?'발송 실패':delivery.status==='PENDING'?'발송 확인 중':delivery.simulated?'테스트 발송':'발송 요청 완료'}<br/><time dateTime={delivery.createdAt}>{new Date(delivery.createdAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</time></p>}
      {!delivery && survey.submittedAt && <span className="text-muted">—</span>}
    </div>;
  }

  return (
    <main className={styles.page}>
      <div>
        <div className={styles.header}>
          <div><h1>설문 현황</h1><p className="mt-2 leading-relaxed text-slate-600">설문별 응답 상태와 고객이 입력한 지불 금액을 확인합니다.</p></div>
          <button type="button" className={button} onClick={reload} disabled={loading || refreshing}>{refreshing ? '갱신 중…' : '새로고침'}</button>
        </div>

        <section aria-label="전체 설문 요약" className="mb-5 overflow-hidden rounded-lg border border-border bg-white">
          <div className="flex flex-wrap justify-between gap-2 border-b border-border px-4 py-3 text-xs text-muted">
            <p>전체 기간 기준</p><p>{data ? `마지막 갱신 ${new Date(data.updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : '불러오는 중'}</p>
          </div>
          <dl className="grid grid-cols-3 lg:grid-cols-4">{summary.map((metric, index) => (
            <div key={metric.label} className={`min-w-0 border-border p-3 sm:p-4 ${index < 3 ? 'border-b lg:border-b-0' : 'col-span-3 lg:col-span-1'} ${index < 2 ? 'border-r' : ''} ${index === 2 ? 'lg:border-r' : ''}`}>
              <dt className="text-muted">{metric.label}</dt><dd className="mt-2 break-all text-xl font-bold tabular-nums sm:text-2xl">{metric.value}</dd><dd className="mt-1 text-xs leading-relaxed text-muted">{metric.note}</dd>
            </div>
          ))}</dl>
        </section>

        <section aria-labelledby="survey-list-title" className={styles.section}>
          <div className="border-b border-border p-4">
            <h2 id="survey-list-title" className="text-base font-bold">설문 목록</h2>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div role="group" aria-label="설문 응답 상태" className="flex flex-wrap gap-1 rounded-admin-md bg-neutral-100 p-1">{filters.map(filter => (
                <button key={filter.value} type="button" aria-pressed={query.status === filter.value} onClick={() => setQuery({ ...query, status: filter.value, page: 1 })} className={`min-h-11 rounded-admin-sm px-3 text-sm font-semibold ${query.status === filter.value ? 'bg-[#f1ca50] text-[#302b18]' : 'text-slate-600 hover:bg-white'}`}>{filter.label}</button>
              ))}</div>
              <form className="flex w-full gap-2 sm:w-auto" role="search" onSubmit={e => { e.preventDefault(); setQuery({ ...query, q: search.trim(), page: 1 }); }}>
                <label htmlFor="survey-search" className="sr-only">접수번호·고객명·전화번호 검색</label>
                <input id="survey-search" type="search" value={search} onChange={e => setSearch(e.target.value)} maxLength={100} placeholder="접수번호·고객명·전화번호" className="min-h-11 min-w-0 flex-1 rounded-admin-md border border-border px-3 text-base sm:w-64 sm:text-sm" />
                <button type="submit" className={button}>검색</button>
              </form>
            </div>
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted">
              <p role="status">{list ? `${filters.find(f => f.value === query.status)?.label} ${number(list.total)}건 · 최신 생성순` : loading ? '설문을 불러오는 중…' : '목록을 불러오지 못했습니다.'}</p>
              <p>고객 입력 금액은 설문에 작성한 지불 금액입니다.</p>
            </div>
            {query.q && <div className="mt-2 flex items-center gap-3 text-sm"><span className="min-w-0 break-all">검색: {query.q}</span><button type="button" className="min-h-11 shrink-0 text-muted underline" onClick={() => { setSearch(''); setQuery({ ...query, q: '', page: 1 }); }}>검색 해제</button></div>}
          </div>

          {feedback && <div role={feedback.error?'alert':'status'} className={feedback.error?styles.error:styles.feedback}>{feedback.message}</div>}
          {error && <div role="alert" className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-admin-md border border-red-200 bg-red-50 p-4"><p className="text-red-800">{data ? '최신 정보를 불러오지 못했습니다. 마지막 조회 결과입니다.' : '설문 목록을 불러오지 못했습니다.'}<span className="mt-1 block text-sm">{error}</span></p><button type="button" className={button} onClick={reload} disabled={refreshing}>다시 시도</button></div>}
          {loading && <p className="p-8 text-center text-muted">설문을 불러오는 중…</p>}
          {list && (list.items.length ? <>
            <div className={`${styles.tableWrap} ${styles.surveyScroll}`} tabIndex={0} role="region" aria-label="설문 목록 스크롤">
              <table className={`${styles.table} ${styles.surveyTable}`}>
                <caption className="sr-only">설문별 응답 상태와 고객 입력 금액</caption>
                <colgroup><col style={{width:'13%'}}/><col style={{width:'17%'}}/><col style={{width:'11%'}}/><col style={{width:'15%'}}/><col style={{width:'8%'}}/><col style={{width:'18%'}}/><col style={{width:'18%'}}/></colgroup>
                <thead><tr>{['접수번호','고객','응답 상태','고객 입력 금액','평점','설문 생성 / 응답','문자 발송'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
                <tbody>{list.items.map(survey=><tr key={survey.surveyId}>
                  <td><Link href={`/admin/requests/${survey.requestId}`} className={styles.rowLink}>{survey.requestCode}</Link></td>
                  <td><p className="font-medium">{survey.customerName}</p><a href={`tel:${survey.customerPhone}`} className="mt-1 inline-block text-xs text-muted underline underline-offset-2">{survey.customerPhone}</a></td>
                  <td><span className={survey.submittedAt?'font-medium':'text-muted'}>{survey.submittedAt?'응답 완료':'미응답'}</span></td>
                  <td><Amount survey={survey}/></td><td className="tabular-nums">{rating(survey)}</td>
                  <td><time className="text-xs text-muted" dateTime={survey.createdAt}>{date(survey.createdAt)}</time><small>{survey.submittedAt?`응답 ${date(survey.submittedAt)}`:`${survey.elapsedDays}일 경과`}</small></td>
                  <td>{reminder(survey)}</td>
                </tr>)}</tbody>
              </table>
            </div>
            <ul aria-label="모바일 설문 목록" className="divide-y divide-border md:hidden">{list.items.map(survey => (
              <li key={survey.surveyId} className="p-4">
                <div className="flex items-center justify-between gap-3"><Link href={`/admin/requests/${survey.requestId}`} className="min-w-0 break-all py-2 font-medium text-admin-cyan-ink underline">{survey.requestCode}</Link><span className="shrink-0 text-xs text-muted">{survey.submittedAt ? '응답 완료' : '미응답'}</span></div>
                <p className="mt-1 break-words font-semibold">{survey.customerName}</p><a href={`tel:${survey.customerPhone}`} className="inline-flex min-h-11 items-center text-sm text-muted underline">{survey.customerPhone}</a>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted">고객 입력 금액</dt><dd><Amount survey={survey} /></dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted">평점</dt><dd>{rating(survey)}</dd></div>
                  <div className="flex flex-wrap justify-between gap-2 text-xs"><dt className="text-muted">설문 생성일</dt><dd>{date(survey.createdAt)}</dd></div>
                  <div className="flex flex-wrap justify-between gap-2 text-xs"><dt className="text-muted">{survey.submittedAt ? '응답일' : '경과일'}</dt><dd>{survey.submittedAt ? date(survey.submittedAt) : `${survey.elapsedDays}일 경과`}</dd></div>
                </dl>
                <div className="mt-4 border-t border-border pt-3">{reminder(survey)}</div>
              </li>
            ))}</ul>
          </> : <p className="p-10 text-center text-muted">{query.q ? '검색 조건에 맞는 설문이 없습니다.' : query.status === 'ALL' ? '아직 생성된 설문이 없습니다.' : query.status === 'SUBMITTED' ? '응답 완료된 설문이 없습니다.' : '미응답 설문이 없습니다.'}</p>)}

          {list && list.total > 0 && <nav aria-label="설문 목록 페이지" className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-4">
            <p className="text-xs text-muted">{number((list.page - 1) * list.pageSize + 1)}–{number((list.page - 1) * list.pageSize + list.items.length)} / {number(list.total)}건</p>
            <div className="flex items-center gap-2"><button type="button" className={button} disabled={list.page <= 1} onClick={() => setQuery({ ...query, page: list.page - 1 })}>이전</button><span className="px-1 text-xs tabular-nums">{number(list.page)} / {number(list.pageCount)}</span><button type="button" className={button} disabled={!list.hasNext} onClick={() => setQuery({ ...query, page: list.page + 1 })}>다음</button></div>
          </nav>}
        </section>
      </div>
      {confirmUI}
    </main>
  );
}
