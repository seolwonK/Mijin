import { describe, expect, it } from 'vitest';
import type { InspectionVisit } from '@prisma/client';
import { fromDateString, roundsOfYear } from '@/lib/inspection';
import {
  type PlanWithVisits,
  buildPlanView,
  planHeadline,
  visitBadge,
  visitDisplay,
} from '@/lib/inspectionView';

// buildPlanView 는 고객·관리자 화면이 함께 쓰는 유일한 파생 계산이다. 여기서 틀리면 두 화면이
// 같이 틀리므로, 화면 문구를 가르는 필드(bookable·blocked·needsReschedule·남은 횟수·달력 범위)를 고정한다.

const NOW = new Date('2026-10-01T03:00:00Z'); // KST 2026-10-01 12:00

function visit(over: Partial<InspectionVisit> & { round: number; date: string }): InspectionVisit {
  const { date, ...rest } = over;
  return {
    id: `v${over.round}`,
    planId: 'p1',
    preferredDate: fromDateString(date),
    timeSlot: 'ANY',
    method: 'PHONE',
    status: 'SCHEDULED',
    note: null,
    adminMemo: null,
    result: null,
    resultNote: null,
    completedAt: null,
    canceledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...rest,
  };
}

function plan(over: Partial<PlanWithVisits> = {}): PlanWithVisits {
  return {
    id: 'p1',
    userId: 'u1',
    contactName: '홍길동',
    contactPhone: '01012345678',
    address: '경기 성남시 분당구',
    addressDetail: null,
    lat: null,
    lng: null,
    memo: null,
    status: 'ACTIVE',
    termMonths: 12,
    priceWon: 92_400,
    depositorName: '홍길동',
    paidConfirmedAt: NOW,
    paidConfirmedByUserId: 'admin',
    startDate: fromDateString('2026-09-20'),
    endDate: fromDateString('2027-09-19'),
    canceledAt: null,
    cancelReason: null,
    refundedWon: null,
    refundedAt: null,
    refundNote: null,
    createdAt: new Date('2026-09-19T16:00:00Z'), // KST 2026-09-20 01:00
    updatedAt: NOW,
    visits: [],
    ...over,
  };
}

