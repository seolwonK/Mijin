'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import AdminDrawer from '@/components/AdminDrawer';
import MonthSelect from '@/components/MonthSelect';
import { usePolling } from '@/components/usePolling';
import { kstMonthString } from '@/lib/kst';
import type { SettlementReport, SettlementRow } from '@/lib/settlementReport';
import type { SettlementDetail } from '@/lib/settlementDetail';
import styles from '@/components/admin-report.module.css';

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const count = (value: number) => `${value.toLocaleString('ko-KR')}건`;
const date = (value: string) => new Date(value).toLocaleString('ko-KR', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
type Selection = { row: SettlementRow; month: string };

function SourceDetail({ selected, onClose }: { selected: Selection; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const { row, month } = selected;
  const kind = row.type === '업체' ? 'PROVIDER' : 'TECHNICIAN';
  const params = new URLSearchParams({ month, kind, payeeId:row.payeeId, page:String(page) });
  const { data, error, refresh } = usePolling<SettlementDetail>(`/api/admin/settlements?${params}`, 45_000);
  const listTop = useRef<HTMLParagraphElement>(null);
  function changePage(next: number) { setPage(next); listTop.current?.scrollIntoView({ block:'start' }); }
  return <AdminDrawer label={`${row.name} 정산 집계 상세`} className={styles.drawer} onClose={onClose}>
    <header className={styles.drawerHeader}><div><p>{month.replace('-', '년 ')}월 · {row.type}</p><h2>{row.name}</h2></div><button type="button" className={styles.button} onClick={onClose} autoFocus>닫기</button></header>
    <div className={styles.drawerBody}>
      {error && <div role="alert" className={styles.error}><p>{error}</p><button className={styles.button} onClick={refresh}>다시 시도</button></div>}
      {!data && !error && <p role="status" className={styles.state}>신고 내역을 불러오는 중…</p>}
      {data && <>
        <dl className={styles.summary}><div className={styles.metric}><dt>고객 신고 금액</dt><dd>{won(data.totalAmount)}</dd></div><div className={styles.metric}><dt>금액 입력</dt><dd>{count(data.aggregatedCount)}</dd></div><div className={styles.metric}><dt>금액 미입력</dt><dd>{count(data.missingCount)}</dd></div></dl>
        <p className={styles.note} ref={listTop} style={{ scrollMarginTop:110 }}>고객이 만족도 설문에 입력한 금액입니다. 응답일 기준으로 집계하며, 금액 미입력 건은 합계에서 제외합니다.</p>
        <div className={styles.pager}><strong>신고 원본 {count(data.total)}</strong><Link className={styles.rowLink} href={`/admin/${kind === 'PROVIDER' ? 'providers' : 'technicians'}/${encodeURIComponent(row.payeeId)}`}>{row.type} 정보 보기</Link></div>
        {data.items.length ? <ol className={styles.sourceList} aria-label="정산 신고 원본">{data.items.map(item => <li className={styles.source} key={item.surveyId}>
          <div className={styles.sourceTop}><Link href={`/admin/requests/${encodeURIComponent(item.requestId)}`}>접수 {item.requestCode} ↗</Link><strong>{item.paidAmount === null ? '금액 미입력' : won(item.paidAmount)}</strong></div>
          <p>{item.address || '작업 장소 미등록'}</p><p className={styles.description}>{item.description || '접수 내용 없음'}</p>
          <div className={styles.sourceMeta}><span>신고 고객 · {item.customerName}</span><span>응답 <time dateTime={item.submittedAt}>{date(item.submittedAt)}</time></span><span>평점 {item.rating === null ? '—' : `${item.rating} / 5`}</span></div>
        </li>)}</ol> : <p className={styles.state}>해당 월에 응답한 설문이 없습니다.</p>}
        {data.total > 0 && <nav aria-label="신고 원본 페이지" className={styles.pager}><span>{(data.page-1)*data.pageSize+1}–{(data.page-1)*data.pageSize+data.items.length} / {count(data.total)}</span><div className={styles.actions}><button className={styles.button} disabled={data.page <= 1} onClick={() => changePage(data.page-1)}>이전</button><span>{data.page} / {data.pageCount}</span><button className={styles.button} disabled={!data.hasNext} onClick={() => changePage(data.page+1)}>다음</button></div></nav>}
      </>}
    </div>
  </AdminDrawer>;
}

function SettlementSection({ title, rows, onSelect }: { title: '업체' | '전기기사'; rows: SettlementRow[]; onSelect: (row: SettlementRow) => void }) {
  const [sort, setSort] = useState<{key:'name'|'total';dir:1|-1}>({key:'total',dir:-1});
  const ordered = [...rows].sort((a,b) => (sort.key === 'name' ? a.name.localeCompare(b.name, 'ko') : a.total-b.total)*sort.dir);
  function toggle(key:'name'|'total') { setSort(current=>({key,dir:current.key===key&&current.dir===1?-1:1})); }
  return <section className={styles.section} aria-label={`${title} 집계`}>
    <header className={styles.sectionHeader}><h2>{title}<span>{rows.length}곳</span></h2><p>{won(rows.reduce((sum,row)=>sum+row.total,0))}</p></header>
    {!rows.length ? <p className={styles.state}>해당 기간 집계 데이터 없음</p> : <>
      <div className={styles.tableWrap}><table className={styles.table}><caption className="sr-only">{title}별 고객 신고 금액, 금액을 누르면 원본 조회</caption><thead><tr>
        <th scope="col" aria-sort={sort.key==='name'?(sort.dir===1?'ascending':'descending'):'none'}><button onClick={()=>toggle('name')}>대상 {sort.key==='name'?(sort.dir===1?'↑':'↓'):''}</button></th>
        <th scope="col" aria-sort={sort.key==='total'?(sort.dir===1?'ascending':'descending'):'none'}><button onClick={()=>toggle('total')}>고객 신고 금액 {sort.key==='total'?(sort.dir===1?'↑':'↓'):''}</button></th>
        <th scope="col">설문 응답</th><th scope="col">금액 입력</th><th scope="col">미입력</th><th scope="col">입력률</th>
      </tr></thead><tbody>{ordered.map(row=><tr key={row.payeeId}>
        <td><button className={styles.rowLink} onClick={()=>onSelect(row)} aria-label={`${row.name} 신고 내역 보기`}>{row.name}</button></td>
        <td><button className={styles.amountLink} onClick={()=>onSelect(row)} aria-label={`${row.name} ${won(row.total)} 원본 보기`}>{won(row.total)}</button></td><td>{count(row.completedCount)}</td><td>{count(row.aggregatedCount)}</td><td>{count(row.missingCount)}</td><td>{Math.round(row.coverage*100)}%</td>
      </tr>)}</tbody></table></div>
      <ul className={styles.mobileRows}>{ordered.map(row=><li className={styles.mobileRow} key={row.payeeId}><div><button className={styles.rowLink} onClick={()=>onSelect(row)} aria-label={`${row.name} 신고 내역 보기`}>{row.name}</button><button className={styles.amountLink} onClick={()=>onSelect(row)} aria-label={`${row.name} ${won(row.total)} 원본 보기`}>{won(row.total)}</button></div><p>응답 {count(row.completedCount)} · 금액 입력 {count(row.aggregatedCount)} · 미입력 {count(row.missingCount)}</p></li>)}</ul>
    </>}
  </section>;
}

export default function AdminSettlementsPage() {
  const [month,setMonth] = useState(()=>kstMonthString());
  const [selected,setSelected] = useState<Selection|null>(null);
  const trigger = useRef<HTMLElement|null>(null);
  const {data,error,refresh} = usePolling<SettlementReport>(`/api/admin/settlements?month=${month}`,45_000);
  const rows = data ? [...data.providers,...data.technicians] : [];
  const total = rows.reduce((sum,row)=>sum+row.total,0);
  const amounts = rows.reduce((sum,row)=>sum+row.aggregatedCount,0);
  function select(row:SettlementRow) { trigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setSelected({row,month}); }
  function close() { setSelected(null);requestAnimationFrame(()=>trigger.current?.focus({preventScroll:true})); }
  return <main className={styles.page}>
    <header className={styles.header}><div><h1>정산 집계 리포트</h1><p>업체·기사별 신고 금액부터 접수별 원본까지 확인합니다.</p></div><div className={styles.actions}><a className={styles.button} href={`/api/admin/settlements?month=${month}&format=csv`}>CSV 내보내기</a></div></header>
    <div className={styles.toolbar}><label>집계 월<MonthSelect value={month} onChange={value=>{setMonth(value);setSelected(null);}} ariaLabel="정산 월" className={styles.button}/></label><p className={styles.note}>설문 응답일 기준 · 이름이나 금액을 누르면 신고 내역이 열립니다.</p></div>
    <dl className={styles.summary} aria-label="월별 신고 요약"><div className={styles.metric}><dt>고객 신고 금액 합계</dt><dd>{data?won(total):'—'}</dd><dd className={styles.metricNote}>{month.replace('-','년 ')}월 응답 기준</dd></div><div className={styles.metric}><dt>금액 입력 설문</dt><dd>{data?count(amounts):'—'}</dd><dd className={styles.metricNote}>0원을 입력한 설문 포함</dd></div><div className={styles.metric}><dt>집계 대상</dt><dd>{data?`${rows.length}곳`:'—'}</dd><dd className={styles.metricNote}>업체 {data?.providers.length??'—'} · 전기기사 {data?.technicians.length??'—'}</dd></div></dl>
    {error&&<div role="alert" className={styles.error}><p>{data?'최신 집계를 불러오지 못했습니다. 마지막 조회 결과입니다.':error}</p><button className={styles.button} onClick={refresh}>다시 시도</button></div>}
    {!data&&!error&&<p role="status" className={styles.state}>집계를 불러오는 중…</p>}
    {data&&<div className={styles.sections}><SettlementSection title="업체" rows={data.providers} onSelect={select}/><SettlementSection title="전기기사" rows={data.technicians} onSelect={select}/></div>}
    <p className={styles.note} style={{marginTop:18}}>총액은 고객 신고 총수금액 참고치이며 세무/회계 확정치가 아닙니다. 미응답 설문은 집계에 포함되지 않습니다.</p>
    {selected&&<SourceDetail key={`${selected.month}:${selected.row.type}:${selected.row.payeeId}`} selected={selected} onClose={close}/>}
  </main>;
}
