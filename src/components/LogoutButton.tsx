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
      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 active:bg-gray-50"
    >
      로그아웃
    </button>
  );
}
