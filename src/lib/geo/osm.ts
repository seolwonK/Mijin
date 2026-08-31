// OpenStreetMap Nominatim 지오코딩·역지오코딩 (무키·무가입 폴백).
// 참고: Nominatim 이용정책상 초당 1회 제한·User-Agent 필수. 호출 지점이
// 가입·정보수정·좌표 변환 버튼·접수 백필 정도라 정책 한도 안에 충분히 든다.
// 트래픽이 커지면 카카오/브이월드(VWorld) 키 사용을 권장한다.
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
const UA = 'jeongiajeossi.com dispatch (contact: nqsolutionai@gmail.com)';

async function nominatimFetch(url: string): Promise<unknown | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// 주소 → 좌표. 도로명주소는 OSM 한국 커버리지가 좋은 편이라 대부분 적중한다
// (테헤란로 152 등 실측 검증). 상세주소(동·호·층 등) 꼬리표 때문에 실패하면
// 꼬리 토큰을 한 번 잘라 재시도한다 — 시 단위까지 뭉개면 엉뚱한 좌표가 되므로
// 보수적으로 1회만.
export async function geocodeOSM(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  const attempt = async (q: string) => {
    const data = (await nominatimFetch(
      `${NOMINATIM_SEARCH}?format=jsonv2&countrycodes=kr&limit=1&accept-language=ko&q=${encodeURIComponent(q)}`,
    )) as Array<{ lat: string; lon: string }> | null;
    const doc = data?.[0];
    if (!doc) return null;
    const lat = parseFloat(doc.lat);
    const lng = parseFloat(doc.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  };

  const query = address.trim();
  if (!query) return null;
  const first = await attempt(query);
  if (first) return first;

  // 상세주소 꼬리표(101동·202호·3층·(건물명) 등)를 떼고 1회 재시도
  const tokens = query.split(/\s+/);
  const tail = tokens[tokens.length - 1];
  const detailTail = /^(\d+호|\d+층|지하\d*|[0-9]+동|\(.+\)|[0-9-]+번지)$/;
  if (tokens.length >= 3 && detailTail.test(tail)) {
    return attempt(tokens.slice(0, -1).join(' '));
  }
  return null;
}

type NominatimAddress = Partial<
  Record<
    | 'state'
    | 'province'
    | 'city'
    | 'county'
    | 'borough'
    | 'city_district'
    | 'suburb'
    | 'quarter'
    | 'village'
    | 'town'
    | 'road'
    | 'house_number',
    string
  >
>;

export async function reverseGeocodeOSM(
  lat: number,
  lng: number,
): Promise<string | null> {
  const data = (await nominatimFetch(
    `${NOMINATIM_REVERSE}?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ko&zoom=18&addressdetails=1`,
  )) as { display_name?: string; address?: NominatimAddress } | null;
  // 구조화 필드 우선: 상호(POI)가 끼거나 건물번호가 빠지는 display_name 파싱 한계 회피
  // → "서울특별시 강남구 테헤란로 152" 형태로 재조합
  const a = data?.address;
  if (a) {
    const parts = [
      // 도(道)를 항상 앞에 — '경기도 광주시'와 '광주광역시' 혼동 방지
      a.state ?? a.province,
      a.city,
      a.borough ?? a.county ?? a.city_district,
      a.suburb && !a.road ? a.suburb : null, // 도로명이 없을 때만 동 단위 사용
      a.village ?? a.town,
      a.road,
      a.house_number,
    ].filter((s): s is string => !!s && s.trim() !== '');
    if (parts.length >= 2) return [...new Set(parts)].join(' ');
  }
  return formatKoreanAddress(data?.display_name);
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
