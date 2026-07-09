'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import RegionMultiSelect from '@/components/RegionMultiSelect';
import { buttonClasses } from '@/components/Button';

const inputClass =
  'w-full rounded-xl border border-neutral-300 bg-white p-3 text-base text-fg placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none';

type Profile = {
  loginId: string;
  name: string;
  phone: string;
  address: string;
  regions: string[];
  isActive: boolean;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  bizRegNo: string | null;
};

const APPROVAL: Record<string, { label: string; className: string }> = {
  APPROVED: { label: '승인 완료', className: 'bg-green-100 text-green-700' },
  PENDING: { label: '승인 대기', className: 'bg-amber-100 text-amber-700' },
  REJECTED: { label: '승인 거절', className: 'bg-red-100 text-red-700' },
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="text-right font-medium text-fg">{value}</span>
    </div>
  );
}

export default function PartnerProfilePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 편집 필드
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [regions, setRegions] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/partner/profile', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) {
          setLoadError(data.error ?? '불러오지 못했습니다');
          return;
        }
        const prof: Profile = data;
        setP(prof);
        setPhone(prof.phone);
        setAddress(prof.address);
        setRegions(prof.regions);
        setIsActive(prof.isActive);
      } catch {
        setLoadError('네트워크 오류가 발생했습니다');
      }
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFlash(null);
    setBusy(true);
    try {
      const res = await fetch('/api/partner/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, address, regions, isActive }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '저장에 실패했습니다');
        return;
      }
      setFlash('저장되었습니다');
      setTimeout(() => setFlash(null), 3000);
    } catch {
      setError('네트워크 오류가 발생했습니다');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <main className="min-h-screen">
        <PageHeader title="내 정보" back="/partner" />
        <p role="alert" className="m-4 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-600">
          {loadError}
        </p>
      </main>
    );
  }
  if (!p) {
    return (
      <main className="min-h-screen">
        <PageHeader title="내 정보" back="/partner" />
        <p className="p-6 text-center text-muted">불러오는 중…</p>
      </main>
    );
  }

  const status = APPROVAL[p.approvalStatus] ?? APPROVAL.PENDING;

  return (
    <main className="min-h-screen">
      <PageHeader title="내 정보" back="/partner" />

      <form onSubmit={save} className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-10 md:py-8">
        {/* 신원 정보 (읽기전용) */}
        <section className="rounded-2xl border border-border bg-white p-4 shadow-card md:p-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">업체 정보</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${status.className}`}>
              {status.label}
            </span>
          </div>
          <InfoRow label="업체명" value={p.name} />
          <InfoRow label="아이디" value={p.loginId} />
          {p.bizRegNo && <InfoRow label="사업자등록번호" value={p.bizRegNo} />}
          <p className="pt-1 text-xs text-muted">
            업체명·아이디·사업자번호 변경은 관리자에게 문의해 주세요.
          </p>
        </section>

        {/* 편집 항목 */}
        <section className="space-y-3 rounded-2xl border border-border bg-white p-4 shadow-card md:p-6">
          <h2 className="text-sm font-semibold">연락처 · 위치</h2>
          <div>
            <label htmlFor="phone" className="mb-1 block text-xs font-medium text-muted">
              전화번호
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="address" className="mb-1 block text-xs font-medium text-muted">
              주소
            </label>
            <input
              id="address"
              type="text"
              autoComplete="street-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-muted">
              주소를 바꾸면 좌표가 다시 계산되어 배정 거리 산정에 반영됩니다.
            </p>
          </div>
        </section>

        <section className="space-y-2 rounded-2xl border border-border bg-white p-4 shadow-card md:p-6">
          <h2 className="text-sm font-semibold">서비스 가능 지역</h2>
          <p className="text-xs text-muted">
            선택한 지역의 요청만 받습니다. 비워두면 전 지역을 받습니다.
          </p>
          <RegionMultiSelect value={regions} onChange={setRegions} />
        </section>

        <section className="rounded-2xl border border-border bg-white p-4 shadow-card md:p-6">
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-semibold">영업 상태</span>
              <span className="mt-0.5 block text-xs text-muted">
                끄면 새 배정을 받지 않습니다(진행 중인 건은 유지).
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              onClick={() => setIsActive((v) => !v)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                isActive ? 'bg-brand-600' : 'bg-neutral-300'
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  isActive ? 'left-0.5 translate-x-5' : 'left-0.5'
                }`}
              />
            </button>
          </label>
        </section>

        {flash && (
          <p className="rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">
            ✅ {flash}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className={buttonClasses('primary', 'lg', 'w-full')}>
          {busy ? '저장 중…' : '저장하기'}
        </button>
      </form>
    </main>
  );
}
