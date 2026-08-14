'use client';

import { useState } from 'react';

type CheckState = 'idle' | 'checking' | 'available' | 'taken' | 'error';

// 아이디 입력 + 중복 확인 버튼 — 가입 폼(tech/partner signup) 공용.
// 확인 후 아이디를 고치면 결과를 무효화하고 부모에 false 를 알린다.
// 최종 차단은 가입 API 의 409 가 담당하므로 여기는 UX 보조 검증이다.
export default function LoginIdCheckField({
  value,
  onChange,
  onAvailabilityChange,
  id,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onAvailabilityChange: (available: boolean) => void;
  id?: string;
  className: string;
}) {
  const [state, setState] = useState<CheckState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  function handleChange(v: string) {
    onChange(v);
    if (state !== 'idle') {
      setState('idle');
      setMessage(null);
      onAvailabilityChange(false);
    }
  }

  async function check() {
    const trimmed = value.trim();
    if (trimmed.length < 3) {
      setState('error');
      setMessage('아이디는 3자 이상 입력해 주세요');
      return;
    }
    setState('checking');
    setMessage(null);
    onAvailabilityChange(false);
    try {
      const res = await fetch(
        `/api/auth/check-login-id?loginId=${encodeURIComponent(trimmed)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setState('error');
        setMessage(data.error ?? '확인에 실패했습니다');
        return;
      }
      if (data.available) {
        setState('available');
        setMessage('사용할 수 있는 아이디입니다');
        onAvailabilityChange(true);
      } else {
        setState('taken');
        setMessage('이미 사용 중인 아이디입니다');
      }
    } catch {
      setState('error');
      setMessage('네트워크 오류가 발생했습니다');
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          id={id}
          aria-label="로그인 아이디"
          placeholder="로그인 아이디 (3자 이상)"
          autoComplete="username"
          className={`${className} flex-1`}
        />
        <button
          type="button"
          onClick={check}
          disabled={state === 'checking' || value.trim().length < 3}
          className="shrink-0 rounded-xl bg-neutral-900 px-4 text-sm font-bold text-white transition-colors ease-portal enabled:hover:bg-neutral-950 disabled:opacity-50"
        >
          {state === 'checking' ? '확인 중…' : '중복 확인'}
        </button>
      </div>
      {message && (
        <p
          className={`text-sm font-medium ${
            state === 'available' ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
