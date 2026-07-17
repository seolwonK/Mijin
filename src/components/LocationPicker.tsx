'use client';

import { useState } from 'react';
import { MapPinIcon, SearchIcon } from '@/components/icons';

// Daum 우편번호 검색(#9) — 자유 텍스트 오타 주소는 지오코딩 실패 → 거리순 추천 품질 저하로
// 이어지므로, 정확한 도로명 주소를 고를 수 있는 검색 경로를 추가한다. 스크립트는 버튼을
// 눌렀을 때만 지연 로드한다(랜딩·접수 초기 로드에 영향 없음).
type DaumPostcodeData = { roadAddress: string; jibunAddress: string; buildingName?: string };
type DaumGlobal = {
  daum?: { Postcode: new (opts: { oncomplete: (data: DaumPostcodeData) => void }) => { open: () => void } };
};

let postcodeScript: Promise<void> | null = null;
function loadPostcodeScript(): Promise<void> {
  if ((window as unknown as DaumGlobal).daum?.Postcode) return Promise.resolve();
  postcodeScript ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    s.onload = () => resolve();
    s.onerror = () => {
      postcodeScript = null;
      reject(new Error('postcode script load failed'));
    };
    document.head.appendChild(s);
  });
  return postcodeScript;
}

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
  const [searchError, setSearchError] = useState(false);

  async function searchAddress() {
    setSearchError(false);
    try {
      await loadPostcodeScript();
      const daum = (window as unknown as DaumGlobal).daum;
      if (!daum) throw new Error('daum unavailable');
      new daum.Postcode({
        oncomplete: (data) => {
          const base = data.roadAddress || data.jibunAddress;
          const addr = data.buildingName ? `${base} ${data.buildingName}` : base;
          // 검색 주소는 GPS 좌표와 무관하게 텍스트만 교체한다(좌표는 현장 위치로 유지).
          onChange({ ...value, address: `${addr} ` });
        },
      }).open();
    } catch {
      setSearchError(true);
    }
  }

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
      <div className="flex gap-2">
        <button
          type="button"
          onClick={locate}
          disabled={status === 'loading'}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-brand-300 bg-brand-50 p-3 text-base font-medium text-brand-700 transition disabled:cursor-not-allowed disabled:opacity-60 enabled:hover:bg-brand-100 enabled:active:scale-[0.98] enabled:active:bg-brand-200"
        >
          {status === 'loading' ? (
            '위치 확인 중…'
          ) : (
            <>
              <MapPinIcon className="h-4 w-4 shrink-0" />
              내 위치로 채우기
            </>
          )}
        </button>
        <button
          type="button"
          onClick={searchAddress}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white p-3 text-base font-medium text-neutral-700 transition hover:bg-neutral-50 active:scale-[0.98] active:bg-neutral-100"
        >
          <SearchIcon className="h-4 w-4 shrink-0" />
          주소 검색
        </button>
      </div>
      {searchError && (
        <p className="text-sm text-red-600">
          주소 검색을 불러오지 못했습니다. 아래에 직접 입력해 주세요.
        </p>
      )}
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
      {/* 검색/GPS 결과 뒤에 동·호수 등 상세를 덧붙이는 입력란 */}
      <input
        type="text"
        value={value.address}
        onChange={(e) => onChange({ ...value, address: e.target.value })}
        placeholder="주소 (예: 서울 강남구 역삼동 ○○아파트 101동)"
        className="w-full rounded-xl border border-border p-3 text-base transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none"
      />
    </div>
  );
}
