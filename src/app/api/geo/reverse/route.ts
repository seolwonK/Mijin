import { NextRequest, NextResponse } from 'next/server';
import { reverseGeocode } from '@/lib/geo/kakao';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lng = parseFloat(searchParams.get('lng') ?? '');
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: '좌표가 올바르지 않습니다' }, { status: 400 });
  }
  const address = await reverseGeocode(lat, lng);
  return NextResponse.json({ address });
}
