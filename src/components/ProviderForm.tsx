'use client';

import { useState } from 'react';
import { buttonClasses } from '@/components/Button';

export type ProviderFormValue = {
  loginId: string;
  password: string;
  name: string;
  phone: string;
  address: string;
  lat: string;
  lng: string;
  memo: string;
};

const inputClass =
  'w-full rounded-xl border border-border p-3 text-base focus:border-brand-500 focus:outline-none';

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
  const [geoMsg, setGeoMsg] = useState<string | null>(null);

  function set<K extends keyof ProviderFormValue>(key: K, value: string) {
    setV((prev) => ({ ...prev, [key]: value }));
  }

  async function convertAddress() {
    setGeoMsg(null);
    if (!v.address.trim()) {
      setGeoMsg('주소를 먼저 입력해 주세요');
      return;
    }
    try {
      const res = await fetch(
        `/api/admin/geocode?query=${encodeURIComponent(v.address)}`,
      );
      const data = await res.json();
      if (!data.enabled) {
        setGeoMsg('카카오 API 키가 없어 변환할 수 없습니다. 좌표를 직접 입력해 주세요.');
        return;
      }
      if (!data.result) {
        setGeoMsg('주소를 찾지 못했습니다. 좌표를 직접 입력해 주세요.');
        return;
      }
      setV((prev) => ({
        ...prev,
        lat: String(data.result.lat),
        lng: String(data.result.lng),
      }));
      setGeoMsg('✓ 좌표 변환 완료');
    } catch {
      setGeoMsg('좌표 변환 중 오류가 발생했습니다');
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
      className="mx-auto w-full max-w-2xl space-y-4 p-4"
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
        <div className="flex gap-2">
          <input
            type="text"
            value={v.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="주소"
            aria-label="주소"
            className={inputClass}
          />
          <button
            type="button"
            onClick={convertAddress}
            className="shrink-0 rounded-xl border border-brand-300 bg-brand-50 px-3 text-sm font-bold text-brand-700"
          >
            좌표 변환
          </button>
        </div>
        {geoMsg && <p className="text-sm text-muted">{geoMsg}</p>}
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={v.lat}
            onChange={(e) => set('lat', e.target.value)}
            placeholder="위도 (예: 37.5006)"
            aria-label="위도"
            className={inputClass}
          />
          <input
            type="text"
            inputMode="decimal"
            value={v.lng}
            onChange={(e) => set('lng', e.target.value)}
            placeholder="경도 (예: 127.0364)"
            aria-label="경도"
            className={inputClass}
          />
        </div>
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
        <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">{error}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        className={buttonClasses('primary', 'lg', 'w-full')}
      >
        {busy ? '저장 중…' : isEdit ? '수정 저장' : '업체 등록'}
      </button>
    </form>
  );
}
