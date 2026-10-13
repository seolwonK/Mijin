import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { GUIDES, GUIDE_CATEGORIES } from '@/lib/guides';
import { formatKoreanDate } from '@/lib/pageDates';

// 블로그 — 전기 상식 가이드(/guide/*)를 최신 글 순 블로그 피드로 보여준다. 글 본문은 가이드 페이지 그대로 쓴다.
// 목록 내용이 /guide 와 겹치므로 색인은 /guide 에 맡기고 여기는 링크만 따라가게 한다.
export const metadata: Metadata = {
  title: '블로그 · 전기 상식',
  description: '누전차단기·정전·콘센트·전기 수리 비용까지, 전기아저씨가 정리한 전기 상식 글 모음.',
  robots: { index: false, follow: true },
};

const CATEGORY_LABEL = Object.fromEntries(GUIDE_CATEGORIES.map((c) => [c.id, c.label]));

export default function BlogPage() {
  const posts = [...GUIDES].sort((a, b) => b.published.localeCompare(a.published) || b.updated.localeCompare(a.updated));
  return (
    <main className="min-h-screen pb-28 md:pb-12">
      <PageHeader title="블로그" back="/" headingAs="p" />
      <div className="mx-auto w-full max-w-2xl px-5 pt-6">
        <h1 className="text-2xl leading-tight font-extrabold text-fg md:text-3xl">전기아저씨 블로그</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          집에서 바로 확인할 수 있는 전기 상식과 안전 이야기를 전합니다.
        </p>

        <ul className="mt-8 divide-y divide-border">
          {posts.map((p) => (
            <li key={p.slug}>
              <Link href={`/guide/${p.slug}`} className="group block py-5">
                <p className="flex items-center gap-2 text-xs text-muted">
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-700">
                    {CATEGORY_LABEL[p.category]}
                  </span>
                  <time dateTime={p.published}>{formatKoreanDate(p.published)}</time>
                </p>
                <h2 className="mt-2 text-lg leading-snug font-bold text-fg group-hover:text-brand-700">{p.title}</h2>
                <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">{p.answer}</p>
                <p className="mt-2 text-sm font-semibold text-brand-700">
                  읽기 <span aria-hidden="true">→</span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
