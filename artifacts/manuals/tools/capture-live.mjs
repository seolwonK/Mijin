import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { release } from './manual-content.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'img',`live-${release.date}`);
await mkdir(out,{recursive:true});
let manifest={release,shots:{}};
try {manifest=JSON.parse(await readFile(path.join(out,'capture.json'),'utf8'));}catch{}
const browser=await chromium.launch();
const failures=[],blocked=[];
async function context(role){
 const state=process.env[`MANUAL_${role.toUpperCase()}_STATE`];
 const ctx=await browser.newContext({baseURL:release.origin,viewport:{width:1440,height:960},deviceScaleFactor:1,...(state?{storageState:state}:{})});
 ctx.setDefaultTimeout(8000);
 await ctx.route('**/api/**',route=>{
  const r=route.request(),u=new URL(r.url());
  if(['GET','HEAD'].includes(r.method())||(r.method()==='POST'&&u.pathname==='/api/requests/lookup'))return route.continue();
  blocked.push({method:r.method(),path:u.pathname});return route.abort('blockedbyclient');
 });
 return ctx;
}
async function visit(page,url,ready){
 await page.goto(url,{waitUntil:'domcontentloaded'});
 if(ready)await ready(page).waitFor({state:'visible',timeout:20000});
 await page.evaluate(()=>document.fonts.ready);
}
async function shot(page,key,{focus,marks=[],description='',kind='desktop'}={}){
 await page.waitForLoadState('networkidle',{timeout:12000}).catch(()=>{});
 if(focus)await focus(page).evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const boxes=[];
 for(const [label,get] of marks){
  const locator=get(page).first();
  if(await locator.isVisible()){
   const r=await locator.boundingBox();
   if(r&&r.y>=0&&r.y+r.height<=page.viewportSize().height)boxes.push({...r,label});
  }
 }
 const image=await page.screenshot({animations:'disabled',fullPage:false,path:path.join(out,key+'.png')});
 manifest=JSON.parse(await readFile(path.join(out,'capture.json'),'utf8').catch(()=>JSON.stringify(manifest)));
 manifest.shots[key]={file:key+'.png',kind,description,url:page.url(),capturedAt:new Date().toISOString(),viewport:page.viewportSize(),scrollY:await page.evaluate(()=>window.scrollY),boxes,sha256:createHash('sha256').update(image).digest('hex')};
 await writeFile(path.join(out,'capture.json'),JSON.stringify(manifest,null,2));
 console.log('CAPTURED',key);
}
async function run(key,fn){if(process.env.MANUAL_CAPTURE_FILTER&&!process.env.MANUAL_CAPTURE_FILTER.split(',').includes(key))return;try{await fn();}catch(e){failures.push({key,error:e.message});console.error('CAPTURE_FAILED',key,e.message.split('\n')[0]);}}
const byText=(name)=>p=>p.getByText(name,{exact:true});
const button=(name)=>p=>p.getByRole('button',{name,exact:true});
const heading=(name)=>p=>p.getByRole('heading',{name,exact:true});
const label=(name)=>p=>p.getByLabel(name,{exact:true});

