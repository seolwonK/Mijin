'use client';

import { useState } from 'react';

export type LocationValue = {
  lat: number | null;
  lng: number | null;
  address: string;
};

export default function LocationPicker({
  value,
  onChange,
}: {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  function locate() {
    if (!navigator.geolocation) {
      setStatus('error');
      return;
    }
    setStatus('loading');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let address = value.address;
        try {
          const res = await fetch(`/api/geo/reverse?lat=${lat}&lng=${lng}`);
          const data = await res.json();
          if (data.address) address = data.address;
        } catch {
          // 역지오코딩 실패해도 좌표는 유지
        }
        onChange({ lat, lng, address });
        setStatus('ok');
      },
      () => setStatus('error'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={locate}
        disabled={status === 'loading'}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-300 bg-blue-50 p-3 text-base font-medium text-blue-700 disabled:opacity-60"
      >
        {status === 'loading' ? '위치 확인 중…' : '📍 내 위치 확인'}
      </button>
      {status === 'ok' && value.lat != null && (
        <p className="text-sm text-green-700">
          ✓ 위치가 확인되었습니다 ({value.lat.toFixed(5)}, {value.lng?.toFixed(5)})
        </p>
      )}
      {status === 'error' && (
        <p className="text-sm text-red-600">
          위치를 가져오지 못했습니다. 아래에 주소를 직접 입력해 주세요.
        </p>
      )}
      <input
        type="text"
        value={value.address}
        onChange={(e) => onChange({ ...value, address: e.target.value })}
        placeholder="주소 (예: 서울 강남구 역삼동 ○○아파트 101동)"
        className="w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}
