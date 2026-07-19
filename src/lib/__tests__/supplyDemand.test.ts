import { describe, expect, it } from 'vitest';

import {
  aggregateSupplyDemand,
  classifyPressure,
  coversForDenominator,
} from '../supplyDemand';

describe('coversForDenominator', () => {
  it('does not treat an empty coverage list as nationwide for analytics', () => {
    expect(coversForDenominator([], { sido: '서울특별시', sigungu: '강남구' }, 'sigungu')).toBe(false);
  });

  it('matches any key in a sido at sido level', () => {
    expect(coversForDenominator(['서울특별시 강남구'], { sido: '서울특별시' }, 'sido')).toBe(true);
  });

  it('matches only sido-wide or exact sigungu coverage at sigungu level', () => {
    expect(coversForDenominator(['서울특별시'], { sido: '서울특별시', sigungu: '강남구' }, 'sigungu')).toBe(true);
    expect(coversForDenominator(['서울특별시 강남구'], { sido: '서울특별시', sigungu: '강남구' }, 'sigungu')).toBe(true);
    expect(coversForDenominator(['서울특별시 서초구'], { sido: '서울특별시', sigungu: '강남구' }, 'sigungu')).toBe(false);
  });

  it('accepts coverage when one of multiple keys matches', () => {
    expect(
      coversForDenominator(
        ['경기도 성남시', '서울특별시 강남구'],
        { sido: '서울특별시', sigungu: '강남구' },
        'sigungu',
      ),
    ).toBe(true);
  });
});

describe('classifyPressure', () => {
  it.each([
    [2, 3, { state: 'NORMAL', pressure: 1.5 }],
    [0, 3, { state: 'CRITICAL_ALERT', pressure: null }],
    [0, 0, { state: 'INACTIVE', pressure: null }],
    [2, 0, { state: 'ZERO', pressure: 0 }],
  ] as const)('freezes the %s supply / %s demand case', (supply, demand, expected) => {
    expect(classifyPressure(supply, demand)).toEqual(expected);
  });
});

describe('aggregateSupplyDemand', () => {
  it('deduplicates an approved active subject with overlapping coverage keys', () => {
    const rows = aggregateSupplyDemand(
      [
        {
          subjectKey: 'PROVIDER:1',
          regions: ['서울특별시', '서울특별시 강남구'],
          isActive: true,
          approvalStatus: 'APPROVED',
        },
        {
          subjectKey: 'PROVIDER:1',
          regions: ['서울특별시 강남구'],
          isActive: true,
          approvalStatus: 'APPROVED',
        },
      ],
      [{ sido: '서울특별시', sigungu: '강남구' }],
      ['서울특별시 강남구'],
      'sigungu',
    );

    expect(rows).toEqual([
      {
        key: '서울특별시 강남구',
        target: { sido: '서울특별시', sigungu: '강남구' },
        supply: 1,
        demand: 1,
        state: 'NORMAL',
        pressure: 1,
      },
    ]);
  });

  it('overlays demand and supply onto every authoritative universe region', () => {
    const rows = aggregateSupplyDemand(
      [
        {
          subjectKey: 'PROVIDER:gangnam',
          regions: ['서울특별시 강남구'],
          isActive: true,
          approvalStatus: 'APPROVED',
        },
        {
          subjectKey: 'PROVIDER:yongsan',
          regions: ['서울특별시 용산구'],
          isActive: true,
          approvalStatus: 'APPROVED',
        },
      ],
      [
        { sido: '서울특별시', sigungu: '강남구' },
        { sido: '서울특별시', sigungu: '서초구' },
      ],
      ['서울특별시 강남구', '서울특별시 서초구', '서울특별시 마포구', '서울특별시 용산구'],
      'sigungu',
    );

    expect(rows).toEqual([
      {
        key: '서울특별시 강남구',
        target: { sido: '서울특별시', sigungu: '강남구' },
        supply: 1,
        demand: 1,
        state: 'NORMAL',
        pressure: 1,
      },
      {
        key: '서울특별시 서초구',
        target: { sido: '서울특별시', sigungu: '서초구' },
        supply: 0,
        demand: 1,
        state: 'CRITICAL_ALERT',
        pressure: null,
      },
      {
        key: '서울특별시 마포구',
        target: { sido: '서울특별시', sigungu: '마포구' },
        supply: 0,
        demand: 0,
        state: 'INACTIVE',
        pressure: null,
      },
      {
        key: '서울특별시 용산구',
        target: { sido: '서울특별시', sigungu: '용산구' },
        supply: 1,
        demand: 0,
        state: 'ZERO',
        pressure: 0,
      },
    ]);
  });
});
