import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { kstDate } from '@/lib/blog/posts';

// 블로그 글 목록(관리자). 글쓰기·수정은 /admin/blog/new, /admin/blog/[id].
export const dynamic = 'force-dynamic';

export default async function AdminBlogPage() {
  if (!(await requireSession('ADMIN'))) redirect('/admin/login');
  const posts = await prisma.blogPost.findMany({
    orderBy: [{ updatedAt: 'desc' }],
    select: { id: true, title: true, slug: true, status: true, publishedAt: true, updatedAt: true },
  });
  return (
    <>
      <PageHeader
        title="블로그"
        back="/admin"
        width="max-w-[860px]"
        right={
          <Link href="/admin/blog/new" className="rounded-admin-md bg-admin-cyan-ink px-4 py-2 text-sm font-bold text-white">
            + 글쓰기
          </Link>
        }
      />
      <div className="mx-auto w-full max-w-[860px] px-4 py-6">
        {posts.length === 0 ? (
          <div className="rounded-admin-md border border-border bg-white p-8 text-center">
            <p className="text-base font-bold text-fg">아직 쓴 글이 없습니다</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              네이버 블로그에 올린 글을 복사해 붙여 넣으면 같은 모양으로 이 사이트에도 발행할 수 있습니다.
            </p>
            <Link href="/admin/blog/new" className="mt-4 inline-block rounded-admin-md bg-admin-cyan-ink px-5 py-3 text-sm font-bold text-white">
              첫 글 쓰기
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-admin-md border border-border bg-white">
            {posts.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/blog/${p.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-neutral-50">
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      p.status === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-800' : 'bg-neutral-100 text-neutral-600'
                    }`}
                  >
                    {p.status === 'PUBLISHED' ? '발행' : '임시저장'}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-fg">{p.title}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {p.publishedAt ? `${kstDate(p.publishedAt)} 발행` : `${kstDate(p.updatedAt)} 저장`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
