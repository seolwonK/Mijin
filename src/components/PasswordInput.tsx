'use client';

import { useState } from 'react';

// 표시/숨김 토글이 달린 비밀번호 입력 — 가입 폼(tech/partner signup) 공용.
export default function PasswordInput({
  value,
  onChange,
  id,
  placeholder,
  className,
  autoComplete = 'new-password',
  ariaLabel = '비밀번호',
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  placeholder?: string;
  className: string;
  autoComplete?: string;
  ariaLabel?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        id={id}
        aria-label={ariaLabel}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`${className} pr-14`}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? '비밀번호 숨기기' : '비밀번호 표시'}
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-neutral-100 active:bg-neutral-200"
      >
        {show ? '숨김' : '표시'}
      </button>
    </div>
  );
}
