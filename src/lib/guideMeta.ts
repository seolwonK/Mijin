import type { Metadata } from 'next';
import { getGuide } from '@/lib/guides';

// 가이드 페이지 metadata 를 한 곳에서 만든다 — title/description/canonical + 글별 OG 이미지(public/brand/og/<slug>.jpg).
// 루트 openGraph 를 페이지에서 지정하면 images 까지 통째로 대체되므로 여기서 다시 넣는다(src/app/layout.tsx 주석 참조).
export function guideMetadata(slug: string): Metadata {
  const g = getGuide(slug);
  if (!g) throw new Error(`unknown guide: ${slug}`);
  return {
    title: g.title,
    description: g.description,
    alternates: { canonical: `/guide/${g.slug}` },
    openGraph: {
      type: 'article',
      locale: 'ko_KR',
      siteName: '전기아저씨',
      publishedTime: g.published,
      modifiedTime: g.updated,
      images: [{ url: `/brand/og/${g.slug}.jpg`, width: 1200, height: 630, alt: g.title }],
    },
  };
}
