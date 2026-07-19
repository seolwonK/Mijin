import { describe, expect, it, vi } from 'vitest';
import {
  getSettlementReport,
  getSettlementSourceRows,
  toSettlementCsv,
  type SettlementReportPrisma,
} from '@/lib/settlementReport';

type Survey = {
  id: string;
  providerId: string | null;
  technicianId: string | null;
  paidAmount: number | null;
  submittedAt: Date | null;
  lookupCode: string;
};

function settlementPrismaStub(surveys: Survey[]): SettlementReportPrisma {
  const groupBy = vi.fn(async (args: {
    by: Array<'providerId' | 'technicianId'>;
    where: { submittedAt: { gte: Date; lt: Date }; paidAmount?: { not: null } };
  }) => {
    const key = args.by[0];
    const groups = new Map<string, Survey[]>();
    for (const survey of surveys) {
      if (!survey.submittedAt || survey.submittedAt < args.where.submittedAt.gte || survey.submittedAt >= args.where.submittedAt.lt) continue;
      if (args.where.paidAmount && survey.paidAmount === null) continue;
      const id = survey[key];
      if (id) groups.set(id, [...(groups.get(id) ?? []), survey]);
    }
    return [...groups.entries()].map(([id, members]) => ({
      [key]: id,
      _count: members.length,
      _sum: { paidAmount: members.reduce((sum, survey) => sum + (survey.paidAmount ?? 0), 0) },
    }));
  });
  const findMany = vi.fn(async (args: { where?: { submittedAt?: { gte: Date; lt: Date }; paidAmount?: { not: null } } }) => {
    if (!args.where?.submittedAt) return [];
    return surveys
      .filter((survey) => survey.submittedAt && survey.submittedAt >= args.where!.submittedAt!.gte && survey.submittedAt < args.where!.submittedAt!.lt)
      .filter((survey) => !args.where!.paidAmount || survey.paidAmount !== null)
      .map((survey) => ({
        id: survey.id,
        paidAmount: survey.paidAmount,
        submittedAt: survey.submittedAt,
        providerId: survey.providerId,
        technicianId: survey.technicianId,
        request: { lookupCode: survey.lookupCode },
      }));
  });
  const payees = (prefix: string) => vi.fn(async (args: { where: { id: { in: string[] } } }) =>
    args.where.id.in.map((id) => ({ id, user: { name: `${prefix}-${id}` } })),
  );

  return {
    satisfactionSurvey: { groupBy, findMany },
    provider: { findMany: payees('업체') },
    technician: { findMany: payees('기술자') },
  } as unknown as SettlementReportPrisma;
}

const julyNow = new Date('2026-07-18T03:00:00.000Z');

