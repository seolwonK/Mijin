'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import body from './blog-body.module.css';
import { normalizePastedHtml, normalizePastedText } from '@/lib/blog/naverPaste';

// 블로그 글 편집기. 네이버 블로그 편집기(또는 발행된 글)에서 본문을 복사해 그대로 붙여 넣으면
// 소제목·인용구·구분선·표·사진·굵게·글자색이 같은 모양으로 들어온다(변환 규칙은 lib/blog/naverPaste.ts).
// 붙여 넣은 글 속 네이버 사진은 자동으로 우리 저장소로 옮긴다 — 네이버 주소 그대로는 다른 사이트에서 안 보인다.

export type BlogEditorPost = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  contentHtml: string;
  tags: string[];
  status: 'DRAFT' | 'PUBLISHED';
};

const IMAGE_PATH = '/api/blog/images/';
const field = 'w-full rounded-admin-md border border-border bg-white p-3 text-base focus:border-admin-cyan-ink focus:outline-none';
const toolButton = 'rounded-admin-md border border-border bg-white px-3 py-1.5 text-sm font-semibold text-fg hover:bg-neutral-50';

async function uploadImage(input: File | string): Promise<string> {
  const init: RequestInit =
    typeof input === 'string'
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: input }) }
      : (() => {
          const form = new FormData();
          form.append('file', input);
          return { method: 'POST', body: form };
        })();
  const res = await fetch('/api/admin/blog/images', init);
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? '이미지를 올리지 못했습니다.');
  return data.url;
}

async function dataUrlToFile(dataUrl: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], 'pasted-image', { type: blob.type });
}

