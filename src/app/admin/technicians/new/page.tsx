'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import TechnicianForm, { type TechnicianFormValue } from '@/components/TechnicianForm';
import ReferrerField, { type ReferrerSelection } from '@/components/ReferrerField';

export default function NewTechnicianPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referrer, setReferrer] = useState<ReferrerSelection | null>(null);

  async function submit(v: TechnicianFormValue) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/technicians', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loginId: v.loginId,
          password: v.password,
          name: v.name,
          phone: v.phone,
          address: v.address,
          employmentType: v.employmentType,
          memo: v.memo.trim() || null,
          ...(referrer ? { referrerUserId: referrer.userId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '등록에 실패했습니다');
        return;
      }
      router.replace('/admin/technicians');
    } catch {
      setError('네트워크 오류가 발생했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen md:bg-surface">
      <PageHeader title="전기기사 직접 등록" back="/admin/technicians" width="max-w-[900px]" />

      <div className="mx-auto w-full max-w-[900px] space-y-2 p-4">
        <label className="text-sm font-semibold">추천인 (선택)</label>
        <ReferrerField selected={referrer} onSelectedChange={setReferrer} variant="admin" />
      </div>

      <TechnicianForm
        initial={{
          loginId: '',
          password: '',
          name: '',
          phone: '',
          address: '',
          employmentType: 'DAILY',
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
