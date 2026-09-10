'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { REGIONS, hasSigungu } from '@/lib/regions';
import type { RotationOverview } from '@/lib/rotationOverview';
import { usePolling } from '@/components/usePolling';
import { RefreshIcon, SearchIcon } from '@/components/icons';
import styles from './rotation.module.css';

type Candidate = {
  id: string;
  key: string;
  name: string;
  kind: 'PROVIDER' | 'TECHNICIAN';
  eggBalance: number;
  assigned30d: number;
  avgRating: number;
  reviewCount: number;
};
type RotationResponse = {
  candidates: Candidate[];
  meta: { chainLabel: string; eggApplied: boolean; criticalNotApplied: boolean; distanceTieUnresolved: boolean };
};
type Region = { sido: string; sigungu: string };
const STORAGE_KEY = 'mijin.admin.rotation.region';
const PAGE_SIZE = 25;
const REGION_NAMES: Record<string, string> = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주',
  대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종', 경기도: '경기', 강원특별자치도: '강원',
  충청북도: '충북', 충청남도: '충남', 전북특별자치도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주특별자치도: '제주',
};
const number = (value: number | undefined) => value === undefined ? '—' : value.toLocaleString('ko-KR');
const kindName = (candidate: Candidate) => candidate.kind === 'PROVIDER' ? '업체' : '전기기사';
const detailHref = (candidate: Candidate) => `/admin/${candidate.kind === 'PROVIDER' ? 'providers' : 'technicians'}/${encodeURIComponent(candidate.id)}`;

function readSavedRegion() { try { return sessionStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; } }
function subscribeRegion(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener('rotation:region', listener);
  return () => { window.removeEventListener('storage', listener); window.removeEventListener('rotation:region', listener); };
}
function parseRegion(params: URLSearchParams): Region | null {
  const sido = params.get('sido') ?? '';
  const sigungu = params.get('sigungu') ?? '';
  return Object.hasOwn(REGIONS, sido) && (!sigungu || REGIONS[sido].includes(sigungu)) ? { sido, sigungu } : null;
}
function Rating({ candidate }: { candidate: Candidate }) {
  return <span className={styles.rating}>{candidate.reviewCount ? <><strong>{candidate.avgRating.toFixed(1)}</strong><span>후기 {number(candidate.reviewCount)}건</span></> : <span>후기 없음</span>}</span>;
}
function ErrorNotice({ message, stale, retry }: { message: string; stale?: boolean; retry: () => void }) {
  return <div className={styles.error} role="alert"><div><strong>{stale ? '최근 조회한 자료를 표시하고 있습니다.' : '정보를 불러오지 못했습니다.'}</strong><p>{message}</p></div><button type="button" className={styles.button} onClick={retry}>다시 시도</button></div>;
}

