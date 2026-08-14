import { describe, expect, it } from 'vitest';

import { compareCandidates, type Candidate } from '../matching';

// B-0a에서 getCandidates 내부 인라인 정렬을 compareCandidates(urgency)로 추출했다.
// 이 파일은 그 추출 시점의 현행 동작을 그대로 얼려(freeze) 둔다 — 알(egg) 개념이
// 들어가기 전 B-2 재편의 회귀 기준선. DB 불필요, 순수 함수만 호출한다.

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
    ...overrides,
  };
}

describe('compareCandidates', () => {
  it('① rejectedThisRequest: non-rejected always sorts before rejected, regardless of every other tier', () => {
    // a는 거절이력만 있을 뿐 나머지 전부(순환·평점·거리·키)에서 b보다 유리하다.
    const a = makeCandidate({
      key: 'a',
      rejectedThisRequest: true,
      assigned30d: 0,
      avgRating: 5.0,
      distanceKm: 1,
    });
    const b = makeCandidate({
      key: 'b',
      rejectedThisRequest: false,
      assigned30d: 100,
      avgRating: 1.0,
      distanceKm: 999,
    });
    const cmp = compareCandidates('NORMAL');
    expect(cmp(a, b)).toBeGreaterThan(0); // b가 앞선다
    expect(cmp(b, a)).toBeLessThan(0);
  });

  it('② coversRegion: covering candidates sort before non-covering ones, regardless of lower tiers', () => {
    const a = makeCandidate({
      key: 'a',
      coversRegion: false,
      assigned30d: 0,
      avgRating: 5.0,
      distanceKm: 1,
    });
    const b = makeCandidate({
      key: 'b',
      coversRegion: true,
      assigned30d: 100,
      avgRating: 1.0,
      distanceKm: 999,
    });
    const cmp = compareCandidates('NORMAL');
    expect(cmp(a, b)).toBeGreaterThan(0); // b가 앞선다
    expect(cmp(b, a)).toBeLessThan(0);
  });

  describe('non-CRITICAL (NORMAL/URGENT) tier chain', () => {
    it('③-1 assigned30d asc wins over avgRating/distance/key even when those favor the other side', () => {
      const a = makeCandidate({ key: 'b', assigned30d: 1, avgRating: 1.0, distanceKm: 100 });
      const b = makeCandidate({ key: 'a', assigned30d: 2, avgRating: 5.0, distanceKm: 1 });
      const cmp = compareCandidates('NORMAL');
      expect(cmp(a, b)).toBeLessThan(0); // a(30일 배정 1회)가 앞선다
    });

    it('③-2 avgRating desc wins over distance/key when assigned30d is tied', () => {
      const a = makeCandidate({ key: 'b', assigned30d: 5, avgRating: 4.5, distanceKm: 100 });
      const b = makeCandidate({ key: 'a', assigned30d: 5, avgRating: 3.0, distanceKm: 1 });
      const cmp = compareCandidates('NORMAL');
      expect(cmp(a, b)).toBeLessThan(0); // a(평점 4.5)가 앞선다
    });

    it('③-3 distance asc wins over stable key when assigned30d and avgRating are tied', () => {
      const a = makeCandidate({ key: 'b', assigned30d: 5, avgRating: 4.0, distanceKm: 1 });
      const b = makeCandidate({ key: 'a', assigned30d: 5, avgRating: 4.0, distanceKm: 50 });
      const cmp = compareCandidates('NORMAL');
      expect(cmp(a, b)).toBeLessThan(0); // a(1km)가 앞선다
    });

    it('③-4 null distance always sorts after any numeric distance', () => {
      const a = makeCandidate({ key: 'a', assigned30d: 5, avgRating: 4.0, distanceKm: null });
      const b = makeCandidate({ key: 'b', assigned30d: 5, avgRating: 4.0, distanceKm: 999 });
      const cmp = compareCandidates('NORMAL');
      expect(cmp(a, b)).toBeGreaterThan(0); // b(거리 있음)가 앞선다
    });

    it('③-5 stable key (asc, non-locale) breaks ties when every prior tier is equal', () => {
      const a = makeCandidate({ key: 'a', assigned30d: 5, avgRating: 4.0, distanceKm: 10 });
      const b = makeCandidate({ key: 'b', assigned30d: 5, avgRating: 4.0, distanceKm: 10 });
      const cmp = compareCandidates('NORMAL');
      expect(cmp(a, b)).toBeLessThan(0);
      expect(cmp(b, a)).toBeGreaterThan(0);
    });
  });

  describe('CRITICAL tier chain', () => {
    it('④ CRITICAL skips assigned30d/avgRating entirely — distance decides even against worse cycling/rating', () => {
      // a는 순환·평점에서 훨씬 불리하지만 거리가 가깝다 — CRITICAL에서는 그것만 본다.
      const a = makeCandidate({ key: 'b', assigned30d: 100, avgRating: 1.0, distanceKm: 1 });
      const b = makeCandidate({ key: 'a', assigned30d: 1, avgRating: 5.0, distanceKm: 50 });
      const cmp = compareCandidates('CRITICAL');
      expect(cmp(a, b)).toBeLessThan(0); // a(1km)가 앞선다
    });

    it('CRITICAL still falls back to stable key when distance is tied', () => {
      const a = makeCandidate({ key: 'a', assigned30d: 0, avgRating: 5.0, distanceKm: 10 });
      const b = makeCandidate({ key: 'b', assigned30d: 0, avgRating: 5.0, distanceKm: 10 });
      const cmp = compareCandidates('CRITICAL');
      expect(cmp(a, b)).toBeLessThan(0);
    });
  });

  it('⑤ both-null distance falls back to stable key, for both CRITICAL and non-CRITICAL', () => {
    const a = makeCandidate({ key: 'a', distanceKm: null });
    const b = makeCandidate({ key: 'b', distanceKm: null });
    for (const urgency of ['NORMAL', 'URGENT', 'CRITICAL'] as const) {
      const cmp = compareCandidates(urgency);
      expect(cmp(a, b)).toBeLessThan(0);
      expect(cmp(b, a)).toBeGreaterThan(0);
    }
  });
});
