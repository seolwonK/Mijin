import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isCrossSiteRequest } from '@/lib/requestOrigin';
import { removeUnusedImages } from '@/lib/blog/images';
import { blogPostSchema, preparePost, uniqueSlug, writeWithSlugRetry } from '@/lib/blog/posts';

type Ctx = { params: Promise<{ id: string }> };

// 블로그 글 수정 — 임시저장↔발행 전환도 여기서 한다.
// 발행일(publishedAt)은 처음 발행할 때만 찍는다: 글을 고칠 때마다 최신 글로 올라오면 목록 순서가 흐트러진다.
export async function PUT(req: NextRequest, { params }: Ctx) {
  if (!(await requireSession('ADMIN'))) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  if (isCrossSiteRequest(req)) {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 403 });
  }
  const { id } = await params;
  const parsed = blogPostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요.' }, { status: 400 });
  }
  const existing = await prisma.blogPost.findUnique({ where: { id }, select: { slug: true, publishedAt: true, contentHtml: true } });
  if (!existing) {
    return NextResponse.json({ error: '글을 찾을 수 없습니다.' }, { status: 404 });
  }
  const prepared = preparePost(parsed.data, existing.slug);
  if (typeof prepared === 'string') {
    return NextResponse.json({ error: prepared }, { status: 400 });
  }
  const publishedAt = prepared.status === 'PUBLISHED' ? (existing.publishedAt ?? new Date()) : existing.publishedAt;
  const post = await writeWithSlugRetry(await uniqueSlug(prepared.slug, id), (slug) =>
    prisma.blogPost.update({ where: { id }, data: { ...prepared, slug, publishedAt }, select: { id: true, slug: true, status: true } }),
  );
  await removeUnusedImages(existing.contentHtml);
  revalidatePath('/blog');
  return NextResponse.json(post);
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!(await requireSession('ADMIN'))) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  if (isCrossSiteRequest(req)) {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.blogPost.findUnique({ where: { id }, select: { contentHtml: true } });
  if (!existing) {
    return NextResponse.json({ error: '글을 찾을 수 없습니다.' }, { status: 404 });
  }
  await prisma.blogPost.deleteMany({ where: { id } });
  // 글과 함께 그 글만 쓰던 사진도 지운다 — 글을 내렸는데 사진 주소가 계속 열려 있으면 안 된다.
  await removeUnusedImages(existing.contentHtml);
  revalidatePath('/blog');
  return NextResponse.json({ ok: true });
}
