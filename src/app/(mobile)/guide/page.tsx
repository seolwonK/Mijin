import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import JsonLd from '@/components/JsonLd';
import { GUIDES } from '@/lib/guides';
import { getWebPageGraph } from '@/lib/schema';
import { PAGE_UPDATED, formatKoreanDate } from '@/lib/pageDates';

export const metadata: Metadata = {
  title: '전기 상식 · 누전·정전·차단기·수리 비용 가이드',
  description:
    '누전차단기가 내려갈 때, 우리 집만 정전일 때, 타는 냄새가 날 때 집에서 바로 확인할 순서와 전기기사를 불러야 하는 기준, 출장 수리 비용 구조를 정리한 전기 상식 가이드.',
  alternates: { canonical: '/guide' },
};

export default function GuideIndexPage() {
  return (
    <main className="min-h-screen pb-28 md:pb-12">
      <JsonLd
        data={getWebPageGraph({
          path: '/guide',
          name: '전기 상식',
          description: String(metadata.description),
          dateModified: PAGE_UPDATED.guideIndex,
        })}
      />
      <PageHeader title="전기 상식" back="/" headingAs="p" />
      <div className="mx-auto w-full max-w-2xl px-5 pt-6">
        <h1 className="text-2xl leading-tight font-extrabold text-fg md:text-3xl">
          전기 고장, 부르기 전에 1분만 확인하세요
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          별것 아닌 원인으로 출장비를 내는 일도, 위험한 신호를 놓치는 일도 없도록 증상별 확인 순서와
          안전 기준을 정리했습니다. 확인 후에도 해결되지 않으면 접수해 주세요.
        </p>
        <ul className="mt-6 space-y-3">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/guide/${g.slug}`}
                className="block rounded-2xl bg-white p-5 shadow-surface-sm transition hover:bg-neutral-50"
              >
                <h2 className="text-lg font-bold text-fg">{g.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{g.description}</p>
                <p className="mt-2 text-xs text-neutral-400">최종 수정일 {formatKoreanDate(g.updated)}</p>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-neutral-700">
          지역별 출동 안내:{' '}
          <Link href="/areas/seongnam" className="font-bold text-brand-700 underline">
            성남 전기 수리 출동
          </Link>
        </p>
      </div>
    </main>
  );
}
