'use client';

import { useState } from 'react';
import { MapPinIcon } from '@/components/icons';

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
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'ok' | 'notfound' | 'error'
  >('idle');

  function locate() {
    if (!navigator.geolocation) {
      setStatus('error');
      return;
    }
    setStatus('loading');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let address: string | null = null;
        try {
          const res = await fetch(`/api/geo/reverse?lat=${lat}&lng=${lng}`);
          const data = await res.json();
          address = data.address ?? null;
        } catch {
          // 역지오코딩 실패해도 좌표는 확보됨 — 주소는 수동 입력으로 보완
        }
        // 지역명(주소)을 입력란에 채운다. 좌표는 거리 계산용으로만 저장하고 화면엔 노출하지 않는다.
        onChange({ lat, lng, address: address ?? value.address });
        setStatus(address ? 'ok' : 'notfound');
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
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-300 bg-brand-50 p-3 text-base font-medium text-brand-700 disabled:opacity-60"
      >
        {status === 'loading' ? (
          '위치 확인 중…'
        ) : (
          <>
            <MapPinIcon className="h-4 w-4 shrink-0" />
            내 위치로 주소 채우기
          </>
        )}
      </button>
      {status === 'ok' && (
        <p className="text-sm text-green-700">
          ✓ 현재 위치의 주소를 가져왔어요. 상세 주소(동/호수 등)를 덧붙여 주세요.
        </p>
      )}
      {status === 'notfound' && (
        <p className="text-sm text-amber-600">
          위치는 확인했지만 주소를 자동으로 찾지 못했어요. 아래에 주소를 입력해 주세요.
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
        className="w-full rounded-xl border border-border p-3 text-base focus:border-brand-500 focus:outline-none"
      />
    </div>
  );
}
