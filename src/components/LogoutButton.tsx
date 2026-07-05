'use client';

import { useRouter } from 'next/navigation';

export default function LogoutButton({ loginPath }: { loginPath: string }) {
  const router = useRouter();
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace(loginPath);
  }
  return (
    <button type="button" onClick={logout} className="text-sm text-gray-500 underline">
      로그아웃
    </button>
  );
}
