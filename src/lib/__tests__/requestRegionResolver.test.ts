import { describe, expect, it } from 'vitest';

import { resolveRequestRegion } from '../requestRegionResolver';

describe('resolveRequestRegion', () => {
  it('normalizes a Seoul abbreviation before resolving its district', () => {
    expect(resolveRequestRegion({ address: '서울 강남구 테헤란로', lat: null, lng: null })).toEqual({
      kind: 'region',
      sido: '서울특별시',
      sigungu: '강남구',
    });
  });

  it('resolves formal names and a sido-only address', () => {
    expect(resolveRequestRegion({ address: '부산광역시 해운대구', lat: null, lng: null })).toEqual({
      kind: 'region',
      sido: '부산광역시',
      sigungu: '해운대구',
    });
    expect(resolveRequestRegion({ address: '세종특별자치시', lat: null, lng: null })).toEqual({
      kind: 'sidoOnly',
      sido: '세종특별자치시',
    });
  });

  it('uses the injected geometry provider for a sigungu result', () => {
    const geo = {
      sigunguAt: () => ({ sido: '경기도', sigungu: '성남시' }),
    };

    expect(resolveRequestRegion({ address: null, lat: 37.4, lng: 127.1 }, geo)).toEqual({
      kind: 'region',
      sido: '경기도',
      sigungu: '성남시',
    });
  });

  it('falls back from sigungu geometry to sido geometry', () => {
    const geo = {
      sigunguAt: () => null,
      sidoAt: () => '강원특별자치도',
    };

    expect(resolveRequestRegion({ address: null, lat: 37.8, lng: 128.2 }, geo)).toEqual({
      kind: 'sidoOnly',
      sido: '강원특별자치도',
    });
  });

  it('reports unknown when coordinates cannot be resolved without the geometry module', () => {
    expect(resolveRequestRegion({ address: null, lat: 37.5, lng: 127.0 })).toEqual({
      kind: 'unknown',
      reason: '경계 데이터 미탑재',
    });
  });

  it('reports unknown when neither address nor geometry resolves a region', () => {
    expect(
      resolveRequestRegion(
        { address: '알 수 없는 주소', lat: 37.5, lng: 127.0 },
        { sigunguAt: () => null, sidoAt: () => null },
      ),
    ).toEqual({ kind: 'unknown', reason: '주소와 좌표에서 지역을 판별할 수 없습니다' });
  });
});
