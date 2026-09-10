import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn() }));
vi.mock('@/lib/matching', () => ({ getCandidates: vi.fn() }));
import { requireSession } from '@/lib/auth';
import { getCandidates } from '@/lib/matching';
import { GET } from '@/app/api/admin/rotation/route';

const candidate = { id: 'p1', key: 'PROVIDER:p1', name: '검증 업체', kind: 'PROVIDER', regions: ['서울특별시 강남구'], eggBalance: 30, coversRegion: true, assigned30d: 2, avgRating: 4, reviewCount: 3 };
const request = (query: string) => new NextRequest(`http://localhost/api/admin/rotation${query}`);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireSession).mockResolvedValue({ role: 'ADMIN', userId: 'admin' } as Awaited<ReturnType<typeof requireSession>>);
  vi.mocked(getCandidates).mockResolvedValue([candidate] as Awaited<ReturnType<typeof getCandidates>>);
});

describe('rotation API 조회 계약', () => {
  it('전국 요약도 관리자 세션을 요구하고 인증 실패 시 데이터를 조회하지 않는다', async () => {
    vi.mocked(requireSession).mockResolvedValue(null);
    expect((await GET(request('?view=overview'))).status).toBe(401);
    expect(getCandidates).not.toHaveBeenCalled();
  });
  it('기존 매칭 대상 조회를 한 번만 재사용하며 요약에서 개인정보를 내려주지 않는다', async () => {
    const response = await GET(request('?view=overview'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(getCandidates).toHaveBeenCalledExactlyOnceWith({ id: 'rotation-board-synthetic', lat: null, lng: null, address: null, urgency: 'CRITICAL' });
    expect(body.totals).toMatchObject({ candidates: 1, providers: 1, technicians: 0 });
    expect(body.recommended).toEqual({ sido: '서울특별시', sigungu: '강남구' });
    expect(JSON.stringify(body)).not.toContain(candidate.name);
    expect(JSON.stringify(body)).not.toContain(candidate.id);
  });
  it('지역 조회의 서버 순서·커버 지역 필터와 안정적인 관리 링크 식별자를 유지한다', async () => {
    vi.mocked(getCandidates).mockResolvedValue([
      { ...candidate, id: 'z', key: 'PROVIDER:z' },
      { ...candidate, id: 'a', key: 'PROVIDER:a' },
      { ...candidate, id: 'excluded', coversRegion: false },
    ] as Awaited<ReturnType<typeof getCandidates>>);
    const body = await (await GET(request('?sido=서울특별시&sigungu=강남구'))).json();
    expect(body.candidates.map((row: { id: string }) => row.id)).toEqual(['z', 'a']);
    expect(body.meta).toMatchObject({ eggApplied: true, criticalNotApplied: true, distanceTieUnresolved: true });
    expect(getCandidates).toHaveBeenCalledWith(expect.objectContaining({ address: '서울특별시 강남구', urgency: 'NORMAL' }), { withStats: true });
  });
  it('기존 지역 입력 검증과 허용되지 않은 조회 방식의 오류를 유지한다', async () => {
    for (const query of ['', '?sido=서울', '?sido=서울특별시&sigungu=없는구', '?view=unknown']) {
      expect((await GET(request(query))).status).toBe(400);
    }
    expect(getCandidates).not.toHaveBeenCalled();
  });
});
