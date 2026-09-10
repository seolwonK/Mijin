import { expect, test, type Page } from '@playwright/test';
import { seedSession } from './helpers/auth';

const provider={payeeId:'p1',name:'한빛전기',type:'업체',total:150000,aggregatedCount:26,completedCount:27,missingCount:1,coverage:26/27};
const technician={...provider,payeeId:'t1',name:'김전기',type:'전기기사',total:90000};
const sourceRows=Array.from({length:27},(_,i)=>({surveyId:`s-${i}`,requestId:`r-${i}`,requestCode:`FIN-${i}`,address:'서울특별시 강남구 검증로 123',customerName:'신고 고객',description:'차단기와 누전 회로 점검',submittedAt:'2026-09-09T02:30:00Z',paidAmount:i===0?0:i===1?null:6000,rating:5}));
async function finance(page:Page){
 await seedSession(page.context(),'ADMIN');
 await page.route('**/api/admin/settlements?**',route=>{const p=new URL(route.request().url()).searchParams;const month=p.get('month');if(p.has('payeeId')){const n=Number(p.get('page'));return route.fulfill({json:{month,kind:p.get('kind'),payeeId:p.get('payeeId'),name:p.get('kind')==='PROVIDER'?provider.name:technician.name,totalAmount:p.get('kind')==='PROVIDER'?150000:90000,aggregatedCount:26,missingCount:1,total:27,page:n,pageSize:25,pageCount:2,hasNext:n===1,items:sourceRows.slice((n-1)*25,n*25)}});}return route.fulfill({json:{month,providers:[provider],technicians:[technician]}});});
}
test('집계 이름·금액에서 원본, 주소, 금액·미입력·0원, 접수 링크, 페이지 및 포커스 복귀',async({page})=>{
 await finance(page);await page.goto('/admin/settlements');
 const trigger=page.getByRole('button',{name:'한빛전기 신고 내역 보기'});await trigger.click();
 const detail=page.getByRole('dialog',{name:'한빛전기 정산 집계 상세'});await expect(detail).toBeVisible();
 await expect(detail.getByRole('listitem')).toHaveCount(25);await expect(detail).toContainText('서울특별시 강남구 검증로 123');await expect(detail).toContainText('차단기와 누전 회로 점검');
 await expect(detail.getByRole('listitem').nth(0)).toContainText('0원');await expect(detail.getByRole('listitem').nth(1)).toContainText('금액 미입력');
 await expect(detail.getByRole('link',{name:'접수 FIN-0 ↗'})).toHaveAttribute('href','/admin/requests/r-0');
 await detail.getByRole('button',{name:'다음'}).click();await expect(detail.getByRole('listitem')).toHaveCount(2);await expect(detail.getByRole('button',{name:'다음'})).toBeDisabled();
 await page.keyboard.press('Escape');await expect(detail).not.toBeVisible();await expect(trigger).toBeFocused();
 await page.getByRole('button',{name:'김전기 90,000원 원본 보기'}).click();await expect(page.getByRole('dialog')).toContainText('전기기사 정보 보기');
});
test('상세 오류 재시도, 빠른 대상 변경 시 지연된 원본 무시, 월 변경',async({page})=>{
 await finance(page);let failed=true;
 await page.route('**/api/admin/settlements?*kind=PROVIDER*',async route=>{if(failed)return route.fulfill({status:503,json:{}});await new Promise(r=>setTimeout(r,300));return route.fulfill({json:{month:'2026-09',name:'한빛전기',items:[],total:0,totalAmount:0,aggregatedCount:0,missingCount:0}});});
 await page.goto('/admin/settlements');await page.getByRole('button',{name:'한빛전기 신고 내역 보기'}).click();await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();failed=false;
 await page.getByRole('button',{name:'다시 시도'}).click();await page.getByRole('button',{name:'닫기',exact:true}).click();await page.getByRole('button',{name:'김전기 신고 내역 보기'}).click();await expect(page.getByRole('dialog')).toContainText('90,000원');await page.waitForTimeout(400);await expect(page.getByRole('dialog')).toContainText('90,000원');await page.keyboard.press('Escape');
 await page.getByLabel('정산 월').selectOption('2026-08');await expect(page.getByRole('link',{name:'CSV 내보내기'})).toHaveAttribute('href','/api/admin/settlements?month=2026-08&format=csv');
});
for(const width of [320,390,768,1280,1920])test(`정산 ${width}px 원본 접근 및 패널 폭`,async({page})=>{
 await finance(page);await page.setViewportSize({width,height:900});await page.goto('/admin/settlements');await page.getByRole('button',{name:'한빛전기 신고 내역 보기',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('150,000원');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const box=await page.getByRole('dialog').boundingBox();expect(box!.width).toBeLessThanOrEqual(width);expect(box!.x).toBeGreaterThanOrEqual(0);
});

async function surveyUi(page:Page){
 await seedSession(page.context(),'ADMIN');const rows=[{surveyId:'pending',requestId:'r1',requestCode:'PENDING-01',customerName:'대기 고객',customerPhone:'01000000000',elapsedDays:3,createdAt:'2026-09-01T00:00:00Z',submittedAt:null,paidAmount:null,rating:null},{surveyId:'done',requestId:'r2',requestCode:'DONE-02',customerName:'완료 고객',customerPhone:'01000000000',elapsedDays:2,createdAt:'2026-09-01T00:00:00Z',submittedAt:'2026-09-02T00:00:00Z',paidAmount:0,rating:5}];
 await page.route('**/api/admin/analytics/surveys?**',route=>route.fulfill({json:{total:2,submitted:1,responseRate:.5,paidStats:{sum:0,count:1,avg:0},updatedAt:'2026-09-10T00:00:00Z',surveys:{items:rows,total:2,page:1,pageSize:50,pageCount:1,hasNext:false}}}));
}
test('미응답만 재발송 가능·취소하면 무발송·성공 피드백과 중복 클릭 방지',async({page})=>{
 await surveyUi(page);let calls=0;await page.route('**/surveys/pending/resend',async route=>{calls++;await new Promise(r=>setTimeout(r,150));await route.fulfill({json:{status:200,simulated:true}});});await page.goto('/admin/analytics/surveys');
 await expect(page.getByRole('button',{name:'DONE-02 설문 재발송'})).toHaveCount(0);const button=page.getByRole('button',{name:'PENDING-01 설문 재발송'});await button.click();await expect(page.getByRole('dialog')).toContainText('대기 고객 · 01000000000');await page.getByRole('button',{name:'취소',exact:true}).click();expect(calls).toBe(0);
 await button.click();await page.getByRole('dialog').getByRole('button',{name:'재발송',exact:true}).click();await expect(button).toBeDisabled();await expect(page.getByRole('status').filter({hasText:'실제 문자는 전송하지 않았습니다.'})).toBeVisible();expect(calls).toBe(1);
});
test('실패·응답 완료 충돌·중복 제한을 성공으로 표시하지 않는다',async({page})=>{
 await surveyUi(page);let status=502;await page.route('**/surveys/pending/resend',route=>route.fulfill({status,json:{error:status===502?'문자 발송에 실패했습니다.':status===409?'이미 응답한 설문입니다.':'방금 발송을 요청한 설문입니다.'}}));await page.goto('/admin/analytics/surveys');
 for(const code of [502,409,429]){status=code;await page.getByRole('button',{name:'PENDING-01 설문 재발송'}).click();await page.getByRole('dialog').getByRole('button',{name:'재발송',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText(code===502?'문자 발송에 실패':code===409?'이미 응답':'방금 발송');}
});
test('모바일에서 설문 재발송과 확인창을 사용할 수 있다',async({page})=>{
 await surveyUi(page);await page.setViewportSize({width:320,height:900});await page.goto('/admin/analytics/surveys');await page.getByRole('button',{name:'PENDING-01 설문 재발송'}).click();await expect(page.getByRole('dialog')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
});
