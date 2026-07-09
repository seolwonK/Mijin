'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import BackButton from '@/components/BackButton';
import { usePolling } from '@/components/usePolling';

type TechnicianRow = {
  id: string;
  loginId: string;
  name: string;
  phone: string;
  address: string;
  isActive: boolean;
  employmentType: 'DAILY' | 'PERMANENT';
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  contractStatus: 'DRAFT' | 'SUBMITTED' | 'CONFIRMED' | null;
  appliedAt: string;
  rejectReason: string | null;
};

const EMPLOYMENT_LABEL: Record<string, string> = {
  DAILY: '일일',
  PERMANENT: '상시',
};
const CONTRACT_LABEL: Record<string, string> = {
  DRAFT: '작성 중',
  SUBMITTED: '제출됨',
  CONFIRMED: '확정',
};

export default function AdminTechniciansPage() {
  const router = useRouter();
  const { data, error, refresh } = usePolling<{ technicians: TechnicianRow[] }>(
    '/api/admin/technicians',
    15_000,
  );
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const all = data?.technicians ?? [];
  const pending = all.filter((t) => t.approvalStatus === 'PENDING');
  const approved = all.filter((t) => t.approvalStatus === 'APPROVED');
  const rejected = all.filter((t) => t.approvalStatus === 'REJECTED');

  async function toggleActive(t: TechnicianRow) {
    if (
      t.isActive &&
      !window.confirm(
        `${t.name}을(를) 비활성으로 바꿀까요?\n비활성 기술자는 배정 대상에서 제외됩니다.`,
      )
    )
      return;
    setTogglingId(t.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/technicians/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !t.isActive }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError((data as { error?: string }).error ?? '상태 변경에 실패했습니다');
        return;
      }
      await refresh();
    } catch {
      setActionError('네트워크 오류가 발생했습니다');
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-gray-200 bg-white/95 px-4 py-2 backdrop-blur">
        <BackButton fallback="/admin" />
        <h1 className="text-lg font-bold">개인기술자 관리</h1>
        <Link
          href="/admin/technicians/new"
          className="ml-auto rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white active:bg-blue-700"
        >
          + 직접 등록
        </Link>
      </header>

      <div className="space-y-6 p-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {actionError && (
          <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">
            {actionError}
          </p>
        )}

        {pending.length > 0 && (
          <section>
            <h2 className="mb-2 font-semibold text-amber-700">
              🕐 승인 대기 ({pending.length})
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {pending.map((t) => (
                <Link
                  key={t.id}
                  href={`/admin/technicians/${t.id}`}
                  className="block rounded-2xl border border-amber-400 bg-amber-50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">
                      {t.name}{' '}
                      <span className="text-xs font-medium text-gray-500">
                        ({EMPLOYMENT_LABEL[t.employmentType]})
                      </span>
                    </span>
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                      심사 필요
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{t.phone}</p>
                  <p className="text-xs text-gray-400">
                    신청 {new Date(t.appliedAt).toLocaleString('ko-KR')}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-2 font-semibold">운영 중 기술자 ({approved.length})</h2>
          {approved.length === 0 && (
            <p className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-400">
              운영 중인 기술자가 없습니다
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {approved.map((t) => (
              <div
                key={t.id}
                onClick={() => router.push(`/admin/technicians/${t.id}`)}
                className={`cursor-pointer rounded-2xl border p-4 active:bg-gray-50 ${
                  t.isActive
                    ? 'border-gray-200 bg-white'
                    : 'border-gray-200 bg-gray-50 opacity-70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold">
                    {t.name}{' '}
                    <span className="text-xs font-medium text-gray-500">
                      ({EMPLOYMENT_LABEL[t.employmentType]})
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleActive(t);
                    }}
                    disabled={togglingId === t.id}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${
                      t.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {togglingId === t.id ? '변경 중…' : t.isActive ? '활성' : '비활성'}
                  </button>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {t.loginId} · {t.phone}
                </p>
                <p className="text-sm text-gray-500">📍 {t.address}</p>
                <p className="mt-1 text-xs text-gray-400">
                  근로계약서:{' '}
                  {t.contractStatus ? CONTRACT_LABEL[t.contractStatus] : '미작성'}
                </p>
              </div>
            ))}
          </div>
        </section>

        {rejected.length > 0 && (
          <section>
            <h2 className="mb-2 font-semibold text-gray-400">
              거절된 신청 ({rejected.length})
            </h2>
            <div className="grid gap-2 opacity-60 sm:grid-cols-2 xl:grid-cols-3">
              {rejected.map((t) => (
                <Link
                  key={t.id}
                  href={`/admin/technicians/${t.id}`}
                  className="block rounded-2xl border border-gray-200 bg-gray-50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{t.name}</span>
                    <span className="rounded-full bg-gray-400 px-2 py-0.5 text-xs font-bold text-white">
                      거절됨
                    </span>
                  </div>
                  {t.rejectReason && (
                    <p className="mt-1 text-xs text-gray-500">사유: {t.rejectReason}</p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
