import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { geocode } from '@/lib/geo';

// 업체 등록 폼의 [좌표 변환] 버튼용
export async function GET(req: NextRequest) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query')?.trim();
  if (!query) {
    return NextResponse.json({ error: '주소를 입력해 주세요' }, { status: 400 });
  }
  // OSM 무키 폴백이 항상 있으므로 변환 기능 자체는 상시 사용 가능
  const result = await geocode(query);
  return NextResponse.json({ result, enabled: true });
}
