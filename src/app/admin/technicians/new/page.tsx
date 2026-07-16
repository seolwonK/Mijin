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
      const lat = v.lat.trim() === '' ? null : Number(v.lat);
      const lng = v.lng.trim() === '' ? null : Number(v.lng);
      if ((lat != null && !Number.isFinite(lat)) || (lng != null && !Number.isFinite(lng))) {
        setError('위도/경도는 숫자로 입력해 주세요');
        return;
      }
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
          lat,
          lng,
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
    <main className="min-h-screen">
      <PageHeader title="개인기술자 직접 등록" back="/admin/technicians" />

      <div className="mx-auto w-full max-w-2xl space-y-2 p-4">
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
