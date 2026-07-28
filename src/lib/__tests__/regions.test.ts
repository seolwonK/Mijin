import { describe, expect, it } from 'vitest';

import { coversRegion, normalizeAddress, regionFromAddress } from '../regions';

// 정규화가 regionFromAddress 안으로 들어오기 전에는 배차 경로(autoAssign:33,
// matching:43)가 원문 주소를 그대로 넘겨 축약형을 전부 판별 실패로 처리했다.
// 여기 테스트는 그 회귀를 다시 열어주는 문지기다.

describe('regionFromAddress', () => {
  it('resolves abbreviated sido names that customers actually type', () => {
    // 실 DB 의 좌표 없는 접수들이 쓰던 형태 그대로.
    expect(regionFromAddress('서울 강남구 테헤란로 1')).toEqual({
      sido: '서울특별시',
      sigungu: '강남구',
    });
    expect(regionFromAddress('서울시 마포구 테스트로 5')).toEqual({
      sido: '서울특별시',
      sigungu: '마포구',
    });
    expect(regionFromAddress('경기 성남시')).toEqual({ sido: '경기도', sigungu: '성남시' });
    expect(regionFromAddress('부산 해운대구')).toEqual({
      sido: '부산광역시',
      sigungu: '해운대구',
    });
    expect(regionFromAddress('인천 연수구')).toEqual({ sido: '인천광역시', sigungu: '연수구' });
  });

  it('keeps resolving formal names (no regression for reverse-geocoded addresses)', () => {
    // 카카오 역지오코딩은 풀네임을 돌려준다 — 정규화가 이 경로를 깨면 안 된다.
    expect(regionFromAddress('서울특별시 강남구 테헤란로 427')).toEqual({
      sido: '서울특별시',
      sigungu: '강남구',
    });
    expect(regionFromAddress('부산광역시 해운대구')).toEqual({
      sido: '부산광역시',
      sigungu: '해운대구',
    });
    expect(regionFromAddress('경기도 성남시 분당구')).toEqual({
      sido: '경기도',
      sigungu: '성남시',
    });
  });

  it('maps renamed provinces to their current formal names', () => {
    expect(regionFromAddress('강원도 춘천시')).toEqual({
      sido: '강원특별자치도',
      sigungu: '춘천시',
    });
    expect(regionFromAddress('전라북도 전주시')).toEqual({
      sido: '전북특별자치도',
      sigungu: '전주시',
    });
    expect(regionFromAddress('제주 제주시')).toEqual({
      sido: '제주특별자치도',
      sigungu: '제주시',
    });
  });

  it('returns a sido-only result when no sigungu is present', () => {
    expect(regionFromAddress('서울 어딘가')).toEqual({ sido: '서울특별시', sigungu: '' });
    // 세종은 하위 시/군/구가 없어 항상 sido-only 다.
    expect(regionFromAddress('세종특별자치시')).toEqual({
      sido: '세종특별자치시',
      sigungu: '',
    });
    expect(regionFromAddress('세종시 한누리대로')).toEqual({
      sido: '세종특별자치시',
      sigungu: '',
    });
  });

  it('disambiguates 광주 — metropolitan city only when a 구 follows', () => {
    // 광역시: 뒤 토큰이 구(區)
    expect(regionFromAddress('광주 서구')).toEqual({ sido: '광주광역시', sigungu: '서구' });
    expect(regionFromAddress('광주 남구 어딘가')).toEqual({
      sido: '광주광역시',
      sigungu: '남구',
    });
    // 경기도 광주시: 시/도가 명시돼 있으면 그쪽이 이긴다
    expect(regionFromAddress('경기 광주시')).toEqual({ sido: '경기도', sigungu: '광주시' });
    expect(regionFromAddress('경기도 광주시 경안로')).toEqual({
      sido: '경기도',
      sigungu: '광주시',
    });
    // 정식 명칭은 그대로 통과
    expect(regionFromAddress('광주광역시 북구')).toEqual({
      sido: '광주광역시',
      sigungu: '북구',
    });
    // 단독 "광주" 는 광역시인지 경기도 광주시인지 알 수 없다 → 판별 보류
    expect(regionFromAddress('광주')).toBeNull();
  });

  it('collapses irregular whitespace before matching', () => {
    expect(regionFromAddress('  서울   강남구  ')).toEqual({
      sido: '서울특별시',
      sigungu: '강남구',
    });
  });

  it('still returns null for addresses that carry no region (null contract unchanged)', () => {
    expect(regionFromAddress(null)).toBeNull();
    expect(regionFromAddress(undefined)).toBeNull();
    expect(regionFromAddress('')).toBeNull();
    expect(regionFromAddress('   ')).toBeNull();
    // 실 DB 에 있는 값들 — 정규화 후에도 지역이 없다.
    expect(regionFromAddress('103동')).toBeNull();
    expect(regionFromAddress('ㅇㅇ')).toBeNull();
    expect(regionFromAddress('우주 화성기지 1번지 (지역 미상)')).toBeNull();
  });

  it('only rewrites the leading sido, never a token further in', () => {
    // "서울대로" 는 경기도 성남시의 도로명이다. 앞머리가 아니면 건드리지 않는다.
    expect(regionFromAddress('경기도 성남시 서울대로 1')).toEqual({
      sido: '경기도',
      sigungu: '성남시',
    });
  });
});

