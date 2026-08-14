// 알 크레딧 정렬 통합 테스트 (ralplan-egg-credit.md B-3, 케이스 (a)~(g)).
// 순수 함수만 — DB 불필요. freeze 테스트(matching-freeze.test.ts)가 기존 사슬을,
// 이 파일이 알 통합 후 사슬과 표시 파생(parity)을 고정한다.
import { describe, expect, it } from 'vitest';

import { compareCandidates, isSameDistrict, type Candidate } from '../matching';
import { deriveRankingBadge } from '../candidateRankingDisplay';

function makeCandidate(overrides: Partial<Candidate> & { key: string }): Candidate {
  return {
    kind: 'PROVIDER',
    id: overrides.key,
    name: 'name',
    phone: '010-0000-0000',
    address: 'address',
    regions: [],
    isActive: true,
    distanceKm: null,
    coversRegion: true,
    rejectedThisRequest: false,
    assigned30d: 0,
    avgRating: 3.0,
    reviewCount: 0,
    eggBalance: 0,
    sameDistrict: false,
    ...overrides,
  };
}

describe('(a)(b) non-CRITICAL — 알 우선, 동률 시 순환 유지', () => {
  it('(a) 알 보유량 desc가 순환·별점·거리보다 우선한다', () => {
    // egg0는 순환(0<9)·별점(5>1)·거리(1<99) 전부 유리하지만 알에서 밀린다
    const egg5 = makeCandidate({ key: 'PROVIDER:a', eggBalance: 5, assigned30d: 9, avgRating: 1, distanceKm: 99 });
    const egg3 = makeCandidate({ key: 'PROVIDER:b', eggBalance: 3, assigned30d: 9, avgRating: 1, distanceKm: 99 });
    const egg0 = makeCandidate({ key: 'PROVIDER:c', eggBalance: 0, assigned30d: 0, avgRating: 5, distanceKm: 1 });
    const sorted = [egg0, egg3, egg5].sort(compareCandidates('NORMAL'));
    expect(sorted.map((c) => c.key)).toEqual(['PROVIDER:a', 'PROVIDER:b', 'PROVIDER:c']);
  });

  it('(b) 알 동률 그룹 안에서는 30일 배정수 asc(순환)가 그대로 작동한다', () => {
    const busy = makeCandidate({ key: 'PROVIDER:busy', eggBalance: 3, assigned30d: 7 });
    const idle = makeCandidate({ key: 'PROVIDER:idle', eggBalance: 3, assigned30d: 1 });
    const sorted = [busy, idle].sort(compareCandidates('URGENT'));
    expect(sorted.map((c) => c.key)).toEqual(['PROVIDER:idle', 'PROVIDER:busy']);
  });

  it('거절이력·지역 커버는 여전히 알보다 상위 티어다', () => {
    const richButRejected = makeCandidate({ key: 'PROVIDER:r', eggBalance: 9, rejectedThisRequest: true });
    const poor = makeCandidate({ key: 'PROVIDER:p', eggBalance: 0 });
    expect([richButRejected, poor].sort(compareCandidates('NORMAL'))[0].key).toBe('PROVIDER:p');

    const richNoRegion = makeCandidate({ key: 'PROVIDER:nr', eggBalance: 9, coversRegion: false });
    expect([richNoRegion, poor].sort(compareCandidates('NORMAL'))[0].key).toBe('PROVIDER:p');
  });
});

describe('(c)(d) CRITICAL — 같은구 우선, 동급 내 알', () => {
  it('(c) 같은구+알0이 옆구 1km+알9를 이긴다 (속도·지역 원칙 유지)', () => {
    const sameGu = makeCandidate({ key: 'PROVIDER:same', sameDistrict: true, eggBalance: 0, distanceKm: 5 });
    const nextGuRich = makeCandidate({ key: 'PROVIDER:next', sameDistrict: false, eggBalance: 9, distanceKm: 1 });
    const sorted = [nextGuRich, sameGu].sort(compareCandidates('CRITICAL'));
    expect(sorted.map((c) => c.key)).toEqual(['PROVIDER:same', 'PROVIDER:next']);
  });

  it('(d) 같은구끼리는 알 desc, 그 다음 거리', () => {
    const a = makeCandidate({ key: 'PROVIDER:a', sameDistrict: true, eggBalance: 2, distanceKm: 9 });
    const b = makeCandidate({ key: 'PROVIDER:b', sameDistrict: true, eggBalance: 5, distanceKm: 9 });
    const c = makeCandidate({ key: 'PROVIDER:c', sameDistrict: true, eggBalance: 5, distanceKm: 3 });
    const sorted = [a, b, c].sort(compareCandidates('CRITICAL'));
    expect(sorted.map((x) => x.key)).toEqual(['PROVIDER:c', 'PROVIDER:b', 'PROVIDER:a']);
  });

  it('CRITICAL은 순환·별점을 여전히 건너뛴다 (알·같은구 외 개입 없음)', () => {
    const worseStats = makeCandidate({ key: 'PROVIDER:w', assigned30d: 9, avgRating: 1, distanceKm: 1 });
    const betterStats = makeCandidate({ key: 'PROVIDER:b', assigned30d: 0, avgRating: 5, distanceKm: 2 });
    expect([betterStats, worseStats].sort(compareCandidates('CRITICAL'))[0].key).toBe('PROVIDER:w');
  });
});

