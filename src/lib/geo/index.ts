// 지오코딩 단일 진입점 — 공급자 체인.
// 1) 카카오 REST (KAKAO_REST_API_KEY 가 설정된 경우에만, 한국 주소 정확도 최고)
// 2) OpenStreetMap Nominatim (무키·무가입 폴백, 도로명주소 실측 검증)
// 둘 다 실패하면 null → 호출부는 좌표 수동 입력/생략 폴백으로 동작한다.
import {
  geocode as kakaoGeocode,
  reverseGeocode as kakaoReverse,
} from './kakao';
import { geocodeOSM, reverseGeocodeOSM } from './osm';

export async function geocode(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  return (await kakaoGeocode(address)) ?? (await geocodeOSM(address));
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  return (await kakaoReverse(lat, lng)) ?? (await reverseGeocodeOSM(lat, lng));
}
