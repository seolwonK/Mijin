import PageHeader from '@/components/PageHeader';
import BlogEditor from '@/components/BlogEditor';

export default function AdminBlogNewPage() {
  return (
    <>
      <PageHeader title="글쓰기" back="/admin/blog" width="max-w-[860px]" />
      <BlogEditor />
    </>
  );
}
