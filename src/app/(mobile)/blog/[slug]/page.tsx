import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import Surface from '@/components/Surface';
import JsonLd from '@/components/JsonLd';
import { buttonClasses } from '@/components/Button';
import body from '@/components/blog-body.module.css';
import { COMPANY } from '@/lib/company';
import { getPublishedPost, getPublishedPosts, kstDate } from '@/lib/blog/posts';
import { getArticleGraph } from '@/lib/schema';
import { formatKoreanDate } from '@/lib/pageDates';

// 관리자가 발행한 블로그 글. 본문은 저장 시 서버에서 정화한 HTML(lib/blog/sanitize.ts)이다.
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

const absolute = (path: string | null) => (path ? (path.startsWith('http') ? path : `${COMPANY.siteUrl}${path}`) : undefined);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPost(decodeURIComponent(slug));
  if (!post) return { robots: { index: false, follow: false } };
  const path = `/blog/${encodeURIComponent(post.slug)}`;
  const image = absolute(post.coverImage);
  return {
    title: post.title,
    description: post.summary,
    keywords: post.tags.length ? post.tags : undefined,
    alternates: { canonical: path },
    openGraph: {
      type: 'article',
      url: path,
      publishedTime: post.publishedAt!.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      ...(image ? { images: [{ url: image }] } : {}),
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPublishedPost(decodeURIComponent(slug));
  if (!post) notFound();
  const path = `/blog/${encodeURIComponent(post.slug)}`;
  const published = kstDate(post.publishedAt!);
  const updated = kstDate(post.updatedAt);
  const others = (await getPublishedPosts()).filter((p) => p.slug !== post.slug).slice(0, 3);
  const tel = `tel:${COMPANY.tel.replace(/-/g, '')}`;

  return (
    <main className="min-h-screen pb-28 md:pb-12">
      <JsonLd
        data={getArticleGraph({
          path,
          headline: post.title,
          description: post.summary,
          datePublished: published,
          dateModified: updated,
          keywords: post.tags,
          image: absolute(post.coverImage),
          section: '블로그',
          parent: { name: '블로그', path: '/blog' },
        })}
      />
      <PageHeader
        title="블로그"
        back="/blog"
        headingAs="p"
        crumbs={[
          { label: '홈', href: '/' },
          { label: '블로그', href: '/blog' },
          { label: post.title, href: path },
        ]}
      />
      <article className="mx-auto w-full max-w-2xl px-5 pt-6">
        <h1 className="text-2xl leading-tight font-extrabold text-fg md:text-3xl">{post.title}</h1>
        <p className="mt-3 text-xs text-neutral-500">
          {COMPANY.name} · <time dateTime={published}>{formatKoreanDate(published)}</time>
          {updated !== published && <> · 수정 {formatKoreanDate(updated)}</>}
        </p>

        {/* 저장 시 허용 목록으로 정화한 HTML 만 들어온다 */}
        <div className={`${body.body} mt-8`} dangerouslySetInnerHTML={{ __html: post.contentHtml }} />

        {post.tags.length > 0 && (
          <ul className="mt-8 flex flex-wrap gap-2">
            {post.tags.map((t) => (
              <li key={t} className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600">
                #{t}
              </li>
            ))}
          </ul>
        )}

        <Surface tint as="section" className="mt-10 rounded-2xl p-5">
          <h2 className="text-lg font-extrabold text-fg">전기 고장, 직접 해결이 어렵다면 접수해 주세요</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-700">
            증상·주소·긴급도를 남기면 담당 전기기사를 연결하고 진행 상황을 문자로 알려 드립니다. 전국에서 접수합니다.
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

        {others.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-extrabold text-fg">다른 글</h2>
            <ul className="mt-3 space-y-2">
              {others.map((o) => (
                <li key={o.slug}>
                  <Link
                    href={`/blog/${encodeURIComponent(o.slug)}`}
                    className="block rounded-2xl bg-white p-4 shadow-surface-sm transition hover:bg-neutral-50"
                  >
                    <p className="font-bold text-fg">{o.title}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-8 text-sm">
          <Link href="/blog" className="font-bold text-brand-700 underline">
            블로그 글 전체 보기
          </Link>
        </p>
      </article>
    </main>
  );
}
