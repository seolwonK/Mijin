'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestError } from '@/lib/clientApi';
export default function LogoutButton({ loginPath }: { loginPath: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function logout() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok)
        throw new Error('로그아웃하지 못했습니다. 다시 시도해 주세요.');
      router.replace(loginPath);
      router.refresh();
    } catch (e) {
      setError(requestError(e));
      setBusy(false);
    }
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={logout}
        disabled={busy}
        className="inline-flex min-h-11 items-center rounded-lg border border-border bg-white px-3 text-sm font-medium text-muted disabled:opacity-50"
      >
        {busy ? '로그아웃 중…' : '로그아웃'}
      </button>
      {error && (
        <p
          role="alert"
          className="absolute right-0 top-full z-30 mt-2 w-64 rounded-lg border border-red-200 bg-white p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}