try {
 if(process.env.MANUAL_ADMIN_STATE){
  const ctx=await context('admin'),p=await ctx.newPage();
  await visit(p,'/admin/analytics/dashboard',byText('지금 남은 업무 · 전체 기간'));
  const data={};
  for(const name of ['requests','providers','technicians','analytics/surveys']){const r=await ctx.request.get('/api/admin/'+name);if(!r.ok())throw new Error(`Catalog ${name}: ${r.status()}`);data[name]=await r.json();}
  const request=data.requests.requests.find(r=>r.status==='RECEIVED');
  const completed=data.requests.requests.find(r=>r.status==='COMPLETED');
  const provider=data.providers.providers.find(r=>r.loginId==='partner1')??data.providers.providers[0];
  const tech=data.technicians.technicians.find(r=>r.loginId==='demotech1')??data.technicians.technicians.find(r=>r.contractStatus==='CONFIRMED');
  const pages=[
   ['a-dashboard','/admin',heading('접수 관리'),[['업무 요약',label('접수 요약')],['접수 목록',label('접수 상태 필터')]]],
   ['a-providers','/admin/providers',heading('업체 관리'),[]],
   ['a-provider-new','/admin/providers/new',p=>p.getByRole('button',{name:/등록/}).last(),[]],
   ['a-technicians','/admin/technicians',heading('전기기사 관리'),[]],
   ['a-tech-new','/admin/technicians/new',p=>p.getByRole('button',{name:/등록/}).last(),[]],
   ['a-rotation','/admin/rotation',label('지역 1순위 후보'),[['조회 지역',label('시/군/구 선택')],['구분 필터',label('후보 구분')]]],
   ['a-analytics','/admin/analytics/dashboard',label('선택 기간 요약'),[['전체 기간 현재 업무',label('현재 남은 업무')],['분석 기간',label('분석 기간')],['선택 기간 수치',label('선택 기간 요약')]]],
   ['a-map','/admin/analytics/map',label('지역 집계 요약'),[['지역별 집계',label('지역 집계 요약')],['필터·검색',label('지역 목록 필터')]]],
   ['a-map-district','/admin/analytics/map?sido='+encodeURIComponent('서울특별시'),label('지역 집계 요약'),[]],
   ['a-surveys','/admin/analytics/surveys',label('전체 설문 요약'),[['전체 기간 요약',label('전체 설문 요약')],['응답 상태 필터',label('설문 응답 상태')]]],
   ['a-ratings','/admin/analytics/ratings',p=>p.getByRole('heading',{level:1}),[]],
   ['a-settings','/admin/settings',label('은행명'),[]],
  ];
  for(const [key,url,ready,marks] of pages)await run(key,async()=>{await visit(p,url,ready);await shot(p,key,{marks});});
  await run('a-navigation',async()=>{await visit(p,'/admin',heading('접수 관리'));await shot(p,'a-navigation',{marks:[['업무 메뉴',p=>p.getByRole('navigation',{name:'관리자 이동'})],['열린 화면 탭',p=>p.getByRole('tablist')]]});await shot(p,'a-filters',{focus:label('접수 상태 필터'),marks:[['상태별 조회',label('접수 상태 필터')],['검색',label('접수 검색')],['정렬',label('접수 정렬')]]});});
  await run('a-selected',async()=>{if(!request)throw new Error('No received request');await visit(p,'/admin',heading('접수 관리'));await p.getByRole('button',{name:`접수 ${request.lookupCode} 선택`,exact:true}).click();await p.getByRole('link',{name:/상세 열기/}).waitFor();await shot(p,'a-selected',{marks:[['선택한 접수 상세로 이동',p=>p.getByRole('link',{name:/상세 열기/})]]});});
  await run('a-request',async()=>{if(!request)throw new Error('No received request');await visit(p,`/admin/requests/${request.id}`,heading('고장 내용'));await shot(p,'a-request');await p.getByRole('button',{name:'배정',exact:true}).first().waitFor();await shot(p,'a-candidates',{focus:p=>p.getByRole('button',{name:'배정',exact:true}).first(),marks:[['후보 배정',p=>p.getByRole('button',{name:'배정',exact:true}).first()]]});await p.getByRole('button',{name:'배정',exact:true}).first().click();await p.getByRole('dialog').waitFor();await shot(p,'a-assign-confirm',{marks:[['대상·발송 안내 확인',p=>p.getByRole('dialog')]]});await p.keyboard.press('Escape');});
  await run('a-provider-detail',async()=>{await visit(p,`/admin/providers/${provider.id}`,p=>p.getByRole('heading',{name:'사업자 인증'}));await shot(p,'a-provider-detail');await shot(p,'a-referrer',{focus:heading('소개자')});await shot(p,'a-provider-edit',{focus:p=>p.getByLabel('메모',{exact:true})});await shot(p,'a-eggs',{focus:heading('알 크레딧'),marks:[['충전 수량',label('충전 알 수')],['정정 사유',label('정정 사유')]]});});
  await run('a-tech-detail',async()=>{await visit(p,`/admin/technicians/${tech.id}`,p=>p.getByRole('heading',{level:1}));await shot(p,'a-tech-detail');await visit(p,`/admin/technicians/${tech.id}/contract`,p=>p.getByText('근로확인서',{exact:true}).first());await shot(p,'a-contract');});
  await run('a-charge-account',async()=>{await visit(p,'/admin/settings',p=>p.getByRole('heading',{level:1}));await p.getByLabel('은행명',{exact:true}).waitFor();await shot(p,'a-charge-account',{focus:p=>p.getByRole('heading',{name:/알 충전/}),marks:[['은행·계좌·예금주 설정',p=>p.getByRole('heading',{name:/알 충전/})]]});});
  await run('a-rotation-filter',async()=>{await visit(p,'/admin/rotation',label('후보 구분'));await p.getByLabel('후보 구분').getByRole('button',{name:/전기기사/}).click();await shot(p,'a-rotation-filter',{marks:[['기사만 보기',label('후보 구분')]]});});
  await run('a-surveys-pending',async()=>{await visit(p,'/admin/analytics/surveys',label('설문 응답 상태'));await p.getByRole('button',{name:'미응답',exact:true}).click();await p.getByRole('button',{name:/설문 재발송/}).first().waitFor();await shot(p,'a-surveys-pending');await p.getByRole('button',{name:/설문 재발송/}).first().click();await p.getByRole('dialog').waitFor();await shot(p,'a-survey-resend',{marks:[['고객·번호 확인 후 재발송',p=>p.getByRole('dialog')]]});await p.keyboard.press('Escape');});
  await run('a-commissions',async()=>{await visit(p,'/admin/commissions',p=>p.getByRole('heading',{name:'정산',exact:true}));await p.locator('tbody tr').first().waitFor();await shot(p,'a-commissions');await p.locator('tbody tr').first().click();await p.getByLabel('적립 월 필터').waitFor();await shot(p,'a-commission-detail');});
  await run('a-settlements',async()=>{await visit(p,'/admin/settlements',label('정산 월'));const surveys=data['analytics/surveys'].surveys?.items??[];const submitted=surveys.find(s=>s.submittedAt);if(submitted)await p.getByLabel('정산 월').selectOption(submitted.submittedAt.slice(0,7));await p.getByRole('button',{name:/신고 내역 보기/}).first().waitFor();await shot(p,'a-settlements',{marks:[['집계 월',label('정산 월')]]});await p.getByRole('button',{name:/신고 내역 보기/}).first().click();await p.getByRole('dialog').getByRole('listitem').first().waitFor();await shot(p,'a-settlement-detail',{marks:[['신고 원본',p=>p.getByRole('dialog')]]});await p.keyboard.press('Escape');});
  await run('a-rating-detail',async()=>{await visit(p,'/admin/analytics/ratings',p=>p.getByRole('heading',{level:1}));await p.locator('tbody tr').first().waitFor();await p.locator('tbody tr').first().click();await p.getByRole('heading',{name:'후기 전체',exact:true}).waitFor();await shot(p,'a-rating-detail');});
  await run('a-mobile-menu',async()=>{await p.setViewportSize({width:390,height:844});await visit(p,'/admin',heading('접수 관리'));await p.getByRole('button',{name:'관리자 메뉴 열기',exact:true}).click();await shot(p,'a-mobile-menu',{kind:'mobile'});});
  await writeFile(path.join(out,'catalog-private.json'),JSON.stringify({request,completed,provider,tech},null,2));
  await ctx.close();
 }

 if(process.env.MANUAL_PUBLIC==='1'){
  const ctx=await context('public'),p=await ctx.newPage();await p.setViewportSize({width:390,height:844});
  await run('public-logins',async()=>{for(const [prefix,scope] of [['a','admin'],['p','partner'],['t','tech']]){await visit(p,`/${scope}/login`,button('로그인'));await shot(p,`${prefix}-login`,{kind:'mobile',marks:[['아이디',p=>p.locator('#loginId')],['비밀번호',p=>p.locator('#password')],['로그인',button('로그인')]]});}});
  await run('public-signup',async()=>{for(const [prefix,scope] of [['p','partner'],['t','tech']]){await visit(p,`/${scope}/signup`,heading('계정 정보'));await shot(p,`${prefix}-signup-account`,{kind:'mobile',focus:heading('계정 정보')});await shot(p,`${prefix}-signup-region`,{kind:'mobile',focus:heading('서비스 가능 지역')});await shot(p,`${prefix}-signup-verify`,{kind:'mobile',focus:heading(scope==='partner'?'사업자 인증':'전기기사 정보')});await shot(p,`${prefix}-signup-submit`,{kind:'mobile',focus:button('가입 신청하기'),marks:[['입력 확인 후 신청',button('가입 신청하기')]]});}});
  await run('c-home',async()=>{await visit(p,'/',p=>p.getByRole('heading',{level:1}));await shot(p,'c-home',{kind:'mobile',marks:[['고장 접수 시작',p=>p.getByRole('link',{name:/고장 접수하기/}).last()]]});});
  await run('c-description',async()=>{await visit(p,'/request/new',p=>p.locator('#req-desc'));await shot(p,'c-description',{kind:'mobile',focus:p=>p.locator('#req-desc')});await shot(p,'c-photos',{kind:'mobile',focus:p=>p.locator('#req-photos')});await shot(p,'c-urgency',{kind:'mobile',focus:p=>p.locator('#req-urgency')});await shot(p,'c-contact',{kind:'mobile',focus:p=>p.locator('#req-name'),marks:[['이름',p=>p.locator('#req-name')],['연락처',p=>p.locator('#req-phone')],['개인정보 동의',p=>p.locator('#req-agree')]]});});
  await run('c-lookup',async()=>{await visit(p,'/lookup',p=>p.getByPlaceholder('접수하신 전화번호'));await shot(p,'c-lookup',{kind:'mobile'});});
  await run('c-complete',async()=>{const {completed}=JSON.parse(await readFile(path.join(out,'catalog-private.json'),'utf8'));await visit(p,`/request/complete/${completed.id}`,heading('접수가 완료되었습니다'));await shot(p,'c-complete',{kind:'mobile'});await p.getByRole('link',{name:'진행 상황 조회하기',exact:true}).click();await p.getByText(/접수번호 /).first().waitFor();await shot(p,'c-result',{kind:'mobile'});const survey=p.getByRole('link',{name:'만족도 조사 참여',exact:true});if(await survey.count()){await survey.first().click();await p.getByRole('heading',{name:'수리는 어떠셨나요?',exact:true}).waitFor();await shot(p,'c-survey',{kind:'mobile'});}});
  await ctx.close();
 }
 for(const [prefix,scope] of [['p','partner'],['t','tech']]){
  if(!process.env[`MANUAL_${scope.toUpperCase()}_STATE`])continue;
  const ctx=await context(scope),p=await ctx.newPage();await p.setViewportSize({width:390,height:844});
  await run(`${prefix}-home`,async()=>{await visit(p,`/${scope}`,heading('운영 현황'));await shot(p,`${prefix}-home`,{kind:'mobile',marks:[['알 충전 안내',p=>p.getByRole('link',{name:'알 충전하기',exact:true})]]});await shot(p,`${prefix}-queues`,{kind:'mobile',focus:p=>p.locator('#waiting')});});
  await run(`${prefix}-history`,async()=>{await visit(p,`/${scope}/history`,heading('지난 배정 내역'));await shot(p,`${prefix}-history`,{kind:'mobile'});const link=p.locator(`a[href^="/${scope}/jobs/"]`).first();if(await link.count()){await link.click();await p.getByRole('heading',{name:'고장 내용',exact:true}).waitFor();await shot(p,`${prefix}-job`,{kind:'mobile',description:'현재 라이브에 있는 배정 상세. 작업 상태에 따라 하단 버튼이 달라집니다.'});}});
  await run(`${prefix}-charge`,async()=>{await visit(p,`/${scope}/eggs/charge`,heading('충전 수량'));await shot(p,`${prefix}-charge`,{kind:'mobile',marks:[['수량 선택',label('충전할 알 개수')]]});await shot(p,`${prefix}-charge-account`,{kind:'mobile',focus:p=>p.getByRole('heading',{name:/입금 계좌|충전 계좌를 준비 중입니다/})});});
  await run(`${prefix}-commissions`,async()=>{await visit(p,`/${scope}/commissions`,heading('소개 수수료 전체 내역'));await shot(p,`${prefix}-commissions`,{kind:'mobile'});});
  await run(`${prefix}-profile`,async()=>{await visit(p,`/${scope}/profile`,p=>p.locator('#phone'));await shot(p,`${prefix}-profile`,{kind:'mobile'});await shot(p,`${prefix}-profile-regions`,{kind:'mobile',focus:heading('서비스 가능 지역')});});
  await run(`${prefix}-referrals`,async()=>{await visit(p,`/${scope}`,heading('운영 현황'));await shot(p,`${prefix}-referrals`,{kind:'mobile',focus:p=>p.getByRole('heading',{name:/내 추천 현황/})});await shot(p,`${prefix}-reviews`,{kind:'mobile',focus:p=>p.getByRole('heading',{name:/받은 후기/})});});
  if(scope==='tech')await run('t-contract',async()=>{await visit(p,'/tech/contract',p=>p.getByRole('heading',{name:/근로확인서/}).first());await shot(p,'t-contract',{kind:'mobile',description:'서명 완료 계정의 확인서 상단. 처음 작성할 때는 입력·서명 칸이 활성화됩니다.'});await shot(p,'t-contract-signed',{kind:'mobile',focus:heading('임금'),marks:[['서명한 임금과 근무조건',heading('임금')]],description:'서명 완료본의 하단 임금·근무조건. 정정이 필요하면 관리자에게 문의합니다.'});});
  await ctx.close();
 }
} finally {
 await writeFile(path.join(out,'capture-report.json'),JSON.stringify({failures,blocked,captured:Object.keys(manifest.shots).length},null,2));
 console.log('REPORT',JSON.stringify({failures,blocked,captured:Object.keys(manifest.shots).length}));
 if(failures.length)process.exitCode=1;
 await browser.close();
}