describe('settlement report', () => {
  it('uses a half-open KST month boundary', async () => {
    const prisma = settlementPrismaStub([
      { id: 'start', providerId: 'p1', technicianId: null, paidAmount: 100, submittedAt: new Date('2026-06-30T15:00:00.000Z'), lookupCode: '000001' },
      { id: 'end', providerId: 'p2', technicianId: null, paidAmount: 200, submittedAt: new Date('2026-07-31T15:00:00.000Z'), lookupCode: '000002' },
    ]);

    const report = await getSettlementReport(prisma, { month: '2026-07', now: julyNow });

    expect(report.providers).toEqual([expect.objectContaining({ payeeId: 'p1', total: 100 })]);
    expect(prisma.satisfactionSurvey.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ submittedAt: {
        gte: new Date('2026-06-30T15:00:00.000Z'),
        lt: new Date('2026-07-31T15:00:00.000Z'),
      } }),
    }));
  });

  it('keeps provider and technician totals separate and counts null amounts as missing', async () => {
    const prisma = settlementPrismaStub([
      { id: 'p-paid', providerId: 'same-id', technicianId: null, paidAmount: 1000, submittedAt: new Date('2026-07-01T00:00:00.000Z'), lookupCode: '000001' },
      { id: 'p-missing', providerId: 'same-id', technicianId: null, paidAmount: null, submittedAt: new Date('2026-07-02T00:00:00.000Z'), lookupCode: '000002' },
      { id: 't-paid', providerId: null, technicianId: 'same-id', paidAmount: 500, submittedAt: new Date('2026-07-03T00:00:00.000Z'), lookupCode: '000003' },
    ]);

    const report = await getSettlementReport(prisma, { month: '2026-07', now: julyNow });

    expect(report.providers).toEqual([{
      payeeId: 'same-id', name: '업체-same-id', type: '업체', total: 1000,
      aggregatedCount: 1, completedCount: 2, missingCount: 1, coverage: 0.5,
    }]);
    expect(report.technicians).toEqual([expect.objectContaining({
      payeeId: 'same-id', name: '기술자-same-id', type: '기술자', total: 500, coverage: 1,
    })]);
  });

  it('hides payees without an aggregated amount and sorts visible payees by total', async () => {
    const prisma = settlementPrismaStub([
      { id: 'low', providerId: 'low', technicianId: null, paidAmount: 100, submittedAt: new Date('2026-07-01T00:00:00.000Z'), lookupCode: '000001' },
      { id: 'high', providerId: 'high', technicianId: null, paidAmount: 900, submittedAt: new Date('2026-07-01T00:00:00.000Z'), lookupCode: '000002' },
      { id: 'missing', providerId: 'missing', technicianId: null, paidAmount: null, submittedAt: new Date('2026-07-01T00:00:00.000Z'), lookupCode: '000003' },
    ]);

    const report = await getSettlementReport(prisma, { month: '2026-07', now: julyNow });

    expect(report.providers.map((row) => row.payeeId)).toEqual(['high', 'low']);
    expect(report.providers.find((row) => row.payeeId === 'missing')).toBeUndefined();
  });

  it('returns every paid source survey without pagination and excludes null amounts', async () => {
    const paid = Array.from({ length: 250 }, (_, index) => ({
      id: `survey-${index}`, providerId: 'p1', technicianId: null, paidAmount: index + 1,
      submittedAt: new Date('2026-07-10T00:00:00.000Z'), lookupCode: String(index).padStart(6, '0'),
    }));
    const prisma = settlementPrismaStub([
      ...paid,
      { id: 'null-amount', providerId: 'p1', technicianId: null, paidAmount: null, submittedAt: new Date('2026-07-10T00:00:00.000Z'), lookupCode: '999999' },
    ]);

    const rows = await getSettlementSourceRows(prisma, { month: '2026-07', now: julyNow });

    expect(rows).toHaveLength(250);
    expect(rows[0]).toEqual(expect.objectContaining({ surveyId: 'survey-0', payeeName: '업체-p1', type: '업체' }));
    const [sourceArgs] = (prisma.satisfactionSurvey.findMany as ReturnType<typeof vi.fn>).mock.calls;
    expect(sourceArgs[0]).not.toHaveProperty('take');
    expect(sourceArgs[0]).not.toHaveProperty('skip');
  });

  it('formats source rows as RFC4180 CSV using KST dates', () => {
    expect(toSettlementCsv([{
      lookupCode: '000001', surveyId: 'id,1', payeeName: '"업체"', type: '업체',
      submittedAt: '2026-06-30T15:00:00.000Z', paidAmount: 1000,
    }])).toBe('조회코드,설문ID,대상,유형,제출일(KST),고객신고금액(원)\r\n000001,"id,1","""업체""",업체,2026-07-01,1000');
  });

  it('neutralizes CSV formula-injection payee names', () => {
    const csv = toSettlementCsv([{
      lookupCode: '000001', surveyId: 's1', payeeName: '=1+2', type: '업체',
      submittedAt: '2026-07-01T00:00:00.000Z', paidAmount: 1000,
    }]);
    // 수식 트리거(=)로 시작하는 이름은 작은따옴표로 무력화되어야 한다.
    expect(csv.split('\r\n')[1]).toBe("000001,s1,'=1+2,업체,2026-07-01,1000");
    // 모든 수식 트리거(= + - @ \t \r)로 시작하는 이름이 작은따옴표로 무력화되는지 확인한다.
    for (const trigger of ['=', '+', '-', '@', '\t', '\r']) {
      const one = toSettlementCsv([{
        lookupCode: '000001', surveyId: 's1', payeeName: `${trigger}cmd`, type: '업체',
        submittedAt: '2026-07-01T00:00:00.000Z', paidAmount: 1000,
      }]);
      expect(one).toContain(`'${trigger}cmd`);
    }
  });
});
