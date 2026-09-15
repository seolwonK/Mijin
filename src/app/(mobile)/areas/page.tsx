import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import Surface from '@/components/Surface';
import JsonLd from '@/components/JsonLd';
import { buttonClasses } from '@/components/Button';
import { COMPANY } from '@/lib/company';
import { AREAS_PATH, FOCUS_AREAS } from '@/lib/areas';
import { getWebPageGraph } from '@/lib/schema';
import { PAGE_UPDATED, formatKoreanDate } from '@/lib/pageDates';

export const metadata: Metadata = {
  title: '지역별 전기 수리 출동 안내 · 성남·분당·위례·하남·송파·경기 광주',
  description:
    '전기아저씨는 전국 시/도·시/군/구 단위로 전기 고장을 접수받는 출동 중개 플랫폼입니다. 성남(분당·판교·수정·중원)·위례·하남·송파·경기 광주를 우선 집중 운영하며 지역을 넓혀 갑니다. 지역별 출동 안내와 접수 방법.',
  alternates: { canonical: AREAS_PATH },
};

export default function AreasIndexPage() {
  return (
    <main className="min-h-screen pb-28 md:pb-12">
      <JsonLd
        data={getWebPageGraph({
          path: AREAS_PATH,
          name: '지역별 전기 수리 출동 안내',
          description: String(metadata.description),
          dateModified: PAGE_UPDATED.areasIndex,
        })}
      />
      <PageHeader title="지역 출동 안내" back="/" headingAs="p" />
      <div className="mx-auto w-full max-w-2xl px-5 pt-6">
        <h1 className="text-2xl leading-tight font-extrabold text-fg md:text-3xl">
          전국 어디서나 접수, 성남·위례·하남·송파·경기 광주부터 집중 운영합니다
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-700">
          {COMPANY.name}는 전국 시/도·시/군/구 단위로 전기 고장을 접수받아 등록된 출동 업체·전기기사를 연결하는 중개
          플랫폼입니다. 접수 시 남긴 주소로 지역을 자동 판별해 그 지역을 담당하는 파트너에게 배정하고, 담당 파트너가
          없는 지역은 관리자가 확인해 배정 결과를 문자로 안내합니다.
        </p>

        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-fg">집중 운영 지역</h2>
          <div className="mt-4 space-y-3">
            {FOCUS_AREAS.map((a) => (
              <Surface key={a.slug} as="section" className="rounded-2xl p-5">
                <p className="text-xs font-bold text-brand-600">{a.sido} {a.name}</p>
                <Link href={`${AREAS_PATH}/${a.slug}`} className="mt-1 block text-lg font-bold text-fg underline-offset-2 hover:underline">
                  {a.label}
                </Link>
                <p className="mt-2 text-sm leading-relaxed text-muted">{a.summary}</p>
                {a.children.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {a.children.map((c) => (
                    <li key={c.slug}>
                      <Link
                        href={`${AREAS_PATH}/${a.slug}/${c.slug}`}
                        className="inline-block rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-700 hover:bg-neutral-200"
                      >
                        {c.gu}
                      </Link>
                    </li>
                  ))}
                </ul>
                )}
              </Surface>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-fg">다른 지역도 접수할 수 있나요</h2>
          <p className="mt-3 text-sm leading-relaxed text-neutral-700">
            네. 서울·경기·인천을 비롯한 전국 시/군/구에서 접수할 수 있습니다. 지역별 실제 배정은 등록된 업체·전기기사
            현황에 따라 달라지며, 집중 운영 지역은 접수 건과 파트너가 쌓이는 순서대로 늘려 갑니다. 출동 업체·전기기사로
            함께하려면{' '}
            <Link href="/partner/signup" className="font-bold text-brand-700 underline">
              업체 가입
            </Link>
            {' · '}
            <Link href="/tech/signup" className="font-bold text-brand-700 underline">
              전기기사 가입
            </Link>
            에서 담당 지역을 등록해 주세요.
          </p>
        </section>

        <Surface tint as="section" className="mt-10 rounded-2xl p-5">
          <h2 className="text-lg font-extrabold text-fg">지금 전기 고장을 접수하세요</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-700">
            증상·주소·긴급도를 남기면 담당 파트너에게 배정하고 진행 상황을 문자로 알려 드립니다. 접수는 무료입니다.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link href="/request/new" className={buttonClasses('primary', 'md', 'flex-1')}>
              고장 접수하기
            </Link>
            <a href={`tel:${COMPANY.tel.replace(/-/g, '')}`} className={buttonClasses('secondary', 'md', 'flex-1')}>
              전화 문의 {COMPANY.tel}
            </a>
          </div>
        </Surface>

        <p className="mt-8 text-xs text-muted">최종 수정일: {formatKoreanDate(PAGE_UPDATED.areasIndex)}</p>
      </div>
    </main>
  );
}
