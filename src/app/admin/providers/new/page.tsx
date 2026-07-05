'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ProviderForm, { type ProviderFormValue } from '@/components/ProviderForm';

export default function NewProviderPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(v: ProviderFormValue) {
    setBusy(true);
    setError(null);
    try {
      const lat = v.lat.trim() === '' ? null : Number(v.lat);
      const lng = v.lng.trim() === '' ? null : Number(v.lng);
      if ((lat != null && !Number.isFinite(lat)) || (lng != null && !Number.isFinite(lng))) {
        setError('위도/경도는 숫자로 입력해 주세요');
        return;
      }
      const res = await fetch('/api/admin/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loginId: v.loginId,
          password: v.password,
          name: v.name,
          phone: v.phone,
          address: v.address,
          lat,
          lng,
          memo: v.memo.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '등록에 실패했습니다');
        return;
      }
      router.replace('/admin/providers');
    } catch {
      setError('네트워크 오류가 발생했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen">
      <header className="flex items-center gap-3 border-b border-gray-200 p-4">
        <Link href="/admin/providers" className="text-xl">
          ←
        </Link>
        <h1 className="text-lg font-bold">업체 등록</h1>
      </header>
      <ProviderForm
        initial={{
          loginId: '',
          password: '',
          name: '',
          phone: '',
          address: '',
          lat: '',
          lng: '',
          memo: '',
        }}
        isEdit={false}
        onSubmit={submit}
        busy={busy}
        error={error}
      />
    </main>
  );
}
