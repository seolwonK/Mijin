'use client';

import { useState } from 'react';

export type ProviderFormValue = {
  loginId: string;
  password: string;
  name: string;
  phone: string;
  address: string;
  memo: string;
};

// "관제탑"(B) B-라이트 — 절제된 라디우스(admin-md) + 사이언 잉크 포커스로 고객용 브랜드 톤과
// 관리자 폼을 구분한다(배경은 기존 라이트 뉴트럴 그대로).
const inputClass =
  'w-full rounded-admin-md border border-border p-3 text-base focus:border-admin-cyan-ink focus:outline-none';

export default function ProviderForm({
  initial,
  isEdit,
  onSubmit,
  busy,
  error,
}: {
  initial: ProviderFormValue;
  isEdit: boolean;
  onSubmit: (v: ProviderFormValue) => void;
  busy: boolean;
  error: string | null;
}) {
  const [v, setV] = useState(initial);

  function set<K extends keyof ProviderFormValue>(key: K, value: string) {
    setV((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
      className="mx-auto w-full max-w-[900px] space-y-4 p-4"
    >
      <div className="space-y-2">
        <label className="text-sm font-semibold">계정</label>
        <input
          type="text"
          value={v.loginId}
          onChange={(e) => set('loginId', e.target.value)}
          placeholder="로그인 아이디"
          aria-label="로그인 아이디"
          disabled={isEdit}
          className={`${inputClass} disabled:bg-neutral-100 disabled:text-muted`}
        />
        <input
          type="password"
          value={v.password}
          onChange={(e) => set('password', e.target.value)}
          placeholder={isEdit ? '새 비밀번호 (변경 시에만 입력)' : '비밀번호 (8자 이상)'}
          aria-label="비밀번호"
          className={inputClass}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold">업체 정보</label>
        <input
          type="text"
          value={v.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="업체명"
          aria-label="업체명"
          className={inputClass}
        />
        <input
          type="tel"
          value={v.phone}
          onChange={(e) => set('phone', e.target.value)}
          placeholder="전화번호"
          aria-label="전화번호"
          className={inputClass}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold">위치</label>
        <input
          type="text"
          value={v.address}
          onChange={(e) => set('address', e.target.value)}
          placeholder="주소"
          aria-label="주소"
          className={inputClass}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold">메모 (선택)</label>
        <input
          type="text"
          value={v.memo}
          onChange={(e) => set('memo', e.target.value)}
          placeholder="메모"
          aria-label="메모"
          className={inputClass}
        />
      </div>

      {error && (
        <p className="rounded-admin-md bg-red-50 p-3 text-sm font-medium text-red-600">{error}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="flex h-14 w-full items-center justify-center rounded-admin-md bg-admin-cyan-ink text-lg font-bold text-white transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? '저장 중…' : isEdit ? '수정 저장' : '업체 등록'}
      </button>
    </form>
  );
}
