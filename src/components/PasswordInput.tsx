'use client';
import { useId, useState } from 'react';
export default function PasswordInput({
  value,
  onChange,
  id,
  placeholder,
  className,
  autoComplete = 'new-password',
  ariaLabel = '비밀번호',
  showLabel = true,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  placeholder?: string;
  className: string;
  autoComplete?: string;
  ariaLabel?: string;
  showLabel?: boolean;
  error?: string;
}) {
  const [show, setShow] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div>
      {showLabel && (
        <label htmlFor={inputId} className="mb-1 block text-sm font-medium">
          {ariaLabel}
        </label>
      )}
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          id={inputId}
          aria-label={ariaLabel}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={`${className} pr-16`}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? `${ariaLabel} 숨기기` : `${ariaLabel} 표시`}
          aria-pressed={show}
          className="absolute right-1 top-1/2 min-h-11 min-w-11 -translate-y-1/2 rounded-lg px-2 text-sm font-semibold text-muted"
        >
          {show ? '숨김' : '표시'}
        </button>
      </div>
      {error && (
        <p
          id={`${inputId}-error`}
          role="alert"
          className="mt-1 text-sm text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}