describe('normalizeAddress', () => {
  it('expands the leading sido alias and leaves the rest untouched', () => {
    expect(normalizeAddress('서울 강남구 테헤란로 1')).toBe('서울특별시 강남구 테헤란로 1');
    expect(normalizeAddress('경기 성남시')).toBe('경기도 성남시');
  });

  it('is idempotent — applying it twice changes nothing', () => {
    // requestRegionResolver 가 이 함수를 거쳐 regionFromAddress 를 부르던 시절의
    // 이중 적용이 무해했음을 확인한다. 지금은 한 번만 적용되지만, 외부로
    // export 된 이상 호출부가 체이닝해도 안전해야 한다.
    const samples = [
      '서울 강남구 테헤란로 1',
      '서울시 마포구',
      '서울특별시 강남구',
      '경기 광주시',
      '광주 서구',
      '광주광역시 북구',
      '강원도 춘천시',
      '세종시',
      '광주',
      '103동',
      '  서울   강남구  ',
      '',
    ];
    for (const sample of samples) {
      const once = normalizeAddress(sample);
      expect(normalizeAddress(once), sample).toBe(once);
    }
  });

  it('does not invent a region for unrecognized input', () => {
    expect(normalizeAddress('103동')).toBe('103동');
    expect(normalizeAddress('광주')).toBe('광주');
  });
});

describe('coversRegion (semantics unchanged by normalization)', () => {
  it('treats an empty coverage list as covering everything', () => {
    expect(coversRegion([], { sido: '서울특별시', sigungu: '강남구' })).toBe(true);
  });

  it('treats an unresolvable region as covered so dispatch is never blocked', () => {
    expect(coversRegion(['서울특별시 강남구'], null)).toBe(true);
  });

  it('matches a sido-wide key and an exact sigungu key', () => {
    const gangnam = { sido: '서울특별시', sigungu: '강남구' };
    expect(coversRegion(['서울특별시'], gangnam)).toBe(true);
    expect(coversRegion(['서울특별시 강남구'], gangnam)).toBe(true);
    expect(coversRegion(['서울특별시 마포구'], gangnam)).toBe(false);
    expect(coversRegion(['경기도'], gangnam)).toBe(false);
  });

  it('does not match a sigungu key when only the sido resolved', () => {
    // 정규화로 sido-only 결과가 늘어나므로 이 경계가 중요해졌다.
    expect(coversRegion(['서울특별시 강남구'], { sido: '서울특별시', sigungu: '' })).toBe(false);
    expect(coversRegion(['서울특별시'], { sido: '서울특별시', sigungu: '' })).toBe(true);
  });
});
