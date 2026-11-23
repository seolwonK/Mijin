import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isCrossSiteRequest } from '@/lib/requestOrigin';
import { blogPostSchema, preparePost, uniqueSlug, writeWithSlugRetry } from '@/lib/blog/posts';

// 블로그 글 새로 쓰기. 목록·상세 읽기는 관리자 화면(서버 컴포넌트)이 직접 조회한다.
export async function POST(req: NextRequest) {
  if (!(await requireSession('ADMIN'))) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  if (isCrossSiteRequest(req)) {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 403 });
  }
  const parsed = blogPostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요.' }, { status: 400 });
  }
  const prepared = preparePost(parsed.data, `post-${Date.now().toString(36)}`);
  if (typeof prepared === 'string') {
    return NextResponse.json({ error: prepared }, { status: 400 });
  }
  const post = await writeWithSlugRetry(await uniqueSlug(prepared.slug), (slug) =>
    prisma.blogPost.create({
      data: { ...prepared, slug, publishedAt: prepared.status === 'PUBLISHED' ? new Date() : null },
      select: { id: true, slug: true, status: true },
    }),
  );
  revalidatePath('/blog');
  return NextResponse.json(post, { status: 201 });
}
