import { NextRequest, NextResponse } from 'next/server';
import { reverseGeocode } from '@/lib/geo/kakao';
import { reverseGeocodeOSM } from '@/lib/geo/osm';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lng = parseFloat(searchParams.get('lng') ?? '');
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: '좌표가 올바르지 않습니다' }, { status: 400 });
  }
  // 카카오 키가 있으면 우선(정확한 도로명 주소), 없으면 OSM 무키 폴백으로 지역명 확보
  const address =
    (await reverseGeocode(lat, lng)) ?? (await reverseGeocodeOSM(lat, lng));
  return NextResponse.json({ address });
}
