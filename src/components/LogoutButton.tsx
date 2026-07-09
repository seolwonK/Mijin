'use client';

import { useRouter } from 'next/navigation';

export default function LogoutButton({ loginPath }: { loginPath: string }) {
  const router = useRouter();
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace(loginPath);
  }
  return (
    <button
      type="button"
      onClick={logout}
      className="inline-flex min-h-[40px] items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-100"
    >
      로그아웃
    </button>
  );
}
