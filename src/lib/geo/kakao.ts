// 카카오 로컬 REST API 프록시. 키가 없으면 null을 반환하고
// 호출부는 주소/좌표 수동 입력 폴백으로 동작한다.
const KAKAO_BASE = 'https://dapi.kakao.com/v2/local';

function apiKey(): string | null {
  const key = process.env.KAKAO_REST_API_KEY;
  return key && key.trim() !== '' ? key.trim() : null;
}

export async function geocode(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const res = await fetch(
      `${KAKAO_BASE}/search/address.json?query=${encodeURIComponent(address)}`,
      { headers: { Authorization: `KakaoAK ${key}` } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const doc = data.documents?.[0];
    if (!doc) return null;
    return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) };
  } catch {
    return null;
  }
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const res = await fetch(
      `${KAKAO_BASE}/geo/coord2address.json?x=${lng}&y=${lat}`,
      { headers: { Authorization: `KakaoAK ${key}` } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const doc = data.documents?.[0];
    return doc?.road_address?.address_name ?? doc?.address?.address_name ?? null;
  } catch {
    return null;
  }
}
