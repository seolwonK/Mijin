'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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
      const home =
        data.role === 'ADMIN'
          ? '/admin'
          : data.role === 'TECHNICIAN'
            ? '/tech'
            : '/partner';
      router.replace(home);
    } catch {
      setError('네트워크 오류가 발생했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm md:max-w-md md:rounded-3xl md:border md:border-gray-200 md:bg-white md:p-10 md:shadow-sm">
        <h1 className="mb-6 text-center text-2xl font-bold">{title}</h1>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="text"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            placeholder="아이디"
            autoComplete="username"
            className="w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-500 focus:outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            autoComplete="current-password"
            className="w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-500 focus:outline-none"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy || !loginId || !password}
            className="w-full rounded-xl bg-blue-600 p-4 text-base font-bold text-white transition-colors enabled:hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? '로그인 중…' : '로그인'}
          </button>
        </form>
        {footer && (
          <div className="mt-4 text-center text-sm text-gray-500">{footer}</div>
        )}
      </div>
    </main>
  );
}