describe('(e) isSameDistrict — 모호 주소 역전 차단', () => {
  const gangnam = { sido: '서울특별시', sigungu: '강남구' };
  it('정확 일치만 true', () => {
    expect(isSameDistrict(gangnam, '서울특별시 강남구 테헤란로 1')).toBe(true);
    expect(isSameDistrict(gangnam, '서울특별시 서초구 방배로 1')).toBe(false);
    expect(isSameDistrict(gangnam, '경기도 성남시분당구 판교로 1')).toBe(false);
  });
  it('접수지 판별 불가(null)·시/도만 판별(sigungu="")이면 무조건 false', () => {
    expect(isSameDistrict(null, '서울특별시 강남구 테헤란로 1')).toBe(false);
    expect(isSameDistrict({ sido: '서울특별시', sigungu: '' }, '서울특별시 강남구 테헤란로 1')).toBe(false);
  });
  it('후보 주소가 판별 불가·시/도만이면 false — 모호한 주소가 정확한 주소를 이길 수 없다', () => {
    expect(isSameDistrict(gangnam, '어딘가 이상한 주소')).toBe(false);
    expect(isSameDistrict(gangnam, '서울특별시')).toBe(false); // cand sigungu='' ≠ '강남구'
  });
});

describe('(f) 알 전원 0이면 기존 사슬과 동일 (freeze 회귀 가드)', () => {
  it('non-CRITICAL: 순환→별점→거리→키 그대로', () => {
    const a = makeCandidate({ key: 'PROVIDER:a', assigned30d: 2 });
    const b = makeCandidate({ key: 'PROVIDER:b', assigned30d: 1, avgRating: 2 });
    const c = makeCandidate({ key: 'PROVIDER:c', assigned30d: 1, avgRating: 4 });
    const sorted = [a, b, c].sort(compareCandidates('NORMAL'));
    expect(sorted.map((x) => x.key)).toEqual(['PROVIDER:c', 'PROVIDER:b', 'PROVIDER:a']);
  });
  it('CRITICAL(전원 sameDistrict=false): 거리→키 그대로', () => {
    const far = makeCandidate({ key: 'PROVIDER:far', distanceKm: 9 });
    const near = makeCandidate({ key: 'PROVIDER:near', distanceKm: 2 });
    const noCoord = makeCandidate({ key: 'PROVIDER:no', distanceKm: null });
    const sorted = [noCoord, far, near].sort(compareCandidates('CRITICAL'));
    expect(sorted.map((x) => x.key)).toEqual(['PROVIDER:near', 'PROVIDER:far', 'PROVIDER:no']);
  });
});

describe('(g) deriveRankingBadge parity — 배지가 comparator의 첫 차이 티어를 정확히 말한다', () => {
  it('티어별 인접 쌍에서 배지 라벨이 정확하다', () => {
    const base = { key: 'PROVIDER:x' };
    // [prev 우위 필드, urgency, 기대 라벨]
    const cases: Array<{
      urgency: 'NORMAL' | 'URGENT' | 'CRITICAL';
      prev: Partial<Candidate>;
      curr: Partial<Candidate>;
      label: string;
    }> = [
      { urgency: 'NORMAL', prev: {}, curr: { rejectedThisRequest: true }, label: '거절이력' },
      { urgency: 'NORMAL', prev: {}, curr: { coversRegion: false }, label: '지역' },
      { urgency: 'NORMAL', prev: { eggBalance: 3 }, curr: { eggBalance: 1 }, label: '알 보유량에서 뒤짐' },
      { urgency: 'NORMAL', prev: { assigned30d: 1 }, curr: { assigned30d: 5 }, label: '30일 배정에서 뒤짐' },
      { urgency: 'NORMAL', prev: { avgRating: 4 }, curr: { avgRating: 2 }, label: '별점 우위' },
      { urgency: 'NORMAL', prev: { distanceKm: 1 }, curr: { distanceKm: 8 }, label: '거리' },
      { urgency: 'CRITICAL', prev: { sameDistrict: true }, curr: { sameDistrict: false }, label: '같은 지역 우선에서 뒤짐' },
      { urgency: 'CRITICAL', prev: { eggBalance: 4 }, curr: { eggBalance: 0 }, label: '알 보유량에서 뒤짐' },
      { urgency: 'CRITICAL', prev: { distanceKm: 1 }, curr: { distanceKm: 8 }, label: '거리' },
    ];
    for (const { urgency, prev, curr, label } of cases) {
      const p = makeCandidate({ ...base, key: 'PROVIDER:p', ...prev });
      const c = makeCandidate({ ...base, key: 'PROVIDER:q', ...curr });
      // comparator가 실제로 p를 앞세우는지 먼저 확인(parity의 전제)
      expect(compareCandidates(urgency)(p, c)).toBeLessThan(0);
      expect(deriveRankingBadge(p, c, urgency)).toBe(label);
    }
  });

  it('CRITICAL에서 순환·별점 차이는 배지를 만들지 않는다 (comparator와 동일하게 건너뜀)', () => {
    const p = makeCandidate({ key: 'PROVIDER:p', assigned30d: 0, avgRating: 5 });
    const c = makeCandidate({ key: 'PROVIDER:q', assigned30d: 9, avgRating: 1 });
    expect(deriveRankingBadge(p, c, 'CRITICAL')).toBeNull();
  });
});
