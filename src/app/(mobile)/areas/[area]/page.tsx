import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import Surface from '@/components/Surface';
import JsonLd from '@/components/JsonLd';
import { buttonClasses } from '@/components/Button';
import { ClockIcon, MapPinIcon, WonIcon } from '@/components/icons';
import { COMPANY } from '@/lib/company';
import { GUIDES } from '@/lib/guides';
import { REGION_PAGES, getRegionPage, withEul } from '@/lib/regionPages';
import { getAreaPartnerStats } from '@/lib/areaStats';
import { AREAS_PATH, MIN_PARTNERS_TO_SHOW } from '@/lib/areas';
import { getAreaServiceSchema, getFaqPageSchema, getWebPageGraph } from '@/lib/schema';
import { formatKoreanDate } from '@/lib/pageDates';

// 성남(구 하위 페이지 보유)을 제외한 시·구·생활권 페이지. 데이터는 src/lib/regionPages.ts.
export const dynamicParams = false;
export function generateStaticParams() {
  return REGION_PAGES.map((r) => ({ area: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ area: string }> }): Promise<Metadata> {
  const { area } = await params;
  const r = getRegionPage(area);
  if (!r) return {};
  return {
    title: `${r.shortName} 전기수리·누전 점검·차단기 교체`,
    description: r.description,
    alternates: { canonical: `${AREAS_PATH}/${r.slug}` },
  };
}

const URGENCY = [
  { level: '초긴급', target: '1시간 내 응대 목표', desc: '정전, 누전, 타는 냄새·스파크처럼 즉시 위험한 상황' },
  { level: '긴급', target: '2시간 내 응대 목표', desc: '일부 회로 정전, 차단기 반복, 냉장고·에어컨 전원 불량' },
  { level: '일반', target: '순차 처리', desc: '콘센트·스위치 교체, 조명 교체, 점검 요청' },
] as const;

export default async function RegionAreaPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params;
  const r = getRegionPage(area);
  if (!r) notFound();
  const path = `${AREAS_PATH}/${r.slug}`;
  const tel = `tel:${COMPANY.tel.replace(/-/g, '')}`;

  // 단일 관할 지역만 집계(여러 관할 생활권은 중복 집계를 피해 생략). 빌드(DB 없음)·장애 시엔 줄만 생략(홈 ReviewSection 패턴).
  let stats: Awaited<ReturnType<typeof getAreaPartnerStats>> | null = null;
  if (r.statsKeys.length === 1) {
    try {
      stats = await getAreaPartnerStats(r.statsKeys[0].sido, r.statsKeys[0].sigungu);
    } catch {
      stats = null;
    }
  }

  return (
    <main className="min-h-screen pb-28 md:pb-12">
      <JsonLd
        data={getWebPageGraph({
          path,
          name: `${r.shortName} 전기 수리 출동`,
          description: r.description,
          dateModified: r.updated,
          parents: [{ name: '지역별 전기 수리 출동 안내', path: AREAS_PATH }],
        })}
      />
      <JsonLd
        data={getAreaServiceSchema({
          path,
          areaName: r.name,
          sido: r.sido,
          name: `${r.shortName} 전기 수리 출동 서비스`,
          description: r.description,
          jurisdictions: r.jurisdictions,
        })}
      />
      <JsonLd data={getFaqPageSchema(r.faq)} />
      <PageHeader
        title={`${r.shortName} 출동 안내`}
        back={AREAS_PATH}
        headingAs="p"
        crumbs={[
          { label: '홈', href: '/' },
          { label: '지역', href: AREAS_PATH },
          { label: r.shortName, href: path },
        ]}
      />

      <div className="mx-auto w-full max-w-2xl px-5 pt-6">
        <Surface tint as="section" className="rounded-2xl p-5">
          <p className="text-xs font-bold text-brand-600">
            전국 전기 출동 중개 플랫폼 {COMPANY.siteDisplayUrl} · {r.eyebrow}
          </p>
          <h1 className="mt-2 text-2xl leading-tight font-extrabold text-fg md:text-3xl">{r.title.split(' · ')[0]}</h1>
          <p className="mt-2 text-base font-bold text-neutral-700">{r.title.split(' · ')[1]}</p>
          <p className="mt-3 text-sm leading-relaxed text-neutral-700">
            {COMPANY.name}는 전국 시/군/구 단위로 전기 고장을 접수받는 중개 플랫폼이며, {withEul(r.name)} 우선 집중 지역으로
            운영합니다. 정전·누전·두꺼비집·콘센트·조명 고장을 접수하면 {withEul(r.name)} 담당하는 승인 출동 업체·전기기사에게
            배정합니다. 접수는 무료이고 수리비는 현장에서 안내합니다.
          </p>
          <p className="mt-2 text-sm font-semibold text-brand-700">
            초긴급(정전·누전·타는 냄새)은 1시간 내, 긴급은 2시간 내 응대를 목표로 우선 배정합니다.
          </p>
          {stats && stats.providers + stats.technicians >= MIN_PARTNERS_TO_SHOW && (
            <p className="mt-3 rounded-2xl bg-white/80 px-4 py-3 text-sm font-semibold text-fg">
              지금 {withEul(r.name)} 담당하는 승인 파트너: 출동 업체 {stats.providers}곳 · 전기기사 {stats.technicians}명
              <span className="mt-1 block text-xs font-normal text-muted">
                {r.sido} 전역·전 지역 담당 파트너 포함, 최대 1시간 전 집계
              </span>
            </p>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link href="/request/new" className={buttonClasses('primary', 'md', 'flex-1')}>
              {r.shortName} 전기 고장 접수하기
            </Link>
            <a href={tel} className={buttonClasses('secondary', 'md', 'flex-1')}>
              전화 문의 {COMPANY.tel}
            </a>
          </div>
        </Surface>

        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-fg">
            <MapPinIcon className="h-5 w-5 text-brand-600" />
            {r.name} 출동 지역
          </h2>
          <p className="mt-1 text-xs text-muted">{r.note}</p>
          <p className="mt-3 text-sm leading-relaxed text-neutral-700">{r.dongs.join(' · ')}</p>
          <p className="mt-2 text-xs text-muted">주요 지점: {r.landmarks.join(' · ')}</p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-fg">{r.name}의 주거·상권별 전기 환경</h2>
          <div className="mt-4 space-y-3">
            {r.areas.map((a) => (
              <Surface key={a.name} as="section" className="rounded-2xl p-4">
                <p className="font-bold text-fg">{a.name}</p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-700">{a.desc}</p>
              </Surface>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-fg">{r.shortName}에서 먼저 의심할 고장</h2>
          <ul className="mt-4 space-y-2">
            {r.suspects.map((s) => (
              <li key={s.key}>
                <Link
                  href={`/request/new?symptom=${s.key}`}
                  className="block rounded-2xl bg-white p-4 shadow-surface-sm transition hover:bg-neutral-50"
                >
                  <p className="font-bold text-fg">{s.symptom}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{s.why}</p>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            그 밖의 증상은{' '}
            <Link href="/request/new" className="font-bold text-brand-700 underline">
              고장 접수
            </Link>
            에서 직접 선택할 수 있습니다.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-fg">
            <ClockIcon className="h-5 w-5 text-brand-600" />
            얼마나 빨리 오나요
          </h2>
          <ul className="mt-4 space-y-2">
            {URGENCY.map((u) => (
              <li key={u.level} className="flex gap-3 rounded-2xl bg-neutral-50 p-4">
                <span className="shrink-0 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white">{u.level}</span>
                <div>
                  <p className="text-sm font-bold text-fg">{u.target}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{u.desc}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            접수 시 긴급도를 직접 선택합니다. 실제 배정 시간은 {r.name} 담당 파트너의 당시 현황에 따라 달라질 수 있습니다.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-fg">
            <WonIcon className="h-5 w-5 text-brand-600" />
            비용
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-neutral-700">
            접수·조회는 무료이며 정찰 요금표는 없습니다. 배정된 업체가 현장에서 원인을 확인한 뒤 출장·진단비, 자재비,
            작업비, 야간·휴일 할증을 안내하고, 동의 후 작업하며 대금은 현장에서 직접 정산합니다.{' '}
            <Link href="/guide/jeongi-suri-biyong" className="font-bold text-brand-700 underline">
              비용이 정해지는 방식
            </Link>
            을 미리 읽어 두면 현장에서 견적을 판단하기 쉽습니다.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-fg">자주 묻는 질문 — {r.shortName}</h2>
          <div className="mt-3 space-y-2">
            {r.faq.map((item) => (
              <details key={item.q} className="rounded-2xl bg-neutral-50 p-4">
                <summary className="cursor-pointer font-bold text-fg">{item.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-fg">부르기 전에 읽어 보세요</h2>
          <ul className="mt-3 space-y-2">
            {GUIDES.filter((g) => g.featured).map((g) => (
              <li key={g.slug}>
                <Link href={`/guide/${g.slug}`} className="block rounded-2xl bg-white p-4 shadow-surface-sm transition hover:bg-neutral-50">
                  <p className="font-bold text-fg">{g.title}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <Surface tint as="section" className="mt-10 rounded-2xl p-5">
          <h2 className="text-lg font-extrabold text-fg">{r.shortName} 전기 고장, 지금 접수하세요</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-700">
            증상·주소·긴급도를 남기면 {r.name} 담당 파트너에게 배정하고 진행 상황을 문자로 알려 드립니다.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link href="/request/new" className={buttonClasses('primary', 'md', 'flex-1')}>
              고장 접수하기
            </Link>
            <a href={tel} className={buttonClasses('secondary', 'md', 'flex-1')}>
              전화 문의 {COMPANY.tel}
            </a>
          </div>
        </Surface>

        <nav aria-label="인접 지역" className="mt-8 text-sm text-neutral-700">
          <Link href={AREAS_PATH} className="font-bold text-brand-700 underline">
            지역 출동 안내
          </Link>
          {' · '}인접 지역:{' '}
          {r.neighbors.map((n, i) => (
            <span key={n.path}>
              {i > 0 && ' · '}
              <Link href={n.path} className="font-bold text-brand-700 underline">
                {n.label}
              </Link>
            </span>
          ))}
        </nav>

        <p className="mt-6 text-xs text-muted">
          최종 수정일: {formatKoreanDate(r.updated)} · {COMPANY.name}는 시공 업체가 아닌 중개 플랫폼이며, 전북 군산의 동명
          전기용품 판매점과는 무관합니다.
        </p>
      </div>
    </main>
  );
}
