import { describe, expect, it } from 'vitest';
import {
  type InspectionSummaryInput,
  type InspectionSummaryPlanRow,
  type InspectionSummaryScheduleRow,
  shortAddress,
  summarizeInspections,
} from '@/lib/adminInspectionSummary';

const TODAY = '2026-09-28';
let seq = 0;

function visit(over: Partial<InspectionSummaryScheduleRow> & { date: string }): InspectionSummaryScheduleRow {
  seq += 1;
  return {
    visitId: `v${seq}`,
    round: 1,
    method: 'PHONE',
    timeSlot: 'ANY',
    status: 'SCHEDULED',
    contactName: `고객${seq}`,
    address: '경기 성남시 분당구 정자동 1',
    ...over,
  };
}

function plan(over: Partial<InspectionSummaryPlanRow> & { createdAt: string }): InspectionSummaryPlanRow {
  seq += 1;
  return {
    id: `p${seq}`,
    status: 'PENDING_PAYMENT',
    createdDate: over.createdAt.slice(0, 10),
    contactName: `신청${seq}`,
    contactPhone: '01012345678',
    ...over,
  };
}

function input(over: Partial<InspectionSummaryInput> = {}): InspectionSummaryInput {
  return { today: TODAY, pendingCount: 0, plans: [], schedule: [], ...over };
}

describe('summarizeInspections', () => {
  it('빈 응답이면 전부 0 과 빈 목록', () => {
    const s = summarizeInspections(input());
    expect(s).toMatchObject({ pendingPayment: 0, todayVisits: 0, weekVisits: 0, needsAction: 0, unconfirmed: 0, overdue: 0, duePayments: 0 });
    expect(s.todayList).toEqual([]);
    expect(s.recentPending).toEqual([]);
  });

  it('입금 대기는 plans 목록이 아니라 서버의 pendingCount 를 그대로 쓴다', () => {
    const s = summarizeInspections(input({ pendingCount: 250, plans: [plan({ createdAt: '2026-09-27T01:00:00Z' })] }));
    expect(s.pendingPayment).toBe(250);
  });

  it('오늘 방문은 today 와 같은 날짜의 SCHEDULED 만 센다', () => {
    const s = summarizeInspections(input({
      schedule: [
        visit({ date: TODAY }),
        visit({ date: TODAY, status: 'REQUESTED' }),
        visit({ date: '2026-09-29' }),
        visit({ date: '2026-09-27' }),
      ],
    }));
    expect(s.todayVisits).toBe(1);
  });

  it('이번 주 방문은 today ~ today+6 의 SCHEDULED (양 끝 포함)', () => {
    const s = summarizeInspections(input({
      schedule: [
        visit({ date: '2026-09-27' }), // 어제 — 제외(지난 방문)
        visit({ date: TODAY }),
        visit({ date: '2026-10-04' }), // today+6 — 포함
        visit({ date: '2026-10-05' }), // today+7 — 제외
        visit({ date: '2026-10-01', status: 'REQUESTED' }), // 미확정 — 제외
      ],
    }));
    expect(s.weekVisits).toBe(2);
  });

  it('처리 필요 = REQUESTED(날짜 무관) + 지난 SCHEDULED, 내역을 나눠 준다', () => {
    const s = summarizeInspections(input({
      schedule: [
        visit({ date: '2026-09-20', status: 'REQUESTED' }),
        visit({ date: '2026-10-10', status: 'REQUESTED' }),
        visit({ date: '2026-09-27' }),
        visit({ date: TODAY }), // 오늘은 지난 방문이 아니다
      ],
    }));
    expect(s.unconfirmed).toBe(2);
    expect(s.overdue).toBe(1);
    expect(s.needsAction).toBe(3);
  });

  it('월 입금 확인(dues)도 처리 필요에 더한다', () => {
    const s = summarizeInspections(input({
      schedule: [visit({ date: '2026-09-20', status: 'REQUESTED' })],
      dues: [{ paymentId: 'pay1' }, { paymentId: 'pay2' }],
    }));
    expect(s.duePayments).toBe(2);
    expect(s.needsAction).toBe(3);
  });

  it('월말·연말 경계도 문자열 날짜로 정확히 넘어간다', () => {
    const s = summarizeInspections(input({
      today: '2026-12-28',
      schedule: [visit({ date: '2027-01-03' }), visit({ date: '2027-01-04' })],
    }));
    expect(s.weekVisits).toBe(1);
  });

  it('오늘 방문 목록은 시간대 순(오전·오후·무관)으로 최대 3건, 주소는 짧게', () => {
    const s = summarizeInspections(input({
      schedule: [
        visit({ date: TODAY, timeSlot: 'ANY', contactName: '다' }),
        visit({ date: TODAY, timeSlot: 'AFTERNOON', contactName: '나', round: 2 }),
        visit({ date: TODAY, timeSlot: 'MORNING', contactName: '가', address: '서울특별시 송파구 잠실동 5' }),
        visit({ date: TODAY, timeSlot: 'ANY', contactName: '라' }),
      ],
    }));
    expect(s.todayVisits).toBe(4);
    expect(s.todayList.map((v) => v.contactName)).toEqual(['가', '나', '다']);
    expect(s.todayList[0]).toMatchObject({ timeSlot: 'MORNING', address: '송파구 잠실동' });
    expect(s.todayList[1].round).toBe(2);
  });

  it('최근 입금 대기 신청은 PENDING_PAYMENT 만, 신청 시각 내림차순 최대 3건', () => {
    const s = summarizeInspections(input({
      pendingCount: 4,
      plans: [
        plan({ createdAt: '2026-09-20T01:00:00.000Z', contactName: '오래됨' }),
        plan({ createdAt: '2026-09-27T01:00:00.000Z', contactName: '최근' }),
        plan({ createdAt: '2026-09-28T01:00:00.000Z', status: 'ACTIVE', contactName: '이용중' }),
        plan({ createdAt: '2026-09-25T01:00:00.000Z', contactName: '중간' }),
        plan({ createdAt: '2026-09-26T01:00:00.000Z', contactName: '둘째' }),
      ],
    }));
    expect(s.recentPending.map((p) => p.contactName)).toEqual(['최근', '둘째', '중간']);
    expect(s.recentPending[0]).toMatchObject({ createdDate: '2026-09-27', contactPhone: '01012345678' });
  });
});

describe('shortAddress', () => {
  it('시·도를 떼고 두 마디만 남긴다', () => {
    expect(shortAddress('경기 성남시 분당구 정자동 123')).toBe('성남시 분당구');
    expect(shortAddress('경기도 하남시 망월동 1')).toBe('하남시 망월동');
    expect(shortAddress('서울특별시 송파구 잠실동')).toBe('송파구 잠실동');
  });
  it('짧은 주소는 그대로 둔다', () => {
    expect(shortAddress('성남시 수정구')).toBe('성남시 수정구');
    expect(shortAddress('  세종 ')).toBe('세종');
  });
});
