import { describe, expect, it } from 'vitest';
import {
  smsInspectionActivated,
  smsInspectionApplied,
  smsInspectionVisitBooked,
  smsInspectionVisitCanceled,
  smsInspectionVisitRescheduled,
} from '@/lib/sms/templates';

describe('전기점검 문자', () => {
  it('이름·입금자명의 줄바꿈이 본문의 새 줄이 되지 않는다 — 계좌 안내 문자에 줄을 끼워 넣을 수 없다', () => {
    const body = smsInspectionApplied({
      customerName: '홍길동',
      priceWon: 50_000,
      account: { bankName: '국민', accountNumber: '123-45', accountHolder: '전기아저씨' },
      depositorName: '김철수\n※ 계좌 변경: 카카오 3333-01-1234567',
    });
    expect(body.split('\n')).toHaveLength(4); // 인사 · 금액 · 계좌 · 입금자명
    expect(body.split('\n')[3]).toBe('입금자명: 김철수 ※ 계좌 변경: 카카오 3333-01-1234567');
  });

  it('U+2028/U+2029(줄·문단 구분자)와 서식 문자도 새 줄이 되지 않는다 — \\p{Cc} 만으로는 빠진다', () => {
    const body = smsInspectionApplied({
      customerName: '홍\u2029길동',
      priceWon: 50_000,
      account: { bankName: '국민', accountNumber: '123-45', accountHolder: '전기아저씨' },
      depositorName: '김철수\u2028※ 계좌 변경:\u202e카카오 3333-01-1234567',
    });
    expect(body).not.toMatch(/[\u2028\u2029\u202e]/);
    expect(body.split(/\r?\n/)).toHaveLength(4);
    expect(body.split('\n')[0]).toContain('홍 길동님');
    expect(body.split('\n')[3]).toBe('입금자명: 김철수 ※ 계좌 변경: 카카오 3333-01-1234567');
  });

  it('활성화 문자는 다른 점검 문자처럼 "M월 D일"과 시간대로 날짜를 알린다', () => {
    const base = { customerName: '홍길동', endDate: '2027-09-21', portalUrl: 'https://example.test/my' };
    const body = smsInspectionActivated({
      ...base,
      firstVisitDate: '2026-10-01',
      firstVisitTimeSlot: 'AFTERNOON',
    });
    expect(body).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(body).toContain('이용 기간: 2027년 9월 21일까지');
    expect(body).toContain('1회차 방문 예정일: 10월 1일 오후(13~18시)');
    // 시간대를 모르는 호출부는 날짜만 싣는다.
    expect(smsInspectionActivated({ ...base, firstVisitDate: '2026-10-01' })).toContain(
      '1회차 방문 예정일: 10월 1일',
    );
  });

  it('날짜 뒤의 조사는 끝 숫자와 무관하게 맞는다("…일로")', () => {
    expect(smsInspectionVisitBooked({ quarter: 2, date: '2026-12-23' })).toContain('12월 23일로 예약');
  });

  it('시간대가 바뀌었으면 문자에 시간대를 싣는다 — 날짜만 말하면 고객은 여전히 오전에 기다린다', () => {
    const base = { quarter: 1, date: '2026-10-10' };
    expect(smsInspectionVisitRescheduled({ ...base, timeSlot: null })).toContain('10월 10일로 변경');
    expect(smsInspectionVisitRescheduled({ ...base, timeSlot: 'AFTERNOON' })).toContain('10월 10일 오후로 변경');
    expect(smsInspectionVisitRescheduled({ ...base, timeSlot: 'MORNING' })).toContain('오전으로 변경');
  });

  it('고객이 움직여야 하는 문자에만 포털 주소를 싣는다', () => {
    const url = 'https://example.test/my';
    const base = { customerName: '홍길동', endDate: '2027-09-21', portalUrl: url };
    expect(smsInspectionActivated({ ...base, firstVisitDate: '2026-09-27' })).not.toContain(url);
    expect(smsInspectionActivated({ ...base, firstVisitDate: null })).toContain(url);
    expect(smsInspectionVisitCanceled({ quarter: 1, date: '2026-09-27', portalUrl: url })).toContain(url);
  });
});
