export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type AnalyticsPeriod = 'day' | 'week' | 'month';

export type UtcRange = {
  gte: Date;
  lt: Date;
};

/**
 * Returns the UTC instant at the start of the KST calendar day containing date.
 * This uses UTC calendar accessors plus a fixed offset, never the process timezone.
 */
export function kstDayStartUtc(date: Date): Date {
  const kstWallClock = new Date(date.getTime() + KST_OFFSET_MS);
  return new Date(
    Date.UTC(
      kstWallClock.getUTCFullYear(),
      kstWallClock.getUTCMonth(),
      kstWallClock.getUTCDate(),
    ) - KST_OFFSET_MS,
  );
}

/** Formats an instant as its KST calendar date without depending on process TZ. */
export function kstDateString(date: Date): string {
  const kstWallClock = new Date(date.getTime() + KST_OFFSET_MS);
  const year = kstWallClock.getUTCFullYear();
  const month = String(kstWallClock.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kstWallClock.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * A KST-calendar, half-open reporting window. DB DateTime values are
 * TIMESTAMP WITHOUT TIME ZONE holding UTC-naive values; SQL buckets must use
 * ("column" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul' rather than server TZ.
 */
export function kstRangeUtc(period: AnalyticsPeriod, now = new Date()): UtcRange {
  const lt = new Date(kstDayStartUtc(now).getTime() + 24 * 60 * 60 * 1000);
  const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
  return { gte: new Date(lt.getTime() - days * 24 * 60 * 60 * 1000), lt };
}
export function kstMonthString(now = new Date()): string {
  const kstWallClock = new Date(now.getTime() + KST_OFFSET_MS);
  const year = kstWallClock.getUTCFullYear();
  const month = String(kstWallClock.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function kstMonthRangeUtc(month: string | null | undefined, now = new Date()): UtcRange {
  const resolvedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '')
    ? month!
    : kstMonthString(now);
  const [year, monthNumber] = resolvedMonth.split('-').map(Number);

  return {
    gte: new Date(Date.UTC(year, monthNumber - 1, 1) - KST_OFFSET_MS),
    lt: new Date(Date.UTC(year, monthNumber, 1) - KST_OFFSET_MS),
  };
}
