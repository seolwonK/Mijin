import { describe, expect, it } from 'vitest';
import { compareCandidates, type Candidate } from '@/lib/matching';
import { deriveRankingBadge, findAutoAssignCandidateIndex } from '@/lib/candidateRankingDisplay';
import type { Urgency } from '@prisma/client';

const priorities = {
  NORMAL: ['history', 'region', 'eggs', 'rotation', 'rating', 'distance', 'key'],
  URGENT: ['history', 'region', 'eggs', 'rotation', 'rating', 'distance', 'key'],
  CRITICAL: ['history', 'region', 'district', 'eggs', 'distance', 'key'],
} as const;
const urgencies = ['NORMAL', 'URGENT', 'CRITICAL'] as const;

// Independent rank-vector oracle from the documented business priority table.
// Distinct fields vary together, including conflicting lower priorities.
function vector(c: Candidate, urgency: Urgency) {
  const score = {
    history: +c.rejectedThisRequest, region: +!c.coversRegion,
    district: +!c.sameDistrict, eggs: -c.eggBalance, rotation: c.assigned30d,
    rating: -c.avgRating, distance: c.distanceKm ?? Infinity, key: c.key,
  };
  return priorities[urgency].map(p => score[p]);
}
function oracle(a: (number | string)[], b: (number | string)[]) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

const candidates: Candidate[] = [];
for (const kind of ['PROVIDER', 'TECHNICIAN'] as const)
for (const rejectedThisRequest of [false, true])
for (const coversRegion of [false, true])
for (const sameDistrict of [false, true])
for (const eggBalance of [0, 1, 100])
for (const assigned30d of [0, 1, 30])
for (const avgRating of [1, 3, 5])
for (const distanceKm of [0, 999, null]) {
  const id = String(candidates.length).padStart(4, '0');
  candidates.push({ kind, id, key: `${kind}:${id}`, name: '검증', phone: '', address: '', regions: [],
    isActive: true, rejectedThisRequest, coversRegion, sameDistrict, eggBalance, assigned30d,
    avgRating, reviewCount: 0, distanceKm });
}

describe(`P — ${candidates.length}개 후보 조합의 전체 쌍 우선순위`, () => {
  for (const urgency of urgencies) {
    it(`P01 ${urgency}: ${candidates.length ** 2}쌍을 문서 우선순위와 대조`, () => {
      const cmp = compareCandidates(urgency);
      const vectors = candidates.map(c => vector(c, urgency));
      let mismatch: unknown;
      outer: for (let i = 0; i < candidates.length; i++) for (let j = 0; j < candidates.length; j++) {
        const actual = Math.sign(cmp(candidates[i], candidates[j]));
        const expected = oracle(vectors[i], vectors[j]);
        if (actual !== expected) { mismatch = { a: candidates[i], b: candidates[j], actual, expected }; break outer; }
      }
      expect(mismatch).toBeUndefined();
    });
    it(`P02 ${urgency}: 입력 순서 32회 변형에도 결과·자동배정 예정·배지 일치`, () => {
      const cmp = compareCandidates(urgency);
      const sorted = [...candidates].sort(cmp);
      for (let shift = 0; shift < 32; shift++) {
        const cut = shift * 37;
        const shuffled = [...candidates.slice(cut), ...candidates.slice(0, cut)].reverse().sort(cmp);
        expect(shuffled.map(c => c.key)).toEqual(sorted.map(c => c.key));
      }
      const pick = findAutoAssignCandidateIndex(sorted);
      expect(sorted[pick].rejectedThisRequest).toBe(false);
      expect(sorted[pick].coversRegion).toBe(true);
      for (let i = 1; i < sorted.length; i++) {
        const a = sorted[i - 1], b = sorted[i];
        const av = vector(a, urgency), bv = vector(b, urgency);
        const first = priorities[urgency][av.findIndex((v, k) => v !== bv[k])];
        const label = { history: '거절·무응답·회수 이력', region: '지역', district: '같은 지역 우선에서 뒤짐', eggs: '알 보유량에서 뒤짐', rotation: '30일 배정에서 뒤짐', rating: '별점 우위', distance: '거리', key: null }[first];
        expect(deriveRankingBadge(a, b, urgency)).toBe(label);
      }
    });
    it(`P03 ${urgency}: 동일 키·동일 필드 동률 및 null 거리`, () => {
      const c = { ...candidates[0], distanceKm: null };
      expect(compareCandidates(urgency)(c, { ...c })).toBe(0);
      expect(compareCandidates(urgency)({ ...c, distanceKm: 0 }, c)).toBeLessThan(0);
      expect(findAutoAssignCandidateIndex([])).toBe(-1);
      expect(findAutoAssignCandidateIndex([{ coversRegion: false, rejectedThisRequest: false }, { coversRegion: true, rejectedThisRequest: true }])).toBe(-1);
    });
  }
});
