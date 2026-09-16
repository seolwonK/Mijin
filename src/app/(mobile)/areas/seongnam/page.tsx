import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import Surface from '@/components/Surface';
import JsonLd from '@/components/JsonLd';
import { buttonClasses } from '@/components/Button';
import { ClockIcon, MapPinIcon, ShieldIcon, WonIcon } from '@/components/icons';
import { COMPANY } from '@/lib/company';
import { SYMPTOM_ITEMS, LEAK_SYMPTOM } from '@/lib/symptoms';
import { GUIDES } from '@/lib/guides';
import { SEONGNAM_GU } from '@/lib/seongnamDistricts';
import { getAreaPartnerStats } from '@/lib/areaStats';
import { AREAS_PATH, MIN_PARTNERS_TO_SHOW } from '@/lib/areas';
import { getAreaServiceSchema, getFaqPageSchema, getWebPageGraph } from '@/lib/schema';
import { PAGE_UPDATED, formatKoreanDate } from '@/lib/pageDates';

const SIDO = '경기도';
const SIGUNGU = '성남시';
const PATH = '/areas/seongnam';

export const metadata: Metadata = {
  title: '성남 전기수리·누전 점검·차단기 교체',
  description:
    '성남시(분당구·수정구·중원구) 정전·누전·두꺼비집·콘센트·조명 고장을 무료로 접수하면 성남을 담당하는 승인 출동 업체·전기기사를 연결합니다. 초긴급 1시간 내 응대 목표, 수리비는 현장 견적·현장 정산.',
  alternates: { canonical: PATH },
};

// 구별 동 목록·특성은 src/lib/seongnamDistricts.ts(구 페이지와 공유).

const URGENCY = [
  { level: '초긴급', target: '1시간 내 응대 목표', desc: '정전, 누전, 타는 냄새·스파크처럼 즉시 위험한 상황' },
  { level: '긴급', target: '2시간 내 응대 목표', desc: '일부 회로 정전, 차단기 반복, 냉장고·에어컨 전원 불량' },
  { level: '일반', target: '순차 처리', desc: '콘센트·스위치 교체, 조명 교체, 점검 요청' },
] as const;

const FAQ = [
  {
    q: '성남시 어디까지 출동하나요?',
    a: '수정구·중원구·분당구 전 지역이 접수 대상입니다. 위례·판교·고등 신도시도 성남시 행정구역이면 같은 기준으로 배정합니다. 실제 출동 가능 시간은 성남을 담당하는 업체·전기기사 현황에 따라 달라집니다.',
  },
  {
    q: '분당 아파트인데 관리사무소가 아니라 여기로 접수해도 되나요?',
    a: '세대 안 두꺼비집(분전반) 이후의 배선·콘센트·조명은 세대 책임이라 전기기사가 처리합니다. 복도등·엘리베이터 같은 공용 설비나 여러 세대 동시 정전은 관리사무소에 먼저 알리세요.',
  },
  {
    q: '동네 전체가 정전인데도 접수하나요?',
    a: '동네 전체 정전은 한국전력 설비 문제이므로 한전 고객센터 123으로 문의하시면 됩니다. 우리 집만 정전이거나 차단기가 반복해서 내려갈 때 접수해 주세요.',
  },
  {
    q: '수리비는 얼마인가요?',
    a: '접수는 무료이고 정찰 요금표는 없습니다. 배정된 업체가 현장에서 원인을 확인한 뒤 비용을 안내하고, 동의 후 작업하며, 대금은 현장에서 업체와 직접 정산합니다. 비용 구조는 "전기 수리 출장 비용" 가이드에 정리했습니다.',
  },
  {
    q: '야간·주말에도 접수되나요?',
    a: '온라인 접수는 시간 제한 없이 가능합니다. 실제 출동 시간은 배정 업체의 운영 현황에 따르며, 야간·휴일 출동은 할증이 붙을 수 있습니다.',
  },
] as const;

