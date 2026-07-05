// OpenStreetMap Nominatim 역지오코딩 (무키 폴백).
// 카카오 REST 키가 없을 때 좌표를 실제 지역명으로 변환한다.
// 참고: Nominatim 이용정책상 초당 1회 제한·User-Agent 필수. 운영 트래픽이 커지면
// 카카오/브이월드(VWorld) 키 사용을 권장한다.
const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';

export async function reverseGeocodeOSM(
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      `${NOMINATIM}?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ko&zoom=18`,
      {
        headers: {
          'User-Agent': 'mijin-dispatch/1.0 (electrical dispatch service)',
        },
        signal: controller.signal,
      },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return formatKoreanAddress(data.display_name);
  } catch {
    return null;
  }
}

// display_name은 작은 단위 → 큰 단위 순서
// 예: "63, 테헤란로, 역삼동, 강남구, 서울특별시, 06232, 대한민국"
// → 국가·우편번호·번지(숫자) 제거 후 큰 단위부터 재조합
function formatKoreanAddress(displayName?: string): string | null {
  if (!displayName) return null;
  const parts = displayName
    .split(',')
    .map((s) => s.trim())
    .filter(
      (s) =>
        s !== '' &&
        s !== '대한민국' &&
        s !== 'South Korea' &&
        !/^\d[\d-]*$/.test(s), // 우편번호·번지 등 숫자 토큰 제거
    );
  if (parts.length === 0) return null;
  return parts.reverse().join(' ');
}
