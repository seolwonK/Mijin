'use client';
import { useState } from 'react';

export default function PortalLoadState({
  error,
  loading,
  retry,
  label = '내용',
  stale = false,
}: {
  error?: string | null;
  loading?: boolean;
  retry?: () => unknown | Promise<unknown>;
  label?: string;
  stale?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  if (error)
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      >
        <div className="min-w-0">
          <p className="font-semibold">
            {label}
            {stale
              ? '의 최신 정보를 가져오지 못했습니다'
              : '을 불러오지 못했습니다'}
          </p>
          <p className="mt-1">{error}</p>
          {stale && (
            <p className="mt-1">마지막으로 확인한 내용을 표시하고 있습니다.</p>
          )}
        </div>
        {retry && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await retry();
              } finally {
                setBusy(false);
              }
            }}
            className="min-h-11 shrink-0 rounded-lg border border-amber-300 bg-white px-4 font-semibold disabled:opacity-60"
          >
            {busy ? '확인 중…' : '다시 시도'}
          </button>
        )}
      </div>
    );
  if (loading)
    return (
      <div
        role="status"
        className="rounded-xl border border-border bg-white p-4 text-sm text-muted"
      >
        {label}을 불러오는 중…
      </div>
    );
  return null;
}
