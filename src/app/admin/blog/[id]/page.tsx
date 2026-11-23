import { notFound, redirect } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import BlogEditor from '@/components/BlogEditor';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminBlogEditPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await requireSession('ADMIN'))) redirect('/admin/login');
  const { id } = await params;
  const post = await prisma.blogPost.findUnique({
    where: { id },
    select: { id: true, title: true, slug: true, summary: true, contentHtml: true, tags: true, status: true },
  });
  if (!post) notFound();
  return (
    <>
      <PageHeader title="글 수정" back="/admin/blog" width="max-w-[860px]" />
      {/* key: 저장 뒤 새로고침(router.refresh)으로 받은 최신 글로 편집기를 다시 만든다 */}
      <BlogEditor key={`${post.id}:${post.status}`} post={post} />
    </>
  );
}
