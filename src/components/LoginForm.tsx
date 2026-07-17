'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buttonClasses } from '@/components/Button';

// variant: 'c'(결, 소프트-프리미엄 — 업체·개인기술자 로그인) | 'b'(관리자).
// 기존 4역할 공유 컴포넌트라 로그인 로직(제출·역할별 리다이렉트)은 완전히 동일하게 유지하고
// 화면 톤만 분기한다.
type Variant = 'c' | 'b';

export default function LoginForm({
  title,
  footer,
  variant = 'c',
}: {
  title: string;
  footer?: React.ReactNode;
  variant?: Variant;
}) {
  const router = useRouter();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // returnTo 안내 배너 — P3 Q4(로그인 안내 문구 없음) 흡수. useSearchParams는 정적 렌더 경계에
  // Suspense가 필요해, 이미 submit()에서 쓰던 것과 동일하게 window.location.search를 client-only
  // useEffect로 읽는다(SSR 시점엔 window가 없어 렌더에서 직접 읽으면 안 됨).
  const [hasReturnTo, setHasReturnTo] = useState(false);
  useEffect(() => {
    // 마운트 시 1회 URL 읽기 (앱 전반의 usePolling/request-draft 패턴과 동일)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasReturnTo(new URLSearchParams(window.location.search).has('returnTo'));
  }, []);

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

  if (variant === 'b') {
    return (
      <main className="flex min-h-screen w-full flex-col items-center justify-center bg-white p-6 text-fg">
        <div className="w-full max-w-sm md:max-w-md md:rounded-admin-md md:border md:border-border md:bg-white md:p-10">
          <h1 className="mb-6 text-center text-2xl font-bold">{title}</h1>
          {hasReturnTo && (
            <p className="mb-4 rounded-admin-md border border-brand-200 bg-brand-50 p-2.5 text-center text-[13px] text-brand-700">
              로그인이 필요합니다
            </p>
          )}
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
                className="w-full rounded-admin-md border border-border bg-white p-3 text-base text-fg placeholder:text-muted transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none"
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
                className="w-full rounded-admin-md border border-border bg-white p-3 text-base text-fg placeholder:text-muted transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none"
              />
            </div>
            {error && (
              <p role="alert" className="rounded-admin-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-600">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || !loginId || !password}
              className="flex h-14 w-full items-center justify-center rounded-admin-md bg-brand-600 text-lg font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50 enabled:hover:opacity-90 enabled:active:scale-[0.98] enabled:active:opacity-80"
            >
              {busy ? '로그인 중…' : '로그인'}
            </button>
          </form>
          {footer && <div className="mt-4 text-center text-sm text-muted">{footer}</div>}
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm md:max-w-md md:rounded-3xl md:bg-white md:p-10 md:shadow-surface-md">
        <h1 className="mb-6 text-center text-2xl font-bold">{title}</h1>
        {hasReturnTo && (
          <p className="mb-4 rounded-2xl bg-brand-50 p-2.5 text-center text-[13px] font-medium text-brand-700">
            로그인이 필요합니다
          </p>
        )}
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
              className="w-full rounded-xl border border-border p-3 text-base transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none"
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
              className="w-full rounded-xl border border-border p-3 text-base transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none"
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