describe('buildPlanView', () => {
  it('관리자 메모는 고객 뷰에 싣지 않는다', () => {
    const p = plan({ visits: [visit({ round: 1, date: '2026-10-10', adminMemo: '김기사 · 1톤' })] });
    expect(buildPlanView(p, 'customer', NOW).visits[0].adminMemo).toBeNull();
    expect(buildPlanView(p, 'admin', NOW).visits[0].adminMemo).toBe('김기사 · 1톤');
  });

  it('신청일은 UTC 가 아니라 한국 달력으로 낸다', () => {
    expect(buildPlanView(plan(), 'admin', NOW).createdDate).toBe('2026-09-20');
  });

  it('입금 전에는 연차 창도 달력 범위도 없다', () => {
    const view = buildPlanView(
      plan({
        status: 'PENDING_PAYMENT',
        startDate: null,
        endDate: null,
        visits: [visit({ round: 1, date: '2026-10-05', status: 'REQUESTED' })],
      }),
      'customer',
      NOW,
    );
    expect(view.years.every((y) => y.window == null && !y.bookable)).toBe(true);
    expect(view.bookRange).toBeNull();
    expect(view.visits[0].bookable).toBe(false);
    expect(visitDisplay(view.visits[0])).toBe('AWAITING_PAYMENT');
    expect(planHeadline(view)).toBeNull();
  });

  it('1년권은 연차 하나에 12회, 달력은 내일부터 기간 끝까지', () => {
    const view = buildPlanView(plan(), 'customer', NOW);
    expect(view.years).toHaveLength(1);
    expect(view.years[0]).toMatchObject({ quota: 12, used: 0, remaining: 12, isCurrent: true, bookable: true });
    expect(view.bookRange).toEqual({ earliest: '2026-10-02', latest: '2027-09-19' });
    expect(planHeadline(view)).toEqual({ kind: 'BOOK', remaining: 12 });
  });

  it('2년권은 연차가 둘이고 회차 번호로 연차를 가른다', () => {
    const p = plan({
      termMonths: 24,
      priceWon: 132_000,
      endDate: fromDateString('2028-09-19'),
      visits: [visit({ round: 13, date: '2027-10-01' })],
    });
    const view = buildPlanView(p, 'customer', NOW);
    expect(view.years.map((y) => [y.year, y.used, y.remaining])).toEqual([
      [1, 0, 12],
      [2, 1, 11],
    ]);
    expect(view.visits[0].year).toBe(2);
    expect(view.bookRange).toEqual({ earliest: '2026-10-02', latest: '2028-09-19' });
  });

  it('한 연차를 다 쓰면 달력 범위에서 빠진다', () => {
    const full = roundsOfYear(1).map((round, i) =>
      visit({ round, date: `2026-11-${String(i + 1).padStart(2, '0')}` }),
    );
    const p = plan({ termMonths: 24, endDate: fromDateString('2028-09-19'), visits: full });
    const view = buildPlanView(p, 'customer', NOW);
    expect(view.years[0]).toMatchObject({ used: 12, remaining: 0, bookable: false });
    expect(view.bookRange).toEqual({ earliest: '2027-09-20', latest: '2028-09-19' });
    // 1년권이라면 더 잡을 날이 없다
    const oneYear = buildPlanView(plan({ visits: full }), 'customer', NOW);
    expect(oneYear.bookRange).toBeNull();
  });

  it('취소된 회차는 횟수를 차지하지 않고, 같은 날 중복 검사에서도 빠진다', () => {
    const p = plan({
      visits: [
        visit({ round: 1, date: '2026-10-10', status: 'CANCELED' }),
        visit({ round: 2, date: '2026-10-12' }),
      ],
    });
    const view = buildPlanView(p, 'customer', NOW);
    expect(view.years[0].used).toBe(1);
    expect(view.bookedDates).toEqual(['2026-10-12']);
  });

  it('날짜를 다시 골라야 하는 회차가 다음 점검보다 먼저다', () => {
    const p = plan({
      visits: [
        visit({ round: 1, date: '2026-09-25', status: 'REQUESTED' }),
        visit({ round: 2, date: '2026-10-10' }),
      ],
    });
    const view = buildPlanView(p, 'customer', NOW);
    const v1 = view.visits.find((v) => v.round === 1)!;
    expect(v1.needsReschedule).toBe(true);
    expect(v1.bookable).toBe(true);
    expect(visitDisplay(v1)).toBe('RESCHEDULE');
    expect(planHeadline(view)).toEqual({ kind: 'RESCHEDULE', visitId: 'v1', round: 1 });
  });

  it('다음 점검은 오늘 이후 가장 가까운 확정 점검이고 방식을 싣는다', () => {
    const p = plan({
      visits: [
        visit({ round: 1, date: '2026-09-25', status: 'COMPLETED', method: 'ONSITE' }),
        visit({ round: 3, date: '2026-10-20', method: 'ONSITE' }),
        visit({ round: 2, date: '2026-10-01' }), // 오늘
      ],
    });
    const view = buildPlanView(p, 'customer', NOW);
    expect(view.visits.map((v) => v.round)).toEqual([1, 2, 3]); // 날짜순
    expect(view.nextVisit).toMatchObject({ round: 2, date: '2026-10-01', method: 'PHONE' });
    expect(view.completedCount).toBe(1);
    expect(view.years[0].completed).toBe(1);
  });

  it('임박한 확정 점검은 잠기고 이유를 알려 준다', () => {
    const p = plan({ visits: [visit({ round: 1, date: '2026-10-01' })] }); // 오늘
    const v = buildPlanView(p, 'customer', NOW).visits[0];
    expect(v.bookable).toBe(false);
    expect(v.blocked).toBe('VISIT_IMMINENT');
  });

  it('예정 배지는 방식을 말한다 — 방문 점검만 집에서 기다린다', () => {
    const p = plan({
      visits: [
        visit({ round: 1, date: '2026-10-10' }),
        visit({ round: 2, date: '2026-10-11', method: 'ONSITE' }),
      ],
    });
    const [phone, onsite] = buildPlanView(p, 'customer', NOW).visits;
    expect(visitBadge(phone)).toBe('전화 예정');
    expect(visitBadge(onsite)).toBe('방문 예정');
  });

  it('만료된 구독에는 헤드라인도 예약도 없다', () => {
    const view = buildPlanView(plan({ status: 'EXPIRED' }), 'customer', NOW);
    expect(planHeadline(view)).toBeNull();
    expect(view.bookRange).toBeNull();
  });
});
