import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { FixtureFactory } from '../../../tests/helpers/fixtures';
import { getSettlementDetail } from '@/lib/settlementDetail';
import { getSettlementReport } from '@/lib/settlementReport';
import { resendSurvey } from '@/lib/surveyReminder';
import { GET as settlements } from '@/app/api/admin/settlements/route';
import { GET as surveys } from '@/app/api/admin/analytics/surveys/route';
import { POST as resend } from '@/app/api/admin/analytics/surveys/[id]/resend/route';
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn() }));
import { requireSession } from '@/lib/auth';

config({ quiet:true });
const fixtures = new FixtureFactory(prisma);
const requestIds: string[] = [];
beforeAll(() => {
  if (!process.env.DATABASE_URL?.includes('mijin_portal_audit')) throw new Error('Run only against isolated portal audit DB');
  vi.stubEnv('SMS_PROVIDER','console'); vi.stubEnv('APP_BASE_URL','http://localhost:3001');
  vi.mocked(requireSession).mockResolvedValue({userId:'test-admin',role:'ADMIN'} as Awaited<ReturnType<typeof requireSession>>);
});
afterAll(async()=>{ await prisma.smsLog.deleteMany({where:{requestId:{in:requestIds}}}); await fixtures.cleanupAll();await prisma.$disconnect();vi.unstubAllEnvs();vi.unstubAllGlobals(); });
async function pending() {
  const provider = await fixtures.createPartnerFixture({ isActive:false });
  const request = await fixtures.createRequestFixture({ status:'COMPLETED' });
  requestIds.push(request.id);
  return prisma.satisfactionSurvey.create({data:{requestId:request.id,providerId:provider.providerId,token:randomUUID()}});
}
it('정산 상세는 업체·기사 분리, KST 경계, 0원·미입력, 25건 이후 원본과 합계가 일치한다',async()=>{
  const partner=await fixtures.createPartnerFixture({isActive:false});
  const tech=await fixtures.createTechFixture({isActive:false});
  const requests=[];
  for (let i=0;i<30;i++) requests.push(await fixtures.createRequestFixture({status:'COMPLETED',address:'서울특별시 강남구 검증로 30',description:'차단기 수리 신고'}));
  requestIds.push(...requests.map(r=>r.id));
  await prisma.satisfactionSurvey.createMany({data:requests.map((r,i)=>({requestId:r.id,token:randomUUID(),providerId:i===29?null:partner.providerId,technicianId:i===29?tech.technicianId:null,paidAmount:i===1?null:i===0?0:1000,rating:i===28?null:5,submittedAt:i===28?null:i===27?new Date('2026-09-30T15:00:00Z'):new Date('2026-08-31T15:00:00Z')}))});
  const query={month:'2026-09',kind:'PROVIDER' as const,payeeId:partner.providerId,page:1};
  const first=await getSettlementDetail(query);const second=await getSettlementDetail({...query,page:2});
  expect(first).toMatchObject({total:27,totalAmount:25000,aggregatedCount:26,missingCount:1,pageCount:2,hasNext:true});
  expect(first!.items).toHaveLength(25);expect(second!.items).toHaveLength(2);
  const all=[...first!.items,...second!.items];expect(new Set(all.map(r=>r.surveyId)).size).toBe(27);
  expect(all.reduce((sum,row)=>sum+(row.paidAmount??0),0)).toBe(first!.totalAmount);
  expect(all.filter(r=>r.paidAmount===0)).toHaveLength(1);expect(all.filter(r=>r.paidAmount===null)).toHaveLength(1);
  expect(all[0]).toMatchObject({address:'서울특별시 강남구 검증로 30',description:'차단기 수리 신고'});
  const aggregate=await getSettlementReport(undefined,{month:'2026-09'});
  expect(aggregate.providers.find(row=>row.payeeId===partner.providerId)?.total).toBe(first!.totalAmount);
  expect((await getSettlementDetail({...query,kind:'TECHNICIAN',payeeId:tech.technicianId}))?.totalAmount).toBe(1000);
  expect((await getSettlementDetail({...query,page:999}))?.page).toBe(2);
  expect((await getSettlementDetail({...query,month:'2025-01'}))?.items).toEqual([]);
  expect(await getSettlementDetail({...query,payeeId:'missing'})).toBeNull();
});
it('동시 재발송은 1건만 발송·기록하고 기존 토큰을 재사용한다',async()=>{
  const survey=await pending();
  const responses=await Promise.all([resendSurvey(survey.id,'http://localhost:3001'),resendSurvey(survey.id,'http://localhost:3001')]);
  expect(responses.map(r=>r.status).sort()).toEqual([200,429]);
  expect(responses.find(r=>r.status===200)).toMatchObject({simulated:true});
  const logs=await prisma.smsLog.findMany({where:{requestId:survey.requestId}});expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({status:'SENT',provider:'console'});expect(logs[0].body).toContain(`/survey/${survey.token}`);
  expect((await prisma.satisfactionSurvey.findUniqueOrThrow({where:{id:survey.id}})).submittedAt).toBeNull();
  const overview=await(await surveys(new NextRequest('http://localhost/api/admin/analytics/surveys?status=PENDING'))).json();
  expect(overview.surveys.items.find((r:{surveyId:string})=>r.surveyId===survey.id).delivery).toMatchObject({status:'SENT',simulated:true});
  expect(JSON.stringify(overview)).not.toContain(survey.token);
});
it('응답 완료·없는 설문은 발송하지 않는다',async()=>{
  const survey=await pending();await prisma.satisfactionSurvey.update({where:{id:survey.id},data:{submittedAt:new Date(),rating:5,paidAmount:10000}});
  expect((await resendSurvey(survey.id,'http://localhost')).status).toBe(409);
  expect((await resendSurvey('missing','http://localhost')).status).toBe(404);
  expect(await prisma.smsLog.count({where:{requestId:survey.requestId}})).toBe(0);
});
it('Solapi 잔액 부족은 502와 실패 기록을 남기며, 재시도에서도 링크·신고 금액을 바꾸지 않는다',async()=>{
  const survey=await pending();vi.stubEnv('SMS_PROVIDER','solapi');vi.stubEnv('SOLAPI_API_KEY','test');vi.stubEnv('SOLAPI_API_SECRET','test');vi.stubEnv('SOLAPI_SENDER','01000000000');
  const network=vi.fn().mockResolvedValue(new Response('insufficient balance',{status:402}));vi.stubGlobal('fetch',network);
  try {
    expect((await resendSurvey(survey.id,'http://localhost')).status).toBe(502);
    const log=await prisma.smsLog.findFirstOrThrow({where:{requestId:survey.requestId}});expect(log.status).toBe('FAILED');expect(log.error).toContain('402');
    await prisma.smsLog.update({where:{id:log.id},data:{createdAt:new Date(Date.now()-61000)}});
    network.mockResolvedValue(new Response('{}',{status:200}));
    expect((await resendSurvey(survey.id,'http://localhost')).status).toBe(200);
    const logs=await prisma.smsLog.findMany({where:{requestId:survey.requestId}});expect(logs).toHaveLength(2);expect(logs.every(l=>l.body.includes(survey.token))).toBe(true);
    expect((await prisma.satisfactionSurvey.findUniqueOrThrow({where:{id:survey.id}})).paidAmount).toBeNull();
  } finally { vi.stubEnv('SMS_PROVIDER','console');vi.unstubAllGlobals(); }
});
it('관리자 API 입력 검증·권한·Retry-After를 적용한다',async()=>{
  const survey=await pending();const url='http://localhost/api/admin/analytics/surveys/'+survey.id+'/resend';
  expect((await resend(new NextRequest(url,{method:'POST'}),{params:Promise.resolve({id:survey.id})})).status).toBe(200);
  const limited=await resend(new NextRequest(url,{method:'POST'}),{params:Promise.resolve({id:survey.id})});expect(limited.status).toBe(429);expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  for(const query of ['kind=WRONG&payeeId=p','kind=PROVIDER','payeeId=p','kind=TECHNICIAN&payeeId=p&page=0'])expect((await settlements(new NextRequest('http://localhost/api/admin/settlements?'+query))).status).toBe(400);
  vi.mocked(requireSession).mockResolvedValue(null);
  expect((await resend(new NextRequest(url,{method:'POST'}),{params:Promise.resolve({id:survey.id})})).status).toBe(401);
  expect((await settlements(new NextRequest('http://localhost/api/admin/settlements?kind=PROVIDER&payeeId=p'))).status).toBe(401);
});
