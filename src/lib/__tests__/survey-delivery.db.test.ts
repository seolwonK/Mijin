import { config } from 'dotenv';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { createSurveyAndNotify } from '@/lib/survey';
import { FixtureFactory } from '../../../tests/helpers/fixtures';
import { NextRequest } from 'next/server';
import { GET as getSurvey } from '@/app/api/survey/[token]/route';

config({ quiet: true });
const fixtures = new FixtureFactory(prisma);

beforeAll(() => {
  vi.stubEnv('SMS_PROVIDER', 'solapi');
  vi.stubEnv('SOLAPI_API_KEY', 'internal-test-key');
  vi.stubEnv('SOLAPI_API_SECRET', 'internal-test-secret');
  vi.stubEnv('SOLAPI_SENDER', '01000000000');
  vi.stubEnv('APP_BASE_URL', 'http://localhost:3001');
});
afterAll(async () => {
  vi.unstubAllEnvs(); vi.unstubAllGlobals();
  await fixtures.cleanupAll(); await prisma.$disconnect();
});

it('SOLAPI 잔액 부족을 모의하면 설문·완료 상태는 유지하고 실패 로그를 남긴다. 재시도는 같은 링크를 쓴다.', async () => {
  // 실제 Solapi 네트워크 요청은 실행하지 않는다.
  const network = vi.fn().mockResolvedValue(new Response('Insufficient balance (internal test)', { status: 402 }));
  vi.stubGlobal('fetch', network);
  const p = await fixtures.createPartnerFixture({ isActive: false });
  const request = await fixtures.createRequestFixture({ status: 'COMPLETED' });
  const params = { requestId: request.id, providerId: p.providerId, technicianId: null, phone: '01000000000' };
  await createSurveyAndNotify(params);
  await vi.waitFor(async () => {
    expect(await prisma.smsLog.count({ where: { requestId: request.id, status: 'FAILED' } })).toBe(1);
  });
  const survey = await prisma.satisfactionSurvey.findUniqueOrThrow({ where: { requestId: request.id } });
  expect(survey.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
  const log = await prisma.smsLog.findFirstOrThrow({ where: { requestId: request.id } });
  expect(log.body).toContain(`http://localhost:3001/survey/${survey.token}`);
  expect(log.error).toContain('402');
  const response = await getSurvey(new NextRequest(`http://localhost:3001/survey/${survey.token}`), { params: Promise.resolve({ token: survey.token }) });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ submitted: false });
  expect((await prisma.serviceRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe('COMPLETED');
  network.mockResolvedValue(new Response('{}', { status: 200 }));
  await createSurveyAndNotify(params);
  await vi.waitFor(async () => {
    expect(await prisma.smsLog.count({ where: { requestId: request.id, status: 'SENT' } })).toBe(1);
  });
  expect(await prisma.satisfactionSurvey.count({ where: { requestId: request.id } })).toBe(1);
  expect((await prisma.satisfactionSurvey.findUniqueOrThrow({ where: { requestId: request.id } })).token).toBe(survey.token);
  expect(network).toHaveBeenCalledTimes(2);
});
