import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import JsonLd from '@/components/JsonLd';
import { GUIDES, GUIDE_CATEGORIES } from '@/lib/guides';
import { getPublishedPosts, kstDate } from '@/lib/blog/posts';
import { getWebPageGraph } from '@/lib/schema';
import { formatKoreanDate } from '@/lib/pageDates';

// 블로그 — 관리자가 발행한 글(/blog/[slug])과 전기 상식 가이드(/guide/*)를 최신순 한 줄로 보여준다.
// 발행 글이 생기면 이 목록이 그 글들의 색인 경로가 되므로 색인을 연다(가이드 글의 정본은 여전히 /guide).
export const dynamic = 'force-dynamic';

const DESCRIPTION = '누전차단기·정전·콘센트·전기 수리 비용까지, 전기아저씨가 전하는 전기 상식과 현장 이야기.';

export const metadata: Metadata = {
  title: '블로그 · 전기 상식과 현장 이야기',
  description: DESCRIPTION,
  alternates: { canonical: '/blog' },
};

const CATEGORY_LABEL = Object.fromEntries(GUIDE_CATEGORIES.map((c) => [c.id, c.label]));

type FeedItem = { href: string; label: string; date: string; title: string; excerpt: string; image: string | null };

export default async function BlogPage() {
  const posts = await getPublishedPosts();
  const feed: FeedItem[] = [
    ...posts.map((p) => ({
      href: `/blog/${encodeURIComponent(p.slug)}`,
      label: p.tags[0] ?? '블로그',
      date: kstDate(p.publishedAt),
      title: p.title,
      excerpt: p.summary,
      image: p.coverImage,
    })),
    ...GUIDES.map((g) => ({
      href: `/guide/${g.slug}`,
      label: CATEGORY_LABEL[g.category],
      date: g.published,
      title: g.title,
      excerpt: g.answer,
      image: null,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const latest = feed[0]?.date ?? '2026-09-15';

  return (
    <main className="min-h-screen pb-28 md:pb-12">
      <JsonLd data={getWebPageGraph({ path: '/blog', name: '전기아저씨 블로그', description: DESCRIPTION, dateModified: latest })} />
      <PageHeader title="블로그" back="/" headingAs="p" />
      <div className="mx-auto w-full max-w-2xl px-5 pt-6">
        <h1 className="text-2xl leading-tight font-extrabold text-fg md:text-3xl">전기아저씨 블로그</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          집에서 바로 확인할 수 있는 전기 상식과 안전 이야기를 전합니다.
        </p>

        <ul className="mt-8 divide-y divide-border">
          {feed.map((p) => (
            <li key={p.href}>
              <Link href={p.href} className="group flex gap-4 py-5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-xs text-muted">
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-700">{p.label}</span>
                    <time dateTime={p.date}>{formatKoreanDate(p.date)}</time>
                  </p>
                  <h2 className="mt-2 text-lg leading-snug font-bold text-fg group-hover:text-brand-700">{p.title}</h2>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">{p.excerpt}</p>
                  <p className="mt-2 text-sm font-semibold text-brand-700">
                    읽기 <span aria-hidden="true">→</span>
                  </p>
                </div>
                {p.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- 저장소 이미지는 크기를 미리 알 수 없어 next/image 를 쓰지 않는다
                  <img src={p.image} alt="" loading="lazy" className="h-24 w-24 shrink-0 rounded-xl object-cover" />
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
