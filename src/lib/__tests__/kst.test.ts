import { describe, expect, it } from 'vitest';
import { kstDateString, kstDayStartUtc, kstRangeUtc } from '@/lib/kst';

describe('KST calendar helpers', () => {
  it('assigns UTC instants immediately before and after KST midnight to different days', () => {
    const beforeMidnight = new Date('2026-07-17T14:59:59.999Z');
    const afterMidnight = new Date('2026-07-17T15:00:00.000Z');

    expect(kstDateString(beforeMidnight)).toBe('2026-07-17');
    expect(kstDateString(afterMidnight)).toBe('2026-07-18');
    expect(kstDayStartUtc(afterMidnight).toISOString()).toBe('2026-07-17T15:00:00.000Z');
  });

  it('uses a half-open KST day window', () => {
    const range = kstRangeUtc('day', new Date('2026-07-18T03:00:00.000Z'));
    const atStart = new Date('2026-07-17T15:00:00.000Z');
    const atEnd = new Date('2026-07-18T15:00:00.000Z');

    expect(atStart >= range.gte && atStart < range.lt).toBe(true);
    expect(atEnd >= range.gte && atEnd < range.lt).toBe(false);
  });

  it.each([
    ['day', 1],
    ['week', 7],
    ['month', 30],
  ] as const)('creates a %s window with %i KST days', (period, days) => {
    const range = kstRangeUtc(period, new Date('2026-07-18T03:00:00.000Z'));
    expect(range.lt.getTime() - range.gte.getTime()).toBe(days * 24 * 60 * 60 * 1000);
  });
});
