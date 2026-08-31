import { NextRequest, NextResponse } from 'next/server';
import { reverseGeocode } from '@/lib/geo';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lng = parseFloat(searchParams.get('lng') ?? '');
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: '좌표가 올바르지 않습니다' }, { status: 400 });
  }
  // 공급자 체인(카카오 키 있으면 우선 → OSM 무키 폴백)은 lib/geo 로 일원화
  const address = await reverseGeocode(lat, lng);
  return NextResponse.json({ address });
}
