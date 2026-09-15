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
import { SEONGNAM_GU, getSeongnamGu } from '@/lib/seongnamDistricts';
import { getAreaPartnerStats } from '@/lib/areaStats';
import { getAreaServiceSchema, getFaqPageSchema, getWebPageGraph } from '@/lib/schema';
import { formatKoreanDate } from '@/lib/pageDates';

const SIDO = '경기도';
const SIGUNGU = '성남시';
const CITY_PATH = '/areas/seongnam';

// 3개 구를 빌드 시 정적으로 생성하고, 그 외 slug 는 404.
export const dynamicParams = false;
export function generateStaticParams() {
  return SEONGNAM_GU.map((g) => ({ gu: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ gu: string }> }): Promise<Metadata> {
  const { gu } = await params;
  const d = getSeongnamGu(gu);
  if (!d) return {};
  return {
    title: d.title,
    description: d.description,
    alternates: { canonical: `${CITY_PATH}/${d.slug}` },
  };
}

const URGENCY = [
  { level: '초긴급', target: '1시간 내 응대 목표', desc: '정전, 누전, 타는 냄새·스파크처럼 즉시 위험한 상황' },
  { level: '긴급', target: '2시간 내 응대 목표', desc: '일부 회로 정전, 차단기 반복, 냉장고·에어컨 전원 불량' },
  { level: '일반', target: '순차 처리', desc: '콘센트·스위치 교체, 조명 교체, 점검 요청' },
] as const;

export default async function SeongnamGuPage({ params }: { params: Promise<{ gu: string }> }) {
  const { gu } = await params;
  const d = getSeongnamGu(gu);
  if (!d) notFound();
  const path = `${CITY_PATH}/${d.slug}`;
  // 시 페이지와 동일: 빌드(DB 없음)·런타임 DB 장애 시 집계 줄만 생략한다.
  let stats: Awaited<ReturnType<typeof getAreaPartnerStats>> | null = null;
  try {
    stats = await getAreaPartnerStats(SIDO, SIGUNGU);
  } catch {
    stats = null;
  }
  const siblings = SEONGNAM_GU.filter((g) => g.slug !== d.slug);
  const tel = `tel:${COMPANY.tel.replace(/-/g, '')}`;

  return (
    <main className="min-h-screen pb-28 md:pb-12">
      <JsonLd
        data={getWebPageGraph({
          path,
          name: `성남 ${d.gu} 전기 수리 출동`,
          description: d.description,
          dateModified: d.updated,
          parents: [{ name: '성남 전기 수리 출동', path: CITY_PATH }],
        })}
      />
      <JsonLd
        data={getAreaServiceSchema({
          path,
          areaName: `성남시 ${d.gu}`,
          city: SIGUNGU,
          sido: SIDO,
          name: `성남 ${d.gu} 전기 수리 출동 서비스`,
          description: d.description,
        })}
      />
      <JsonLd data={getFaqPageSchema(d.faq)} />
      <PageHeader
        title={`${d.gu} 출동 안내`}
        back={CITY_PATH}
        headingAs="p"
        crumbs={[
          { label: '홈', href: '/' },
          { label: '성남', href: CITY_PATH },
          { label: d.gu, href: path },
        ]}
      />

      <div className="mx-auto w-full max-w-2xl px-5 pt-6">
        <Surface tint as="section" className="rounded-2xl p-5">
          <p className="text-xs font-bold text-brand-600">
            경기도 성남시 {d.gu} · 전기 출동 중개 플랫폼 {COMPANY.siteDisplayUrl}
          </p>
          <h1 className="mt-2 text-2xl leading-tight font-extrabold text-fg md:text-3xl">{d.title.split(' · ')[0]}</h1>
          <p className="mt-2 text-base font-bold text-neutral-700">{d.title.split(' · ')[1]}</p>
          <p className="mt-3 text-sm leading-relaxed text-neutral-700">
            {COMPANY.name}는 성남시 {d.gu}의 정전·누전·두꺼비집·콘센트·조명 고장을 접수받아, 성남을 담당 지역으로
            등록한 승인 출동 업체와 전기기사에게 배정하는 중개 서비스입니다. 접수는 무료이고 수리비는 현장에서
            안내합니다.
          </p>
          <p className="mt-2 text-sm font-semibold text-brand-700">
            초긴급(정전·누전·타는 냄새)은 1시간 내, 긴급은 2시간 내 응대를 목표로 우선 배정합니다.
          </p>
          {stats && (
            <p className="mt-3 rounded-2xl bg-white/80 px-4 py-3 text-sm font-semibold text-fg">
              {stats.providers + stats.technicians > 0 ? (
                <>
                  지금 성남시를 담당하는 승인 파트너: 출동 업체 {stats.providers}곳 · 전기기사 {stats.technicians}명
                </>
              ) : (
                <>성남시 전담 파트너를 모집 중입니다. 접수 건은 관리자가 담당 가능한 업체를 확인해 배정합니다.</>
              )}
              <span className="mt-1 block text-xs font-normal text-muted">
                배정은 구가 아니라 성남시 단위로 이뤄집니다 · 경기도 전역·전 지역 담당 파트너 포함, 최대 1시간 전 집계
              </span>
            </p>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link href="/request/new" className={buttonClasses('primary', 'md', 'flex-1')}>
              {d.gu} 전기 고장 접수하기
            </Link>
            <a href={tel} className={buttonClasses('secondary', 'md', 'flex-1')}>
              전화 문의 {COMPANY.tel}
            </a>
          </div>
        </Surface>

        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-fg">
            <MapPinIcon className="h-5 w-5 text-brand-600" />
            {d.gu} 출동 지역
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-neutral-700">{d.dongs.join(' · ')}</p>
          <p className="mt-2 text-xs text-muted">주요 지점: {d.landmarks.join(' · ')}</p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-fg">{d.gu}의 주거·상권별 전기 환경</h2>
          <div className="mt-4 space-y-3">
            {d.areas.map((a) => (
              <Surface key={a.name} as="section" className="rounded-2xl p-4">
                <p className="font-bold text-fg">{a.name}</p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-700">{a.desc}</p>
              </Surface>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-fg">{d.gu}에서 먼저 의심할 고장</h2>
          <ul className="mt-4 space-y-2">
            {d.suspects.map((s) => (
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
          <h2 className="text-xl font-extrabold text-fg">자주 묻는 질문 — {d.gu}</h2>
          <div className="mt-3 space-y-2">
            {d.faq.map((item) => (
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
            {GUIDES.map((g) => (
              <li key={g.slug}>
                <Link href={`/guide/${g.slug}`} className="block rounded-2xl bg-white p-4 shadow-surface-sm transition hover:bg-neutral-50">
                  <p className="font-bold text-fg">{g.title}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <Surface tint as="section" className="mt-10 rounded-2xl p-5">
          <h2 className="text-lg font-extrabold text-fg">{d.gu} 전기 고장, 지금 접수하세요</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-700">
            증상·주소·긴급도를 남기면 성남 담당 파트너에게 배정하고 진행 상황을 문자로 알려 드립니다.
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

        <nav aria-label="성남 다른 구" className="mt-8 text-sm text-neutral-700">
          성남 다른 지역:{' '}
          <Link href={CITY_PATH} className="font-bold text-brand-700 underline">
            성남시 전체
          </Link>
          {siblings.map((g) => (
            <span key={g.slug}>
              {' · '}
              <Link href={`${CITY_PATH}/${g.slug}`} className="font-bold text-brand-700 underline">
                {g.gu}
              </Link>
            </span>
          ))}
        </nav>

        <p className="mt-6 text-xs text-muted">
          최종 수정일: {formatKoreanDate(d.updated)} · {COMPANY.name}는 시공 업체가 아닌 중개 플랫폼이며, 전북 군산의 동명
          전기용품 판매점과는 무관합니다.
        </p>
      </div>
    </main>
  );
}