export default function BlogEditor({ post }: { post?: BlogEditorPost }) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(post?.title ?? '');
  const [slug, setSlug] = useState(post?.slug ?? '');
  const [summary, setSummary] = useState(post?.summary ?? '');
  const [tags, setTags] = useState(post?.tags.join(', ') ?? '');
  const [busy, setBusy] = useState<null | 'DRAFT' | 'PUBLISHED' | 'DELETE'>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = post?.contentHtml ?? '';
    // 최초 1회만 본문을 채운다 — 이후에는 편집기 DOM 이 원본이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 본문 속 외부·임시 이미지를 저장소로 옮긴다. 실패한 이미지는 표시만 해 두고 글은 유지한다. */
  const importImages = useCallback(async () => {
    const root = editorRef.current;
    if (!root) return;
    const targets = [...root.querySelectorAll('img')].filter((img) => !(img.getAttribute('src') ?? '').startsWith(IMAGE_PATH) && !img.dataset.pending);
    if (!targets.length) return;
    targets.forEach((img) => { img.dataset.pending = '1'; });
    setPending((n) => n + targets.length);
    let failed = 0;
    await Promise.all(
      targets.map(async (img) => {
        const src = img.getAttribute('src') ?? '';
        try {
          img.setAttribute('src', await uploadImage(src.startsWith('data:') ? await dataUrlToFile(src) : src));
          delete img.dataset.pending;
        } catch {
          failed += 1;
          img.dataset.pending = 'failed';
        } finally {
          setPending((n) => n - 1);
        }
      }),
    );
    if (failed) {
      setNotice({ kind: 'error', text: `사진 ${failed}장을 옮기지 못했습니다. 흐리게 표시된 사진을 지우고 '사진' 버튼으로 직접 올려 주세요.` });
    }
  }, []);

  const insertHtml = useCallback((html: string) => {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, html);
  }, []);

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const data = e.clipboardData;
      const files = [...data.files].filter((f) => f.type.startsWith('image/'));
      const html = data.getData('text/html');
      e.preventDefault();
      if (html) {
        const result = normalizePastedHtml(html);
        if (result.title && !title.trim()) setTitle(result.title);
        if (result.html) insertHtml(result.html);
        else if (data.getData('text/plain')) insertHtml(normalizePastedText(data.getData('text/plain')));
      } else if (files.length) {
        void Promise.all(files.map(uploadImage))
          .then((urls) => insertHtml(urls.map((u) => `<figure><img src="${u}" alt=""></figure>`).join('')))
          .catch((err: Error) => setNotice({ kind: 'error', text: err.message }));
        return;
      } else {
        insertHtml(normalizePastedText(data.getData('text/plain')));
      }
      void importImages();
    },
    [importImages, insertHtml, title],
  );

  const block = (tag: string) => () => {
    editorRef.current?.focus();
    document.execCommand('formatBlock', false, tag);
  };
  const command = (name: string) => () => {
    editorRef.current?.focus();
    document.execCommand(name);
  };
  const addLink = () => {
    const url = window.prompt('연결할 주소를 입력해 주세요 (https://…)');
    if (!url) return;
    editorRef.current?.focus();
    document.execCommand('createLink', false, url.trim());
  };
  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!files.length) return;
    setNotice({ kind: 'info', text: '사진을 올리는 중입니다…' });
    try {
      const urls = await Promise.all(files.map(uploadImage));
      insertHtml(urls.map((u) => `<figure><img src="${u}" alt=""></figure>`).join('') + '<p><br></p>');
      setNotice(null);
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message });
    }
  };

  async function save(status: 'DRAFT' | 'PUBLISHED') {
    const root = editorRef.current;
    if (!root) return;
    if (pending > 0) {
      setNotice({ kind: 'info', text: '사진을 옮기는 중입니다. 잠시 뒤 다시 눌러 주세요.' });
      return;
    }
    if (status === 'PUBLISHED' && root.querySelector('img[data-pending="failed"]')) {
      setNotice({ kind: 'error', text: '옮기지 못한 사진이 있습니다. 흐리게 표시된 사진을 지우거나 직접 올린 뒤 발행해 주세요.' });
      return;
    }
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('img').forEach((img) => img.removeAttribute('data-pending'));
    setBusy(status);
    setNotice(null);
    try {
      const res = await fetch(post ? `/api/admin/blog/${post.id}` : '/api/admin/blog', {
        method: post ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          slug,
          summary,
          contentHtml: clone.innerHTML,
          tags: tags.split(/[,#\n]/).map((t) => t.trim()).filter(Boolean),
          status,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; slug?: string; error?: string };
      if (!res.ok || !data.id) {
        setNotice({ kind: 'error', text: data.error ?? '저장하지 못했습니다.' });
        return;
      }
      if (data.slug) setSlug(data.slug);
      setNotice({ kind: 'ok', text: status === 'PUBLISHED' ? '발행했습니다.' : '임시저장했습니다.' });
      if (!post) router.replace(`/admin/blog/${data.id}`);
      else router.refresh();
    } catch {
      setNotice({ kind: 'error', text: '네트워크 오류로 저장하지 못했습니다.' });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!post || !window.confirm('이 글을 삭제할까요? 되돌릴 수 없습니다.')) return;
    setBusy('DELETE');
    const res = await fetch(`/api/admin/blog/${post.id}`, { method: 'DELETE' });
    if (res.ok) router.replace('/admin/blog');
    else {
      setNotice({ kind: 'error', text: '삭제하지 못했습니다.' });
      setBusy(null);
    }
  }

  const published = post?.status === 'PUBLISHED';
  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-6">
      <p className="rounded-admin-md bg-neutral-100 px-4 py-3 text-sm leading-relaxed text-neutral-700">
        네이버 블로그 편집기에서 본문을 전체 선택(Ctrl/⌘+A)해 복사한 뒤 아래 본문 칸에 붙여 넣으세요. 소제목·인용구·구분선·표·사진·굵게·글자색이
        같은 모양으로 들어오고, 사진은 자동으로 이 사이트로 옮겨집니다.
      </p>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목"
        aria-label="제목"
        maxLength={120}
        className="mt-4 w-full border-0 border-b border-border bg-transparent px-1 py-3 text-2xl font-extrabold text-fg placeholder:text-neutral-400 focus:border-admin-cyan-ink focus:outline-none"
      />

      <div className="sticky top-[var(--admin-chrome-height,40px)] z-10 mt-4 flex flex-wrap gap-1.5 rounded-admin-md border border-border bg-neutral-50 p-2">
        <button type="button" className={toolButton} onClick={block('p')}>본문</button>
        <button type="button" className={toolButton} onClick={block('h2')}>소제목</button>
        <button type="button" className={toolButton} onClick={block('h3')}>작은 제목</button>
        <button type="button" className={toolButton} onClick={command('bold')}><strong>굵게</strong></button>
        <button type="button" className={toolButton} onClick={command('underline')}><u>밑줄</u></button>
        <button type="button" className={toolButton} onClick={block('blockquote')}>인용구</button>
        <button type="button" className={toolButton} onClick={command('insertUnorderedList')}>목록</button>
        <button type="button" className={toolButton} onClick={command('insertOrderedList')}>번호 목록</button>
        <button type="button" className={toolButton} onClick={() => insertHtml('<hr><p><br></p>')}>구분선</button>
        <button type="button" className={toolButton} onClick={addLink}>링크</button>
        <button type="button" className={toolButton} onClick={() => fileRef.current?.click()}>사진</button>
        <button type="button" className={toolButton} onClick={command('removeFormat')}>서식 지우기</button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple hidden onChange={onPickFiles} />
        {/* 긴 글에서도 저장·발행이 늘 손닿는 곳에 있도록 도구 줄에도 둔다(아래쪽 버튼과 같은 동작) */}
        <span className="ml-auto flex gap-1.5">
          <button type="button" disabled={busy !== null} onClick={() => save('DRAFT')} className={`${toolButton} disabled:opacity-50`}>
            임시저장
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => save('PUBLISHED')}
            className="rounded-admin-md bg-admin-cyan-ink px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
          >
            발행
          </button>
        </span>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="본문"
        data-placeholder="여기에 본문을 붙여 넣거나 직접 써 주세요."
        onPaste={onPaste}
        className={`${body.body} ${body.editor} mt-2 rounded-admin-md border border-border bg-white focus:border-admin-cyan-ink`}
      />
      {pending > 0 && <p className="mt-2 text-sm text-neutral-600">사진 {pending}장을 이 사이트로 옮기는 중입니다…</p>}

      <div className="mt-6 grid gap-4 rounded-admin-md border border-border bg-white p-4">
        <label className="grid gap-1.5 text-sm font-semibold text-fg">
          검색 결과에 보일 요약 <span className="font-normal text-muted">비워 두면 본문 앞부분으로 자동 작성됩니다 (200자 이내)</span>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={200} rows={2} className={field} />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-fg">
          태그 <span className="font-normal text-muted">쉼표로 구분 (예: 누전차단기, 두꺼비집)</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} className={field} />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-fg">
          글 주소 <span className="font-normal text-muted">비워 두면 제목으로 자동 생성됩니다 — /blog/{slug || '제목'}</span>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} maxLength={80} className={field} />
        </label>
      </div>

      {notice && (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`mt-4 rounded-admin-md px-4 py-3 text-sm font-semibold ${
            notice.kind === 'error' ? 'bg-red-50 text-red-700' : notice.kind === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-neutral-100 text-neutral-700'
          }`}
        >
          {notice.text}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => save('PUBLISHED')}
          className="rounded-admin-md bg-admin-cyan-ink px-5 py-3 text-base font-bold text-white disabled:opacity-50"
        >
          {busy === 'PUBLISHED' ? '발행 중…' : published ? '수정 내용 발행' : '발행하기'}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => save('DRAFT')} className={`${toolButton} px-5 py-3 text-base disabled:opacity-50`}>
          {busy === 'DRAFT' ? '저장 중…' : published ? '발행 내리고 임시저장' : '임시저장'}
        </button>
        {published && (
          <a href={`/blog/${encodeURIComponent(slug)}`} target="_blank" rel="noreferrer" className="px-2 text-sm font-semibold text-admin-cyan-ink underline">
            발행된 글 보기
          </a>
        )}
        {post && (
          <button type="button" disabled={busy !== null} onClick={remove} className="ml-auto px-2 text-sm font-semibold text-red-700 underline disabled:opacity-50">
            글 삭제
          </button>
        )}
      </div>
    </div>
  );
}
