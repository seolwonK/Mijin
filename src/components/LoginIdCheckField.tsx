'use client';
import { useId, useRef, useState } from 'react';
type CheckState = 'idle' | 'checking' | 'available' | 'taken' | 'error';
export default function LoginIdCheckField({
  value,
  onChange,
  onAvailabilityChange,
  id,
  className,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  onAvailabilityChange: (available: boolean) => void;
  id?: string;
  className: string;
  error?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [state, setState] = useState<CheckState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const request = useRef(0);
  const latest = useRef(value);
  // Updating an input invalidates an in-flight check immediately, before React commits.
  function handleChange(v: string) {
    latest.current = v;
    request.current++;
    onChange(v);
    setState('idle');
    setMessage(null);
    onAvailabilityChange(false);
  }
  async function check() {
    const trimmed = value.trim();
    const sequence = ++request.current;
    latest.current = value;
    onAvailabilityChange(false);
    if (trimmed.length < 3) {
      setState('error');
      setMessage('아이디는 3자 이상 입력해 주세요');
      return;
    }
    setState('checking');
    setMessage(null);
    try {
      const res = await fetch(
        `/api/auth/check-login-id?loginId=${encodeURIComponent(trimmed)}`,
        { signal: AbortSignal.timeout(15_000) },
      );
      const data = await res.json();
      if (sequence !== request.current || latest.current.trim() !== trimmed)
        return;
      if (!res.ok)
        throw new Error(
          data.error ?? '확인하지 못했습니다. 다시 시도해 주세요.',
        );
      setState(data.available ? 'available' : 'taken');
      setMessage(
        data.available
          ? '사용할 수 있는 아이디입니다'
          : '이미 사용 중인 아이디입니다',
      );
      onAvailabilityChange(!!data.available);
    } catch (e) {
      if (sequence !== request.current) return;
      setState('error');
      setMessage(
        e instanceof TypeError
          ? '인터넷 연결을 확인하고 다시 시도해 주세요.'
          : e instanceof Error
            ? e.message
            : '확인하지 못했습니다.',
      );
    }
  }
  const invalid = !!error || state === 'taken' || state === 'error';
  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium">
        로그인 아이디
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          id={inputId}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          aria-invalid={invalid}
          aria-describedby={`${inputId}-feedback`}
          placeholder="3자 이상"
          autoComplete="username"
          maxLength={30}
          className={`${className} min-w-0 flex-1`}
        />
        <button
          type="button"
          onClick={check}
          disabled={state === 'checking'}
          className="min-h-11 shrink-0 rounded-xl bg-neutral-900 px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          {state === 'checking' ? '확인 중…' : '중복 확인'}
        </button>
      </div>
      <p
        id={`${inputId}-feedback`}
        role={invalid ? 'alert' : 'status'}
        className={`text-sm ${invalid ? 'text-red-700' : state === 'available' ? 'text-emerald-800' : 'text-muted'}`}
      >
        {error ?? message ?? '3자 이상 입력한 뒤 중복 확인을 눌러 주세요.'}
      </p>
    </div>
  );
}
