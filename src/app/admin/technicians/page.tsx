'use client';

import { useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { buttonClasses } from '@/components/Button';
import { usePolling } from '@/components/usePolling';
import { CardSkeletonGrid } from '@/components/Skeleton';
import { useConfirm } from '@/components/useConfirm';
import AdminDataTable, { type Column } from '@/components/AdminDataTable';

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
  DRAFT: '서명 전',
  SUBMITTED: '서명 전',
  CONFIRMED: '서명 완료 (배정 가능)',
};

type Col = 'name' | 'employmentType' | 'loginId' | 'phone' | 'contractStatus' | 'status';

// "관제탑"(B) B-라이트 롤아웃 — providers/page.tsx와 동일 패턴(AdminDataTable tone="light").
export default function AdminTechniciansPage() {
  const { data, error, refresh } = usePolling<{ technicians: TechnicianRow[] }>(
    '/api/admin/technicians',
    15_000,
  );
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirm, confirmUI] = useConfirm();
  const all = data?.technicians ?? [];
  const loading = !data && !error;
  const pending = all.filter((t) => t.approvalStatus === 'PENDING');
  const approved = all.filter((t) => t.approvalStatus === 'APPROVED');
  const rejected = all.filter((t) => t.approvalStatus === 'REJECTED');

  async function toggleActive(t: TechnicianRow) {
    if (
      t.isActive &&
      !(await confirm({
        title: '기술자 비활성',
        message: `${t.name}을(를) 비활성으로 바꿀까요?\n비활성 기술자는 배정 대상에서 제외됩니다.`,
        confirmText: '비활성으로',
        danger: true,
      }))
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

  const columns: Column<TechnicianRow, Col>[] = [
    {
      key: 'name',
      label: '이름',
      sortable: true,
      sortValue: (t) => t.name,
      render: (t) => (
        <Link href={`/admin/technicians/${t.id}`} className="font-bold text-admin-cyan-ink hover:underline">
          {t.name}
        </Link>
      ),
    },
    { key: 'employmentType', label: '형태', width: '76px', render: (t) => <span className="text-muted">{EMPLOYMENT_LABEL[t.employmentType]}</span> },
    { key: 'loginId', label: '아이디', width: '150px', render: (t) => <span className="font-mono text-muted">{t.loginId}</span> },
    {
      key: 'phone',
      label: '전화',
      width: '140px',
      sortable: true,
      sortValue: (t) => t.phone,
      render: (t) => <span className="font-mono text-muted">{t.phone}</span>,
    },
    {
      key: 'contractStatus',
      label: '근로계약',
      width: '180px',
      render: (t) => (
        <span className={t.contractStatus === 'CONFIRMED' ? 'font-medium text-green-700' : 'text-muted'}>
          {t.contractStatus ? CONTRACT_LABEL[t.contractStatus] : '미작성'}
        </span>
      ),
    },
    {
      key: 'status',
      label: '상태',
      width: '110px',
      align: 'right',
      render: (t) => (
        <button
          type="button"
          onClick={() => toggleActive(t)}
          disabled={togglingId === t.id}
          className={`rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${
            t.isActive ? 'bg-green-100 text-green-700' : 'bg-neutral-200 text-neutral-600'
          }`}
        >
          {togglingId === t.id ? '변경 중…' : t.isActive ? '활성' : '비활성'}
        </button>
      ),
    },
  ];

  return (
    <main className="min-h-screen">
      {/* 모바일: 기존 PageHeader 그대로. 데스크톱: AdminShell 상단 탭이 이미 "기술자 관리"를
          표시하므로 PageHeader 대신 더 얇은 바로 교체 — AC-1 밀도 가드 회복(providers/page.tsx와
          동일 근거). */}
      <div className="md:hidden">
        <PageHeader
          title="개인기술자 관리"
          back="/admin"
          width="max-w-none"
          right={
            <Link href="/admin/technicians/new" className={buttonClasses('primary', 'sm')}>
              + 직접 등록
            </Link>
          }
        />
      </div>
      <div className="hidden items-center justify-between border-b border-border px-4 py-1.5 md:flex">
        <h1 className="text-sm font-bold text-fg">개인기술자 관리</h1>
        <Link href="/admin/technicians/new" className={buttonClasses('primary', 'sm')}>
          + 직접 등록
        </Link>
      </div>

      <div className="space-y-6 px-4 pt-2 pb-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {actionError && (
          <p role="alert" className="rounded-admin-md bg-red-50 p-3 text-sm font-medium text-red-600">
            {actionError}
          </p>
        )}

        {pending.length > 0 && (
          <section>
            <h2 className="mb-2 font-semibold text-amber-700">
              승인 대기 ({pending.length})
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {pending.map((t) => (
                <Link
                  key={t.id}
                  href={`/admin/technicians/${t.id}`}
                  className="block rounded-admin-md border border-amber-400 bg-amber-50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">
                      {t.name}{' '}
                      <span className="text-xs font-medium text-muted">
                        ({EMPLOYMENT_LABEL[t.employmentType]})
                      </span>
                    </span>
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                      심사 필요
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-sm text-neutral-600">{t.phone}</p>
                  <p className="text-xs text-muted">
                    신청 {new Date(t.appliedAt).toLocaleString('ko-KR')}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-1.5 text-sm font-semibold">운영 중 기술자 ({approved.length})</h2>
          {loading && <CardSkeletonGrid count={3} />}
          {!loading && approved.length === 0 && (
            <p className="rounded-admin-md border border-border bg-neutral-50 p-6 text-center text-sm text-muted">
              운영 중인 기술자가 없습니다
            </p>
          )}
          {!loading && approved.length > 0 && (
            <div className="rounded-admin-md border border-border bg-white">
              <AdminDataTable
                tone="light"
                columns={columns}
                rows={approved}
                rowKey={(t) => t.id}
                defaultSort={{ key: 'name', dir: 1 }}
                rowClassName={(t) => (t.isActive ? '' : 'opacity-60')}
              />
            </div>
          )}
        </section>

        {rejected.length > 0 && (
          <section>
            <h2 className="mb-2 font-semibold text-muted">
              거절된 신청 ({rejected.length})
            </h2>
            <div className="grid gap-2 opacity-60 sm:grid-cols-2 xl:grid-cols-3">
              {rejected.map((t) => (
                <Link
                  key={t.id}
                  href={`/admin/technicians/${t.id}`}
                  className="block rounded-admin-md border border-border bg-neutral-50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{t.name}</span>
                    <span className="rounded-full bg-neutral-400 px-2 py-0.5 text-xs font-bold text-white">
                      거절됨
                    </span>
                  </div>
                  {t.rejectReason && (
                    <p className="mt-1 text-xs text-muted">사유: {t.rejectReason}</p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
      {confirmUI}
    </main>
  );
}
