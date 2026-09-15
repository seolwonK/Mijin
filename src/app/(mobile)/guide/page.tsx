import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import JsonLd from '@/components/JsonLd';
import { GUIDES, GUIDE_CATEGORIES } from '@/lib/guides';
import { getWebPageGraph } from '@/lib/schema';
import { PAGE_UPDATED, formatKoreanDate } from '@/lib/pageDates';

export const metadata: Metadata = {
  title: '전기 상식 · 누전차단기·두꺼비집·정전·콘센트·수리 비용 가이드',
  description:
    '누전차단기가 내려갈 때, 우리 집만 정전일 때, 콘센트에서 타는 냄새가 날 때 집에서 바로 확인할 순서와 전기기사를 불러야 하는 기준, 출장 수리 비용 구조, 점검 제도, 세입자·집주인 부담까지 정리한 전기 상식 가이드.',
  alternates: { canonical: '/guide' },
};

export default function GuideIndexPage() {
  const featured = GUIDES.filter((g) => g.featured);
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
          별것 아닌 원인으로 출장비를 내는 일도, 위험한 신호를 놓치는 일도 없도록 증상별 확인 순서와 안전 기준을
          정리했습니다. 전기아저씨 운영팀이 작성하고 실제 접수 사례를 바탕으로 갱신합니다. 확인 후에도 해결되지 않으면
          접수해 주세요.
        </p>

        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-fg">먼저 읽을 글</h2>
          <ul className="mt-3 space-y-2">
            {featured.map((g) => (
              <li key={g.slug}>
                <Link href={`/guide/${g.slug}`} className="block rounded-2xl bg-white p-4 shadow-surface-sm transition hover:bg-neutral-50">
                  <p className="font-bold text-fg">{g.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{g.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {GUIDE_CATEGORIES.map((c) => {
          const items = GUIDES.filter((g) => g.category === c.id);
          if (items.length === 0) return null;
          return (
            <section key={c.id} className="mt-10">
              <h2 className="text-xl font-extrabold text-fg">{c.label}</h2>
              <p className="mt-1 text-sm text-muted">{c.desc}</p>
              <ul className="mt-4 space-y-3">
                {items.map((g) => (
                  <li key={g.slug}>
                    <Link href={`/guide/${g.slug}`} className="block rounded-2xl bg-white p-5 shadow-surface-sm transition hover:bg-neutral-50">
                      <h3 className="text-lg font-bold text-fg">{g.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted">{g.description}</p>
                      <p className="mt-2 text-xs text-neutral-400">최종 수정일 {formatKoreanDate(g.updated)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <p className="mt-10 text-sm text-neutral-700">
          지역별 출동 안내:{' '}
          <Link href="/areas" className="font-bold text-brand-700 underline">
            전국 접수 · 성남 우선 집중 지역
          </Link>
        </p>
      </div>
    </main>
  );
}
