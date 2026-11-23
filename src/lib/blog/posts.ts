import { z } from 'zod';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { blogPlainText, externalImages, firstImage, sanitizeBlogHtml, slugify, summarize } from './sanitize';

// 블로그 글 저장·조회 규칙. 관리자 API(api/admin/blog)와 공개 화면(/blog)이 함께 쓴다.

export const blogPostSchema = z.object({
  title: z.string().trim().min(1, '제목을 입력해 주세요.').max(120, '제목은 120자 이내로 입력해 주세요.'),
  slug: z.string().trim().max(80, '주소는 80자 이내로 입력해 주세요.').optional().default(''),
  summary: z.string().trim().max(200, '요약은 200자 이내로 입력해 주세요.').optional().default(''),
  contentHtml: z.string().max(600_000, '본문이 너무 깁니다.'),
  tags: z.array(z.string().trim().min(1).max(30)).max(15, '태그는 15개까지 넣을 수 있습니다.').optional().default([]),
  status: z.enum(['DRAFT', 'PUBLISHED']),
});
export type BlogPostInput = z.infer<typeof blogPostSchema>;

export type PreparedPost = {
  title: string;
  slug: string;
  summary: string;
  contentHtml: string;
  coverImage: string | null;
  tags: string[];
  status: 'DRAFT' | 'PUBLISHED';
};

/** 입력을 저장 형태로 바꾼다. 저장할 수 없으면 사유 문구를 돌려준다 — 호출부가 400 을 낸다. */
export function preparePost(input: BlogPostInput, fallbackSlug: string): PreparedPost | string {
  const contentHtml = sanitizeBlogHtml(input.contentHtml);
  const text = blogPlainText(contentHtml);
  if (!text && !firstImage(contentHtml)) return '본문을 입력해 주세요.';
  // 발행 글의 사진은 전부 우리 저장소에 있어야 한다 — 외부 주소는 안 보이거나(네이버) 방문자 정보를 밖으로 흘린다.
  if (input.status === 'PUBLISHED' && externalImages(contentHtml).length) {
    return '이 사이트로 옮기지 못한 사진이 있습니다. 해당 사진을 지우거나 직접 올린 뒤 발행해 주세요.';
  }
  return {
    title: input.title,
    slug: slugify(input.slug) ?? slugify(input.title) ?? fallbackSlug,
    summary: input.summary || summarize(text) || input.title,
    contentHtml,
    coverImage: firstImage(contentHtml),
    tags: [...new Set(input.tags.map((t) => t.replace(/^#/, '').trim()).filter(Boolean))],
    status: input.status,
  };
}

/** 같은 주소가 이미 있으면 뒤에 -2, -3 … 을 붙인다. */
export async function uniqueSlug(slug: string, exceptId?: string): Promise<string> {
  for (let n = 1; n < 50; n += 1) {
    const candidate = n === 1 ? slug : `${slug}-${n}`;
    const taken = await prisma.blogPost.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!taken || taken.id === exceptId) return candidate;
  }
  return `${slug}-${Date.now().toString(36)}`;
}

/** 주소 중복(동시 저장으로 uniqueSlug 확인과 쓰기 사이에 끼어든 경우)이면 주소 뒤에 시각을 붙여 한 번 더 쓴다. */
export async function writeWithSlugRetry<T>(slug: string, write: (slug: string) => Promise<T>): Promise<T> {
  try {
    return await write(slug);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return write(`${slug}-${Date.now().toString(36)}`);
    }
    throw e;
  }
}

const LIST_SELECT = {
  slug: true,
  title: true,
  summary: true,
  coverImage: true,
  tags: true,
  publishedAt: true,
  updatedAt: true,
} as const;

export type BlogListItem = {
  slug: string;
  title: string;
  summary: string;
  coverImage: string | null;
  tags: string[];
  publishedAt: Date;
  updatedAt: Date;
};

/** 발행된 글 목록(최신순). 빌드 중이거나 DB 장애면 빈 목록 — 화면은 가이드 글만으로도 성립한다. */
export async function getPublishedPosts(): Promise<BlogListItem[]> {
  try {
    const rows = await prisma.blogPost.findMany({
      where: { status: 'PUBLISHED', publishedAt: { not: null } },
      orderBy: { publishedAt: 'desc' },
      select: LIST_SELECT,
    });
    return rows.map((r) => ({ ...r, publishedAt: r.publishedAt! }));
  } catch {
    return [];
  }
}

/** 발행 글 한 건. DB 장애는 삼키지 않는다 — 삼키면 장애 중에 검색엔진이 '삭제된 글'(404)로 받아 간다. */
export async function getPublishedPost(slug: string) {
  return prisma.blogPost.findFirst({ where: { slug, status: 'PUBLISHED', publishedAt: { not: null } } });
}

/** Date → 'YYYY-MM-DD'(KST). 화면 날짜·스키마·사이트맵이 같은 값을 쓴다. */
export function kstDate(d: Date): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}
