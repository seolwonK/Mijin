import { describe, expect, it } from 'vitest';
import {
  PROMO_SNOOZE_DAYS,
  isSnoozed,
  nextSnoozeUntil,
} from '@/lib/inspectionPromo';

const NOW = Date.parse('2026-09-20T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

describe('팝업 노출 빈도', () => {
  it('닫기·CTA·다시보지않기의 간격이 서로 다르다', () => {
    expect(nextSnoozeUntil('close', NOW)).toBe(NOW + 14 * DAY);
    expect(nextSnoozeUntil('cta', NOW)).toBe(NOW + 90 * DAY);
    expect(nextSnoozeUntil('never', NOW)).toBe(NOW + 3650 * DAY);
    // 순서가 뒤집히면 "거절했는데 더 자주 뜨는" 사고가 된다
    expect(PROMO_SNOOZE_DAYS.close).toBeLessThan(PROMO_SNOOZE_DAYS.cta);
    expect(PROMO_SNOOZE_DAYS.cta).toBeLessThan(PROMO_SNOOZE_DAYS.never);
  });

  it('첫 방문(값 없음)에는 띄운다', () => {
    expect(isSnoozed(null, NOW)).toBe(false);
    expect(isSnoozed('', NOW)).toBe(false);
  });

  it('깨진 값은 띄우는 쪽으로 기운다', () => {
    expect(isSnoozed('nonsense', NOW)).toBe(false);
    expect(isSnoozed('NaN', NOW)).toBe(false);
  });

  it('유예 기간 안에서는 누르고, 지나면 다시 띄운다', () => {
    const until = nextSnoozeUntil('close', NOW);
    expect(isSnoozed(String(until), NOW)).toBe(true);
    expect(isSnoozed(String(until), until - 1)).toBe(true);
    expect(isSnoozed(String(until), until)).toBe(false); // 경계 당시각은 만료로 본다
    expect(isSnoozed(String(until), until + 1)).toBe(false);
  });
});
