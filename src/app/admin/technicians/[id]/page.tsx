'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import TechnicianForm, { type TechnicianFormValue } from '@/components/TechnicianForm';

type TechnicianDetail = {
  id: string;
  loginId: string;
  name: string;
  phone: string;
  address: string;
  lat: number | null;
  lng: number | null;
  isActive: boolean;
  memo: string | null;
  employmentType: 'DAILY' | 'PERMANENT';
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  contractStatus: 'DRAFT' | 'SUBMITTED' | 'CONFIRMED' | null;
  appliedAt: string;
  rejectReason: string | null;
};

const APPROVAL_BADGE: Record<string, { label: string; className: string }> = {
  PENDING: { label: '승인 대기', className: 'bg-amber-500 text-white' },
  APPROVED: { label: '승인됨', className: 'bg-green-600 text-white' },
  REJECTED: { label: '거절됨', className: 'bg-neutral-400 text-white' },
};
const EMPLOYMENT_LABEL: Record<string, string> = {
  DAILY: '일일 근로자',
  PERMANENT: '상시 근로자',
};
const CONTRACT_LABEL: Record<string, string> = {
  DRAFT: '서명 전 (배정 불가)',
  SUBMITTED: '서명 전 (배정 불가)',
  CONFIRMED: '서명 완료 (배정 가능)',
};

export default function EditTechnicianPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [detail, setDetail] = useState<TechnicianDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/technicians/${id}`, { cache: 'no-store' });
    if (!res.ok) {
      setError('기술자를 불러오지 못했습니다');
      return;
    }
    setDetail(await res.json());
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function approve() {
    if (
      detail &&
      (detail.lat == null || detail.lng == null) &&
      !window.confirm(
        '좌표가 없는 기술자입니다. 서비스 지역이 설정돼 있으면 지역 기준으로 자동배정되며, 좌표를 입력하면 거리순 배정까지 됩니다.\n그래도 승인할까요?',
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/technicians/${id}/approve`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '승인에 실패했습니다');
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/technicians/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '거절에 실패했습니다');
        return;
      }
      setRejecting(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit(v: TechnicianFormValue) {
    setBusy(true);
    setError(null);
    try {
      const lat = v.lat.trim() === '' ? null : Number(v.lat);
      const lng = v.lng.trim() === '' ? null : Number(v.lng);
      if ((lat != null && !Number.isFinite(lat)) || (lng != null && !Number.isFinite(lng))) {
        setError('위도/경도는 숫자로 입력해 주세요');
        return;
      }
      const res = await fetch(`/api/admin/technicians/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: v.name,
          phone: v.phone,
          address: v.address,
          employmentType: v.employmentType,
          lat,
          lng,
          memo: v.memo.trim() || null,
          ...(v.password ? { password: v.password } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '저장에 실패했습니다');
        return;
      }
      router.replace('/admin/technicians');
    } catch {
      setError('네트워크 오류가 발생했습니다');
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <main className="p-6 text-center text-neutral-400">{error ?? '불러오는 중…'}</main>
    );
  }

  const badge = APPROVAL_BADGE[detail.approvalStatus];

  return (
    <main className="min-h-screen">
      <PageHeader
        title={detail.name}
        back="/admin/technicians"
        crumbs={[
          { label: '개인기술자 관리', href: '/admin/technicians' },
          { label: detail.name, href: `/admin/technicians/${id}` },
        ]}
        right={
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${badge.className}`}
          >
            {badge.label}
          </span>
        }
      />

      <section className="mx-auto max-w-2xl space-y-3 border-b border-neutral-100 p-4">
        <div className="rounded-admin-md border border-border p-4 text-sm">
          <p>
            근로형태: <span className="font-bold">{EMPLOYMENT_LABEL[detail.employmentType]}</span>
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            신청 {new Date(detail.appliedAt).toLocaleString('ko-KR')}
          </p>
          {detail.rejectReason && (
            <p className="mt-1 text-xs text-red-500">거절 사유: {detail.rejectReason}</p>
          )}
        </div>

        {/* 근로계약서 */}
        <Link
          href={`/admin/technicians/${id}/contract`}
          className="flex items-center justify-between rounded-admin-md border border-admin-cyan-ink/25 bg-admin-cyan-ink/5 p-4"
        >
          <div>
            <p className="font-bold text-admin-cyan-ink">근로계약서</p>
            <p className="mt-0.5 text-sm text-admin-cyan-ink/80">
              {detail.contractStatus
                ? CONTRACT_LABEL[detail.contractStatus]
                : '기술자 미작성'}
            </p>
          </div>
          <span className="text-sm font-bold text-admin-cyan-ink">열기 →</span>
        </Link>

        {detail.approvalStatus !== 'APPROVED' && !rejecting && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={approve}
              disabled={busy}
              className="h-12 flex-[2] rounded-admin-md bg-green-600 font-bold text-white disabled:opacity-60"
            >
              가입 승인
            </button>
            {detail.approvalStatus === 'PENDING' && (
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={busy}
                className="h-12 flex-1 rounded-admin-md border border-red-300 font-bold text-red-600 disabled:opacity-60"
              >
                거절
              </button>
            )}
          </div>
        )}
        {rejecting && (
          <div className="space-y-2">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="거절 사유 (신청자가 로그인 시 확인합니다)"
              className="w-full rounded-admin-md border border-border p-3 text-base focus:border-admin-cyan-ink focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={reject}
                disabled={busy}
                className="h-12 flex-1 rounded-admin-md bg-red-600 font-bold text-white disabled:opacity-60"
              >
                거절 확정
              </button>
              <button
                type="button"
                onClick={() => setRejecting(false)}
                disabled={busy}
                className="h-12 flex-1 rounded-admin-md border border-border font-bold text-muted"
              >
                취소
              </button>
            </div>
          </div>
        )}
        {(detail.lat == null || detail.lng == null) && (
          <p className="rounded-admin-md bg-admin-cyan-ink/5 p-3 text-sm text-admin-cyan-ink">
            좌표가 없어 거리순 정렬은 안 되지만, 서비스 지역이 설정돼 있으면 지역
            기준으로 자동배정됩니다. 정확한 거리 배정을 원하면 아래에서 좌표를 입력하세요.
          </p>
        )}
        {error && (
          <p className="rounded-admin-md bg-red-50 p-3 text-sm font-medium text-red-600">
            {error}
          </p>
        )}
      </section>

      <TechnicianForm
        initial={{
          loginId: detail.loginId,
          password: '',
          name: detail.name,
          phone: detail.phone,
          address: detail.address,
          employmentType: detail.employmentType,
          lat: detail.lat == null ? '' : String(detail.lat),
          lng: detail.lng == null ? '' : String(detail.lng),
          memo: detail.memo ?? '',
        }}
        isEdit
        onSubmit={submitEdit}
        busy={busy}
        error={null}
      />
    </main>
  );
}
