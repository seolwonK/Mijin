import { describe, expect, it } from 'vitest';
import type { InspectionVisit } from '@prisma/client';
import { fromDateString } from '@/lib/inspection';
import {
  type PlanWithVisits,
  buildPlanView,
  planHeadline,
  quarterDisplay,
} from '@/lib/inspectionView';

// buildPlanView 는 고객·관리자 화면이 함께 쓰는 유일한 파생 계산이다. 여기서 틀리면 두 화면이
// 같이 틀리므로, 화면 문구를 가르는 필드(bookable·blocked·needsReschedule·actionQuarter)를 고정한다.

const NOW = new Date('2026-10-01T03:00:00Z'); // KST 2026-10-01 12:00

function visit(over: Partial<InspectionVisit> & { quarter: number; date: string }): InspectionVisit {
  const { date, ...rest } = over;
  return {
    id: `v${over.quarter}`,
    planId: 'p1',
    preferredDate: fromDateString(date),
    timeSlot: 'ANY',
    status: 'SCHEDULED',
    note: null,
    adminMemo: null,
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
    priceWon: 50_000,
    depositorName: '홍길동',
    paidConfirmedAt: NOW,
    paidConfirmedByUserId: 'admin',
    startDate: fromDateString('2026-09-20'),
    endDate: fromDateString('2027-09-19'),
    canceledAt: null,
    cancelReason: null,
    createdAt: new Date('2026-09-19T16:00:00Z'), // KST 2026-09-20 01:00
    updatedAt: NOW,
    visits: [],
    ...over,
  };
}