function RotationBoard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const savedRegion = useSyncExternalStore(subscribeRegion, readSavedRegion, () => '');
  const overview = usePolling<RotationOverview>('/api/admin/rotation?view=overview', 60_000);
  const selected = parseRegion(new URLSearchParams(searchParams.toString()))
    ?? parseRegion(new URLSearchParams(savedRegion))
    ?? overview.data?.recommended
    ?? null;
  const sido = selected?.sido ?? '';
  const sigungu = selected?.sigungu ?? '';
  const queryUrl = sido ? `/api/admin/rotation?sido=${encodeURIComponent(sido)}&sigungu=${encodeURIComponent(sigungu)}` : null;
  const ranking = usePolling<RotationResponse>(queryUrl, 30_000);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('ALL');
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!sido) return;
    const saved = new URLSearchParams({ sido, sigungu }).toString();
    try {
      if (readSavedRegion() !== saved) {
        sessionStorage.setItem(STORAGE_KEY, saved);
        window.dispatchEvent(new Event('rotation:region'));
      }
    } catch { /* URL state remains available if browser storage is disabled. */ }
    const current = new URLSearchParams(searchParams.toString());
    if (current.get('sido') === sido && current.get('sigungu') === sigungu) return;
    current.set('sido', sido); current.set('sigungu', sigungu);
    router.replace(`/admin/rotation?${current}`, { scroll: false });
  }, [sido, sigungu, router, searchParams]);

  function selectRegion(next: Region) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('sido', next.sido); params.set('sigungu', next.sigungu);
    setQuery(''); setKind('ALL'); setPage(1);
    router.replace(`/admin/rotation?${params}`, { scroll: false });
  }
  function selectSido(value: string) {
    if (!value || value === sido) return;
    selectRegion({ sido: value, sigungu: overview.data?.regions.find(region => region.sido === value)?.recommendedSigungu ?? REGIONS[value][0] ?? '' });
  }
  function changePage(value: number) {
    setPage(value);
    requestAnimationFrame(() => document.getElementById('rotation-ranking-title')?.scrollIntoView({ block: 'start' }));
  }
  async function refreshAll() {
    setRefreshing(true);
    try { await Promise.allSettled([overview.refresh(), ranking.refresh()]); } finally { setRefreshing(false); }
  }

  const candidates = ranking.data?.candidates ?? [];
  const rows = useMemo(() => (ranking.data?.candidates ?? []).map((candidate, index) => ({ ...candidate, rank: index + 1 }))
    .filter(candidate => (kind === 'ALL' || candidate.kind === kind) && candidate.name.toLowerCase().includes(query.trim().toLowerCase())), [ranking.data, query, kind]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const first = candidates[0];
  const selectedOverview = overview.data?.regions.find(region => region.sido === sido);
  const districtLabel = sigungu || (hasSigungu(sido) ? '시/도 공통 담당' : '전 지역');
  const totals = overview.data?.totals;
  const providers = candidates.filter(candidate => candidate.kind === 'PROVIDER').length;
  const technicians = candidates.length - providers;

  return <main className={styles.main}>
    <header className={styles.header}>
      <div><div className={styles.titleRow}><h1>순환 현황</h1><span>지역별 배정 순위</span></div><p>지역을 고르면 배정 대상과 우선순위를 바로 비교할 수 있습니다.</p></div>
      <div className={styles.headerActions}>
        {ranking.lastUpdatedAt && <time dateTime={new Date(ranking.lastUpdatedAt).toISOString()}>{new Date(ranking.lastUpdatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })} 조회</time>}
        <button type="button" className={styles.button} onClick={refreshAll} disabled={refreshing}><RefreshIcon />{refreshing ? '조회 중…' : '새로고침'}</button>
      </div>
    </header>

    <section className={styles.overview} aria-label="전국 배정 대상 요약">
      <div className={styles.overviewTitle}><span>전국 배정 대상</span><strong>{number(totals?.candidates)}<small>곳 / 명</small></strong></div>
      <dl><div><dt>업체</dt><dd>{number(totals?.providers)}<small>곳</small></dd></div><div><dt>전기기사</dt><dd>{number(totals?.technicians)}<small>명</small></dd></div><div><dt>알 보유 대상</dt><dd>{number(totals?.withEggs)}<small>곳 / 명</small></dd></div></dl>
      <p>활성·승인 완료 기준<br />전기기사는 계약 확정 포함</p>
    </section>
    {overview.error && <ErrorNotice message={overview.error} stale={!!overview.data} retry={overview.refresh} />}

    <div className={styles.workspace}>
      <aside className={styles.regions} aria-label="지역별 배정 대상">
        <div className={styles.regionHeading}><h2>지역별 후보</h2><span>시/도 내 대상 수</span></div>
        <label className={styles.mobileRegion}>조회 지역<select aria-label="시/도 선택" value={sido} onChange={event => selectSido(event.target.value)}><option value="" disabled>지역 선택</option>{Object.keys(REGIONS).map(value => <option value={value} key={value}>{value} · {number(overview.data?.regions.find(region => region.sido === value)?.count)}</option>)}</select></label>
        <div className={styles.regionList} role="group" aria-label="시/도별 후보 수">
          {Object.keys(REGIONS).map(value => <button type="button" key={value} aria-pressed={sido === value} onClick={() => selectSido(value)}><span>{REGION_NAMES[value]}</span><span>{number(overview.data?.regions.find(region => region.sido === value)?.count)}</span></button>)}
        </div>
        <p className={styles.regionNote}>여러 지역을 담당하면 각 지역에 표시됩니다. 전국 합계는 중복을 제외합니다.</p>
      </aside>

      <section className={styles.board} aria-label="선택 지역 순환 순위">
        <div className={styles.boardHeader}>
          <div><span className={styles.eyebrow}>일반·긴급 접수 기준</span><h2>{sido || '지역 현황을 불러오는 중'}{sido && <span>{districtLabel}</span>}</h2></div>
          <label className={styles.districtControl}>시/군/구<select aria-label="시/군/구 선택" value={sigungu} onChange={event => selectRegion({ sido, sigungu: event.target.value })} disabled={!sido || !hasSigungu(sido)}><option value="">{hasSigungu(sido) ? '시/도 공통 담당' : '전 지역'}</option>{(REGIONS[sido] ?? []).map(value => <option key={value} value={value}>{value} · {number(selectedOverview?.districts.find(district => district.sigungu === value)?.count)}</option>)}</select></label>
        </div>
        {sido && !sigungu && hasSigungu(sido) && <p className={styles.scopeNote}>시/도 전체를 담당하는 후보만 표시합니다. 특정 구 담당까지 보려면 시/군/구를 선택하세요.</p>}
        <div className={styles.limits}><p>참고 순위입니다. <strong>초긴급은 지역·알·거리 기준을 별도로 적용</strong>하며, 실제 접수에서는 거리와 이전 응답 이력에 따라 순서가 달라질 수 있습니다.</p><a href="#rotation-rules">순위 기준 보기 ↓</a></div>
        {ranking.error && <ErrorNotice message={ranking.error} stale={!!ranking.data} retry={ranking.refresh} />}

        {!ranking.data ? <div className={styles.loading} role="status">{ranking.error ? '다시 조회하거나 다른 지역을 선택해 주세요.' : !sido && overview.error ? '왼쪽 또는 위에서 조회할 지역을 선택해 주세요.' : '배정 대상과 순위를 불러오고 있습니다…'}<div aria-hidden="true" /><div aria-hidden="true" /><div aria-hidden="true" /></div> : <>
          {first ? <div className={styles.lead} aria-label="지역 1순위 후보">
            <div className={styles.leadRank}><span>참고 순위</span><strong>01</strong></div>
            <div className={styles.leadName}><span>{kindName(first)}</span><Link href={detailHref(first)}>{first.name}<span aria-hidden="true"> ↗</span></Link><p>{ranking.error ? '마지막 조회 기준' : '현재 조회 조건의 첫 번째 후보'}</p></div>
            <dl><div><dt>알 보유</dt><dd>{number(first.eggBalance)}<small>개</small></dd></div><div><dt>최근 30일 배정</dt><dd>{number(first.assigned30d)}<small>건</small></dd></div><div><dt>평점 / 후기</dt><dd><Rating candidate={first} /></dd></div></dl>
          </div> : <div className={styles.empty}><strong>이 지역의 배정 대상이 없습니다.</strong><p>다른 시/군/구를 확인하거나 업체·기사의 담당 지역과 승인 상태를 확인해 주세요.</p><div><Link href="/admin/providers">업체 관리 ↗</Link><Link href="/admin/technicians">전기기사 관리 ↗</Link></div></div>}

          <div className={styles.tableTools}><div><h3 id="rotation-ranking-title">전체 순위 <span>{number(candidates.length)}</span></h3><p>수락·거절 응답 건수 · 모든 지역의 최근 30일 활동 기준</p></div><div className={styles.searchField}><SearchIcon /><input type="search" aria-label="후보 이름 검색" placeholder="업체명 · 기사명 검색" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div></div>
          <div className={styles.filterBar}><div className={styles.kindFilter} role="group" aria-label="후보 구분">{[{ value: 'ALL', label: '전체', count: candidates.length }, { value: 'PROVIDER', label: '업체', count: providers }, { value: 'TECHNICIAN', label: '전기기사', count: technicians }].map(item => <button type="button" key={item.value} aria-pressed={kind === item.value} onClick={() => { setKind(item.value); setPage(1); }}>{item.label}<span>{item.count}</span></button>)}</div><span>검색·필터 후에도 원래 순번 유지</span></div>
          {visible.length ? <>
            <div className={styles.tableWrap}><table className={styles.table}><caption className="sr-only">지역별 배정 참고 순위</caption><thead><tr><th scope="col">순번</th><th scope="col">배정 대상</th><th scope="col">알 보유</th><th scope="col">30일 배정</th><th scope="col">평점 · 후기</th><th scope="col">관리</th></tr></thead><tbody>{visible.map(candidate => <tr key={candidate.key} data-first={candidate.rank === 1}><td><span className={styles.rank}>{String(candidate.rank).padStart(2, '0')}</span></td><td><span className={styles.kind}>{kindName(candidate)}</span><Link href={detailHref(candidate)} className={styles.name}>{candidate.name}</Link></td><td><strong className={candidate.eggBalance > 0 ? styles.eggCount : styles.value}>{number(candidate.eggBalance)}</strong><span className={styles.unit}>개</span></td><td><span className={styles.value}>{number(candidate.assigned30d)}</span><span className={styles.unit}>건</span></td><td><Rating candidate={candidate} /></td><td><Link href={detailHref(candidate)} className={styles.manage} aria-label={`${candidate.name} 관리 화면`}>상세 ↗</Link></td></tr>)}</tbody></table></div>
            <ol className={styles.mobileCandidates}>{visible.map(candidate => <li key={candidate.key}><span className={styles.rank}>{String(candidate.rank).padStart(2, '0')}</span><div><span className={styles.kind}>{kindName(candidate)}</span><Link href={detailHref(candidate)} className={styles.name}>{candidate.name} ↗</Link><dl><div><dt>알</dt><dd>{number(candidate.eggBalance)}개</dd></div><div><dt>30일 배정</dt><dd>{number(candidate.assigned30d)}건</dd></div><div><dt>평점</dt><dd>{candidate.reviewCount ? `${candidate.avgRating.toFixed(1)} · 후기 ${candidate.reviewCount}건` : '후기 없음'}</dd></div></dl></div></li>)}</ol>
          </> : candidates.length > 0 && <div className={styles.noResults} role="status">검색 조건에 맞는 후보가 없습니다.<button type="button" onClick={() => { setQuery(''); setKind('ALL'); setPage(1); }}>검색·필터 초기화</button></div>}
          {rows.length > 0 && <nav className={styles.pagination} aria-label="순환 후보 페이지"><span>{number((currentPage - 1) * PAGE_SIZE + 1)}–{number(Math.min(currentPage * PAGE_SIZE, rows.length))} / {number(rows.length)}</span><div><button className={styles.button} type="button" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}>이전</button><span>{currentPage} / {pageCount}</span><button className={styles.button} type="button" disabled={currentPage === pageCount} onClick={() => changePage(currentPage + 1)}>다음</button></div></nav>}
        </>}
        <section id="rotation-rules" className={styles.rules} aria-label="순위 결정 기준"><h3>순위는 이렇게 정해집니다</h3><ol><li><span>01</span><strong>알 보유량</strong><p>많은 순</p></li><li><span>02</span><strong>최근 30일 배정</strong><p>동률이면 적은 순</p></li><li><span>03</span><strong>평균 평점</strong><p>다시 동률이면 높은 순</p></li><li><span>04</span><strong>현장까지 거리</strong><p>실제 접수에서 비교</p></li></ol><p>해당 지역을 담당하는 후보 안에서 비교합니다. 후기 없는 후보의 순위 계산에는 기본값 3.0을 사용하며 실제 평점으로 표시하지 않습니다. 초긴급은 소재지가 같은 시/군/구인 후보 → 알 보유량 → 거리 순으로 비교하고, 수락·거절 횟수와 평점은 적용하지 않습니다.</p></section>
      </section>
    </div>
  </main>;
}

export default function AdminRotationPage() {
  return <Suspense fallback={<main className={styles.main}><h1>순환 현황</h1><p role="status">지역 현황을 불러오고 있습니다…</p></main>}><RotationBoard /></Suspense>;
}