export default async function SeongnamAreaPage() {
  // 홈 ReviewSection 과 같은 패턴: CloudType 빌드는 DB 없이 돌고(Dockerfile 의 더미 DATABASE_URL) 프리렌더 시
  // 조회가 실패하므로 여기서 잡아 집계 줄만 생략한다(페이지 500·빌드 실패 금지). throw 라 unstable_cache 엔트리도 안 남아
  // 런타임 첫 재검증(1h) 때 실제 값이 채워진다.
  let stats: Awaited<ReturnType<typeof getAreaPartnerStats>> | null = null;
  try {
    stats = await getAreaPartnerStats(SIDO, SIGUNGU);
  } catch {
    stats = null;
  }
  // LEAK_SYMPTOM 은 홈 별도 섹션용이라 label 이 없다 — 이 페이지 그리드용 라벨을 붙인다.
  const symptoms = [...SYMPTOM_ITEMS, { key: LEAK_SYMPTOM.key, label: '누전이 의심돼요' }];

  return (
    <main className="min-h-screen pb-28 md:pb-12">
      <JsonLd
        data={getWebPageGraph({
          path: PATH,
          name: '성남 전기 수리 출동',
          description: String(metadata.description),
          dateModified: PAGE_UPDATED.areaSeongnam,
          parents: [{ name: '지역별 전기 수리 출동 안내', path: AREAS_PATH }],
        })}
      />
      <JsonLd
        data={getAreaServiceSchema({
          path: PATH,
          areaName: '성남시',
          sido: SIDO,
          name: '성남 전기 수리 출동 서비스',
          description: String(metadata.description),
        })}
      />
      <JsonLd data={getFaqPageSchema(FAQ)} />
      <PageHeader
        title="성남 출동 안내"
        back={AREAS_PATH}
        headingAs="p"
        crumbs={[
          { label: '홈', href: '/' },
          { label: '지역 출동 안내', href: AREAS_PATH },
          { label: '성남', href: PATH },
        ]}
      />

      <div className="mx-auto w-full max-w-2xl px-5 pt-6">
        <Surface tint as="section" className="rounded-2xl p-5">
          <p className="text-xs font-bold text-brand-600">전국 전기 출동 중개 플랫폼 {COMPANY.siteDisplayUrl} · 성남시 우선 집중 지역</p>
          <h1 className="mt-2 text-2xl leading-tight font-extrabold text-fg md:text-3xl">
            성남 전기 수리 출동
            <br />
            분당·판교·위례·수정·중원 전기 고장, 접수하면 담당 업체가 갑니다
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-neutral-700">
            {COMPANY.name}는 전국 시/군/구 단위로 전기 고장을 접수받는 중개 플랫폼이며, 성남시를 가장 먼저 집중
            운영합니다. 성남의 정전·누전·두꺼비집·콘센트·조명 고장을 접수하면 성남을 담당하는 승인 출동 업체·전기기사에게
            배정합니다. 접수는 무료이고 수리비는 현장에서 안내합니다.
          </p>
          <p className="mt-2 text-sm font-semibold text-brand-700">
            초긴급(정전·누전·타는 냄새)은 1시간 내, 긴급은 2시간 내 응대를 목표로 우선 배정합니다.
          </p>
          {stats && stats.providers + stats.technicians >= MIN_PARTNERS_TO_SHOW && (
            <p className="mt-3 rounded-2xl bg-white/80 px-4 py-3 text-sm font-semibold text-fg">
              지금 성남시를 담당하는 승인 파트너: 출동 업체 {stats.providers}곳 · 전기기사 {stats.technicians}명
              <span className="mt-1 block text-xs font-normal text-muted">
                경기도 전역·전 지역 담당 파트너 포함, 최대 1시간 전 집계
              </span>
            </p>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link href="/request/new" className={buttonClasses('primary', 'md', 'flex-1')}>
              성남 전기 고장 접수하기
            </Link>
            <a href={`tel:${COMPANY.tel.replace(/-/g, '')}`} className={buttonClasses('secondary', 'md', 'flex-1')}>
              전화 문의 {COMPANY.tel}
            </a>
          </div>
        </Surface>

        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-fg">
            <MapPinIcon className="h-5 w-5 text-brand-600" />
            성남시 출동 지역
          </h2>
          <div className="mt-4 space-y-3">
            {SEONGNAM_GU.map((d) => (
              <Surface key={d.slug} as="section" className="rounded-2xl p-4">
                <p className="font-bold text-fg">성남시 {d.gu}</p>
                <p className="mt-0.5 text-xs text-muted">{d.note}</p>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700">{d.dongs.join(' · ')}</p>
                <Link href={`${PATH}/${d.slug}`} className="mt-2 inline-block text-sm font-bold text-brand-700 underline">
                  {d.gu} 전기 수리 출동 안내 →
                </Link>
              </Surface>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            접수 시 주소를 남기면 시/군/구 단위로 자동 판별해 성남 담당 파트너에게 우선 배정하고, 배정 결과는 문자로
            안내합니다. 성남 밖 지역도 같은 방식으로 접수할 수 있습니다.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-fg">성남 전기 누전·정전·차단기 — 자주 접수되는 고장</h2>
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {symptoms.map((s) => (
              <li key={s.key}>
                <Link
                  href={`/request/new?symptom=${s.key}`}
                  className="block rounded-2xl bg-white p-4 text-sm font-bold text-fg shadow-surface-sm transition hover:bg-neutral-50"
                >
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-2 text-sm leading-relaxed text-neutral-700">
            <p>
              수정구·중원구 구도심의 오래된 주택·상가라면 배선 노후로 인한 누전과 차단기 반복을, 분당 1기 신도시
              아파트라면 세대 분전반 차단기 불량과 콘센트·조명 노후를, 판교·위례 신축이라면 가전 누전과 과부하를 먼저
              의심해 볼 수 있습니다. 원인을 미리 확인하고 싶다면 아래 가이드를 먼저 읽어 보세요.
            </p>
          </div>
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
            접수 시 긴급도를 직접 선택합니다. 실제 배정 시간은 성남 담당 파트너의 당시 현황에 따라 달라질 수 있습니다.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-fg">
            <WonIcon className="h-5 w-5 text-brand-600" />
            비용은 이렇게 정해집니다
          </h2>
          <ul className="mt-3 space-y-2 rounded-2xl bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-700">
            <li>접수·조회는 <strong>무료</strong>이며 앱 안에 결제나 정찰 요금표가 없습니다.</li>
            <li>배정된 업체가 현장에서 원인을 확인한 뒤 출장·진단비, 자재비, 작업비, 야간·휴일 할증을 안내합니다.</li>
            <li>동의 후 작업하고, 대금은 <strong>현장에서 업체·전기기사와 직접 정산</strong>합니다.</li>
            <li>
              자세한 구조는{' '}
              <Link href="/guide/jeongi-suri-biyong" className="font-bold text-brand-700 underline">
                전기 수리 출장 비용은 어떻게 정해지나요
              </Link>
              에서 확인하세요.
            </li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-fg">
            <ShieldIcon className="h-5 w-5 text-brand-600" />
            어떤 업체가 오나요
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-neutral-700">
            {COMPANY.name}에 등록된 출동 업체는 사업자등록증과 전기공사업 등록증을 제출해 관리자 승인을 거친
            곳이고, 전기기사는 휴대폰 본인인증과 근로확인서 서명을 마친 사람만 배정 대상이 됩니다. 완료 후에는
            문자로 만족도 조사가 발송되며, 평가는 다음 배정 순위에 반영됩니다.
          </p>
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

        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-fg">자주 묻는 질문 — 성남</h2>
          <div className="mt-3 space-y-2">
            {FAQ.map((item) => (
              <details key={item.q} className="rounded-2xl bg-neutral-50 p-4">
                <summary className="cursor-pointer font-bold text-fg">{item.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <Surface tint as="section" className="mt-10 rounded-2xl p-5">
          <h2 className="text-lg font-extrabold text-fg">성남 전기 고장, 지금 접수하세요</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-700">
            증상·주소·긴급도를 남기면 성남 담당 파트너에게 배정하고 진행 상황을 문자로 알려 드립니다.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link href="/request/new" className={buttonClasses('primary', 'md', 'flex-1')}>
              고장 접수하기
            </Link>
            <a href={`tel:${COMPANY.tel.replace(/-/g, '')}`} className={buttonClasses('secondary', 'md', 'flex-1')}>
              전화 문의 {COMPANY.tel}
            </a>
          </div>
          <p className="mt-3 text-xs text-muted">
            이미 접수했다면{' '}
            <Link href="/lookup" className="font-bold text-brand-700 underline">
              접수 내역 조회
            </Link>
            에서 진행 상황을 확인할 수 있습니다.
          </p>
        </Surface>

        <nav aria-label="인접 지역" className="mt-8 text-sm text-neutral-700">
          인접 지역:{' '}
          <Link href="/areas/wirye" className="font-bold text-brand-700 underline">위례신도시</Link>
          {' · '}
          <Link href="/areas/hanam" className="font-bold text-brand-700 underline">하남시</Link>
          {' · '}
          <Link href="/areas/songpa" className="font-bold text-brand-700 underline">송파구</Link>
          {' · '}
          <Link href="/areas/gwangju" className="font-bold text-brand-700 underline">경기 광주시</Link>
        </nav>

        <p className="mt-6 text-xs text-muted">
          최종 수정일: {formatKoreanDate(PAGE_UPDATED.areaSeongnam)} · {COMPANY.name}는 시공 업체가 아닌 중개 플랫폼이며,
          전북 군산의 동명 전기용품 판매점과는 무관합니다.
        </p>
      </div>
    </main>
  );
}