describe('buildPlanView', () => {
  it('관리자 메모는 고객 뷰에 싣지 않는다', () => {
    const p = plan({ visits: [visit({ quarter: 1, date: '2026-10-10', adminMemo: '김기사 · 1톤' })] });
    expect(buildPlanView(p, 'customer', NOW).quarters[0].visit?.adminMemo).toBeNull();
    expect(buildPlanView(p, 'admin', NOW).quarters[0].visit?.adminMemo).toBe('김기사 · 1톤');
  });

  it('신청일은 UTC 가 아니라 한국 달력으로 낸다', () => {
    expect(buildPlanView(plan(), 'admin', NOW).createdDate).toBe('2026-09-20');
  });

  it('입금 전에는 분기 창이 없고 아무 회차도 예약할 수 없다', () => {
    const view = buildPlanView(
      plan({ status: 'PENDING_PAYMENT', startDate: null, endDate: null }),
      'customer',
      NOW,
    );
    expect(view.quarters.every((q) => q.window == null && !q.bookable)).toBe(true);
    expect(view.actionQuarter).toBeNull();
  });

  it('현재 분기에 날짜가 없으면 그 회차가 "지금 할 일"이다', () => {
    const view = buildPlanView(plan(), 'customer', NOW);
    expect(view.quarters[0].isCurrent).toBe(true);
    expect(view.actionQuarter).toBe(1);
  });

  it('날짜를 다시 골라야 하는 회차가 현재 분기보다 먼저다', () => {
    const p = plan({ visits: [visit({ quarter: 1, date: '2026-09-25', status: 'REQUESTED' })] });
    const view = buildPlanView(p, 'customer', NOW);
    expect(view.quarters[0].needsReschedule).toBe(true);
    expect(view.quarters[0].bookable).toBe(true);
    expect(view.actionQuarter).toBe(1);
  });

  it('관리자가 취소한 방문은 다시 잡을 수 있고 할 일로 잡힌다', () => {
    const p = plan({ visits: [visit({ quarter: 1, date: '2026-10-10', status: 'CANCELED' })] });
    const view = buildPlanView(p, 'customer', NOW);
    expect(view.quarters[0].bookable).toBe(true);
    expect(view.actionQuarter).toBe(1);
  });

  it('현재 분기가 예약돼 있으면 할 일이 없다 — 미래 분기를 재촉하지 않는다', () => {
    const p = plan({ visits: [visit({ quarter: 1, date: '2026-10-10' })] });
    const view = buildPlanView(p, 'customer', NOW);
    expect(view.actionQuarter).toBeNull();
    expect(view.quarters[1].bookable).toBe(true); // 미리 잡는 것은 허용
  });

  it('임박한 확정 방문은 잠기고 이유를 알려 준다', () => {
    const p = plan({ visits: [visit({ quarter: 1, date: '2026-10-02' })] });
    const q1 = buildPlanView(p, 'customer', NOW).quarters[0];
    expect(q1.bookable).toBe(false);
    expect(q1.blocked).toBe('VISIT_IMMINENT');
  });

  it('완료 회차 수를 센다', () => {
    const p = plan({
      visits: [
        visit({ quarter: 1, date: '2026-09-25', status: 'COMPLETED' }),
        visit({ quarter: 2, date: '2027-01-10' }),
      ],
    });
    const view = buildPlanView(p, 'customer', NOW);
    expect(view.completedCount).toBe(1);
    expect(view.quarters[0].blocked).toBe('COMPLETED');
  });

  it('1분기 창이 지난 REQUESTED 1회차는 "다시 선택"이 아니라 "기간 지남"으로 보인다', () => {
    // 창: 2026-09-20 ~ 12-19. KST 12-19 에는 리드타임(2일)을 지킬 날짜가 창 안에 없다.
    const late = new Date('2026-12-19T03:00:00Z');
    const p = plan({ visits: [visit({ quarter: 1, date: '2026-09-25', status: 'REQUESTED' })] });
    const view = buildPlanView(p, 'customer', late);
    const q1 = view.quarters[0];
    expect(q1.needsReschedule).toBe(true); // 관리자 화면용 원래 뜻은 그대로
    expect(q1.bookable).toBe(false);
    expect(q1.blocked).toBe('WINDOW_PASSED');
    expect(quarterDisplay(q1)).toBe('WINDOW_PASSED');
    expect(planHeadline(view)).toBeNull();
  });

  it('창이 남은 REQUESTED 1회차는 "다시 선택"이고 맨 위 한 줄도 재선택을 알린다', () => {
    const p = plan({ visits: [visit({ quarter: 1, date: '2026-09-25', status: 'REQUESTED' })] });
    const view = buildPlanView(p, 'customer', NOW);
    expect(quarterDisplay(view.quarters[0])).toBe('RESCHEDULE');
    expect(planHeadline(view)).toEqual({ kind: 'RESCHEDULE', quarter: 1 });
  });

  it('입금 전 희망일은 "입금 확인 후 확정"으로 보인다', () => {
    const p = plan({
      status: 'PENDING_PAYMENT',
      startDate: null,
      endDate: null,
      visits: [visit({ quarter: 1, date: '2026-10-10', status: 'REQUESTED' })],
    });
    const view = buildPlanView(p, 'customer', NOW);
    expect(quarterDisplay(view.quarters[0])).toBe('AWAITING_PAYMENT');
    expect(view.nextVisit).toBeNull();
    expect(planHeadline(view)).toBeNull();
  });

  it('완료·예약·미정을 구분한다', () => {
    const p = plan({
      visits: [
        visit({ quarter: 1, date: '2026-09-25', status: 'COMPLETED' }),
        visit({ quarter: 2, date: '2027-01-10' }),
      ],
    });
    const [q1, q2, q3] = buildPlanView(p, 'customer', NOW).quarters;
    expect(quarterDisplay(q1)).toBe('COMPLETED');
    expect(quarterDisplay(q2)).toBe('SCHEDULED');
    expect(quarterDisplay(q3)).toBe('UNSET');
  });

  it('현재 분기가 비어 있으면 맨 위 한 줄은 그 회차 날짜 정하기다', () => {
    // 2회차 창(2026-12-20~) 안, 1회차는 완료.
    const now = new Date('2027-01-05T03:00:00Z');
    const p = plan({ visits: [visit({ quarter: 1, date: '2026-10-10', status: 'COMPLETED' })] });
    expect(planHeadline(buildPlanView(p, 'customer', now))).toEqual({ kind: 'BOOK', quarter: 2 });
  });

  it('할 일이 없으면 가장 가까운 예정 방문을 알린다 — 지난 방문·취소는 제외', () => {
    const p = plan({
      visits: [
        visit({ quarter: 1, date: '2026-10-14', timeSlot: 'MORNING' }),
        visit({ quarter: 2, date: '2027-01-10' }),
        visit({ quarter: 3, date: '2027-04-10', status: 'CANCELED' }),
      ],
    });
    const view = buildPlanView(p, 'customer', NOW);
    expect(view.nextVisit).toEqual({ quarter: 1, date: '2026-10-14', timeSlot: 'MORNING' });
    expect(planHeadline(view)).toEqual({
      kind: 'NEXT_VISIT',
      quarter: 1,
      date: '2026-10-14',
      timeSlot: 'MORNING',
    });
  });

  it('오늘 방문도 다음 방문이다', () => {
    const p = plan({ visits: [visit({ quarter: 1, date: '2026-10-01' })] });
    expect(buildPlanView(p, 'customer', NOW).nextVisit?.date).toBe('2026-10-01');
  });
});
