'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { buttonClasses } from '@/components/Button';

export default function LoginForm({
  title,
  footer,
}: {
  title: string;
  footer?: React.ReactNode;
}) {
  const router = useRouter();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '로그인에 실패했습니다');
        return;
      }
      const rolePrefix =
        data.role === 'ADMIN'
          ? '/admin'
          : data.role === 'TECHNICIAN'
            ? '/tech'
            : '/partner';
      // 로그인 전 가려던 화면(returnTo)이 이 역할의 경로면 그곳으로, 아니면 포털 홈으로.
      const returnTo = new URLSearchParams(window.location.search).get('returnTo');
      const dest =
        returnTo && (returnTo === rolePrefix || returnTo.startsWith(`${rolePrefix}/`))
          ? returnTo
          : rolePrefix;
      router.replace(dest);
    } catch {
      setError('네트워크 오류가 발생했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm md:max-w-md md:rounded-3xl md:border md:border-border md:bg-white md:p-10 md:shadow-card">
        <h1 className="mb-6 text-center text-2xl font-bold">{title}</h1>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="loginId" className="mb-1 block text-xs font-medium text-muted">
              아이디
            </label>
            <input
              id="loginId"
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="아이디"
              autoComplete="username"
              className="w-full rounded-xl border border-border p-3 text-base focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-medium text-muted">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              autoComplete="current-password"
              className="w-full rounded-xl border border-border p-3 text-base focus:border-brand-500 focus:outline-none"
            />
          </div>
          {error && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !loginId || !password}
            className={buttonClasses('primary', 'lg', 'w-full')}
          >
            {busy ? '로그인 중…' : '로그인'}
          </button>
        </form>
        {footer && (
          <div className="mt-4 text-center text-sm text-muted">{footer}</div>
        )}
      </div>
    </main>
  );
}
