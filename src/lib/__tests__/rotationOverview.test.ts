import { describe, expect, it } from 'vitest';
import { rotationOverview } from '@/lib/rotationOverview';

describe('지역별 순환 현황 요약', () => {
  const all = { key: 'PROVIDER:all', kind: 'PROVIDER' as const, regions: [], eggBalance: 0 };
  const seoul = { key: 'TECHNICIAN:seoul', kind: 'TECHNICIAN' as const, regions: ['서울특별시'], eggBalance: 30 };
  const multi = { key: 'PROVIDER:multi', kind: 'PROVIDER' as const, regions: ['서울특별시 강남구', '서울특별시 서초구'], eggBalance: 10 };

  it('전국·시도·여러 구 담당을 시도 합계에서 중복 집계하지 않는다', () => {
    const result = rotationOverview([all, seoul, multi, multi]);
    expect(result.totals).toEqual({ candidates: 3, providers: 2, technicians: 1, withEggs: 2 });
    const region = result.regions.find(row => row.sido === '서울특별시')!;
    expect(region.count).toBe(3);
    expect(region.districts.find(row => row.sigungu === '강남구')?.count).toBe(3);
    expect(region.districts.find(row => row.sigungu === '송파구')?.count).toBe(2);
    expect(result.regions.find(row => row.sido === '부산광역시')?.count).toBe(1);
  });
  it('후보가 가장 많은 시도와 그 안의 시군구를 최초 조회 지역으로 고른다', () => {
    const result = rotationOverview([all, { ...multi, regions: ['부산광역시 해운대구'] }]);
    expect(result.recommended).toEqual({ sido: '부산광역시', sigungu: '해운대구' });
  });
  it('세종과 후보 없는 지역을 포함해 17개 시도를 모두 반환한다', () => {
    const result = rotationOverview([{ ...seoul, regions: ['세종특별자치시'] }]);
    expect(result.regions).toHaveLength(17);
    expect(result.recommended).toEqual({ sido: '세종특별자치시', sigungu: '' });
    expect(result.regions.find(row => row.sido === '세종특별자치시')?.districts).toEqual([{ sigungu: '', count: 1 }]);
    expect(rotationOverview([]).totals.candidates).toBe(0);
  });
});
