import { COMPANY } from '@/lib/company';
import { GUIDES } from '@/lib/guides';
import { getPublishedPosts, kstDate } from '@/lib/blog/posts';

// 네이버 서치어드바이저 "RSS 제출"용 피드. 네이버는 사이트맵과 별도로 RSS 를 신규 문서 발견 채널로 쓴다.
// 전기 상식 가이드(코드 상수)와 관리자가 발행한 블로그 글(DB)을 함께 싣는다 — 지역·안내 페이지는 사이트맵이 담당한다.
// 블로그 글 때문에 요청 시점에 만든다. 빌드·DB 장애 때는 가이드만 나간다(getPublishedPosts 가 빈 배열).
export const dynamic = 'force-dynamic';

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
const escapeXml = (s: string) => s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);

/** '2026-09-15' → RFC 822 (KST 자정 기준). RSS 2.0 은 pubDate 에 RFC 822 형식을 요구한다. */
const toRfc822 = (isoDate: string) => new Date(`${isoDate}T00:00:00+09:00`).toUTCString();

export async function GET() {
  const base = COMPANY.siteUrl;
  const posts = await getPublishedPosts();
  const postItems = posts.map(
    (p) => `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${base}/blog/${encodeURIComponent(p.slug)}</link>
      <guid isPermaLink="true">${base}/blog/${encodeURIComponent(p.slug)}</guid>
      <description>${escapeXml(p.summary)}</description>
      <pubDate>${toRfc822(kstDate(p.publishedAt))}</pubDate>
      <category>blog</category>
    </item>`,
  );
  const guideItems = [...GUIDES]
    .sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : a.published < b.published ? 1 : -1))
    .map(
      (g) => `    <item>
      <title>${escapeXml(g.title)}</title>
      <link>${base}/guide/${g.slug}</link>
      <guid isPermaLink="true">${base}/guide/${g.slug}</guid>
      <description>${escapeXml(g.description)}</description>
      <pubDate>${toRfc822(g.published)}</pubDate>
      <category>${escapeXml(g.category)}</category>
    </item>`,
    );
  const items = [...postItems, ...guideItems].join('\n');
  const guideLast = GUIDES.reduce((max, g) => (g.updated > max ? g.updated : max), GUIDES[0].updated);
  const postLast = posts.length ? kstDate(posts[0].publishedAt) : '';
  const lastBuild = postLast > guideLast ? postLast : guideLast;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(`${COMPANY.name} 전기 상식`)}</title>
    <link>${base}/guide</link>
    <atom:link href="${base}/rss.xml" rel="self" type="application/rss+xml" />
    <description>${escapeXml('누전차단기·두꺼비집·정전·콘센트·전기 화재 등 전기 고장 상식 가이드. 전기아저씨 운영팀이 작성합니다.')}</description>
    <language>ko</language>
    <lastBuildDate>${toRfc822(lastBuild)}</lastBuildDate>
${items}
  </channel>
</rss>
`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
