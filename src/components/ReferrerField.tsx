'use client';

import { useId, useRef, useState } from 'react';

export type ReferrerSelection = {
  userId: string;
  name: string;
  type: '업체' | '전기기사';
};

type Candidate = {
  userId: string;
  maskedName: string;
  type: '업체' | '전기기사';
};

// 가입 3경로(업체·전기기사 셀프, 관리자 직접) + 관리자 소급 지정에서 공용으로 쓰는
// 추천인 전화번호 조회 위젯. 결(mobile)·관제탑(admin) 두 톤을 variant로 구분한다.
const VARIANT_CLASS = {
  mobile: {
    input:
      'min-h-11 min-w-0 w-full rounded-xl border border-border bg-white p-3 text-base text-fg placeholder:text-muted transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none',
    button:
      'min-h-11 shrink-0 rounded-xl bg-neutral-900 px-4 text-sm font-bold text-white transition disabled:opacity-50 enabled:hover:bg-neutral-950 enabled:active:scale-[0.98]',
    candidate:
      'min-h-11 min-w-0 w-full rounded-xl border border-border p-3 text-left text-sm transition-colors hover:border-brand-500',
    chip: 'flex items-center justify-between rounded-xl border border-brand-300 bg-brand-50 p-3',
  },
  admin: {
    input:
      'min-h-11 min-w-0 w-full rounded-admin-md border border-border p-3 text-base transition-colors focus:border-admin-cyan-ink focus:ring-2 focus:ring-admin-cyan-ink/20 focus:outline-none',
    button:
      'min-h-11 shrink-0 rounded-admin-md border border-admin-cyan-ink/30 bg-admin-cyan-ink/5 px-4 text-sm font-bold text-admin-cyan-ink transition disabled:opacity-50 enabled:hover:bg-admin-cyan-ink/10 enabled:active:scale-[0.98] enabled:active:bg-admin-cyan-ink/15',
    candidate:
      'min-h-11 min-w-0 w-full rounded-admin-md border border-border p-3 text-left text-sm transition-colors hover:border-admin-cyan-ink',
    chip: 'flex items-center justify-between rounded-admin-md border border-admin-cyan-ink/30 bg-admin-cyan-ink/5 p-3',
  },
} as const;

export default function ReferrerField({
  selected,
  onSelectedChange,
  variant = 'mobile',
  disabled = false,
}: {
  selected: ReferrerSelection | null;
  onSelectedChange: (v: ReferrerSelection | null) => void;
  variant?: 'mobile' | 'admin';
  disabled?: boolean;
}) {
  const inputId = useId();
  const sequence = useRef(0);
  const cls = VARIANT_CLASS[variant];
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    const request = ++sequence.current;
    setError(null);
    setCandidates(null);
    setSearched(false);
    if (!phone.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/referrer/lookup', {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (request !== sequence.current) return;
      if (!res.ok) {
        setError(data.error ?? '조회에 실패했습니다');
        return;
      }
      setSearched(true);
      if (data.matches.length > 0) setCandidates(data.matches);
    } catch {
      if (request !== sequence.current) return;
      setError('네트워크 오류가 발생했습니다');
    } finally {
      if (request === sequence.current) setBusy(false);
    }
  }

  if (selected) {
    return (
      <div className={cls.chip}>
        <span className="text-sm font-medium">
          {selected.name}{' '}
          <span className="text-xs text-muted">({selected.type})</span>
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={() => onSelectedChange(null)}
            className="min-h-11 px-3 text-sm font-bold text-red-700 transition-colors hover:text-red-700"
          >
            해제
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-medium">
        추천인 전화번호
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          aria-describedby={error ? `${inputId}-error` : undefined}
          aria-invalid={!!error}
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => {
            sequence.current++;
            setBusy(false);
            setPhone(e.target.value);
            setCandidates(null);
            setSearched(false);
            setError(null);
          }}
          placeholder="추천인 전화번호"
          aria-label="추천인 전화번호"
          disabled={disabled}
          className={cls.input}
        />
        <button
          type="button"
          onClick={search}
          disabled={disabled || busy || !phone.trim()}
          className={cls.button}
        >
          {busy ? '조회 중…' : '확인'}
        </button>
      </div>
      {error && (
        <p
          id={`${inputId}-error`}
          role="alert"
          className="text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {searched && !candidates && !error && (
        <p className="text-xs text-muted">회원을 찾을 수 없습니다</p>
      )}
      {candidates && (
        <div className="space-y-1">
          {candidates.map((c) => (
            <button
              key={c.userId}
              type="button"
              onClick={() => {
                onSelectedChange({
                  userId: c.userId,
                  name: c.maskedName,
                  type: c.type,
                });
                setCandidates(null);
                setSearched(false);
                setPhone('');
              }}
              className={cls.candidate}
            >
              {c.maskedName}{' '}
              <span className="text-xs text-muted">({c.type})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
