import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { geocode } from '@/lib/geo/kakao';

// 업체 등록 폼의 [좌표 변환] 버튼용
export async function GET(req: NextRequest) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query')?.trim();
  if (!query) {
    return NextResponse.json({ error: '주소를 입력해 주세요' }, { status: 400 });
  }
  const enabled = !!process.env.KAKAO_REST_API_KEY?.trim();
  const result = await geocode(query);
  return NextResponse.json({ result, enabled });
}
