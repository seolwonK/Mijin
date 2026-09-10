import type { Page } from '@playwright/test';

export const QUEUE_CANDIDATE = {
  kind: 'PROVIDER', id: 'queue-test-provider', name: '큐 테스트 업체', phone: '01000000001',
  address: '서울특별시 강남구 테헤란로 152 아주 긴 사업장 주소와 상세 층수', distanceKm: 1,
  coversRegion: true, rejectedThisRequest: false, assigned30d: 8, avgRating: 4.8,
  reviewCount: 21, eggBalance: 60, sameDistrict: true,
};
export const QUEUE_ROWS = Array.from({ length: 28 }, (_, index) => ({
  id: `queue-request-${index}`, lookupCode: index === 0 ? '900011' : `990${String(index).padStart(3, '0')}`,
  customerName: index === 0 ? '긴 이름의 테스트 고객 담당자' : `고객 ${index}`, customerPhone: '01012345678',
  description: index === 0 ? '차단기를 올려도 다시 내려갑니다. 매장 안쪽의 조명과 냉장고 전원이 함께 꺼져 영업이 어렵습니다. 분전함에서 소리가 나며, 현장 담당자에게 먼저 전화한 뒤 방문해 주세요. 건물 관리실은 지하 주차장 입구에 있고 출입 등록이 필요합니다. 주방과 냉장고를 다른 회로에 연결해 보았지만 같은 증상이 반복됩니다. 현장 사진과 차단기 모델명은 관리실에 준비되어 있으니 함께 확인해 주시기 바랍니다.' : `접수 내용 ${index}`,
  address: '서울특별시 강남구 테헤란로 152 12층 고객센터', urgency: index === 0 ? 'CRITICAL' : 'NORMAL',
  status: index === 0 ? 'RECEIVED' : index === 1 ? 'DISPATCHED' : 'COMPLETED', needsAttention: index === 0,
  createdAt: new Date(Date.UTC(2026, 8, 10, 0, 0) - index * 60000).toISOString(),
  assigneeName: index === 0 ? null : '긴 이름의 테스트 전기공사 업체',
  survey: index > 1 ? { submitted: true, rating: 5 } : null,
}));
export function queueDetail(id: string) {
  const row = QUEUE_ROWS.find(item => item.id === id) ?? QUEUE_ROWS[0];
  return { ...row, assignBaseAt: new Date().toISOString(), autoAssignEnabled: false, waitMinutes: 10,
    assignments: row.status === 'RECEIVED' ? [] : [{ id: `assignment-${id}`, status: 'ACCEPTED', assignedBy: 'ADMIN', createdAt: row.createdAt, assignee: { name: row.assigneeName, kind: 'PROVIDER' } }],
    survey: row.survey ? { ...row.survey, paidAmount: 150000 } : null,
  };
}
export async function mockQueue(page: Page) {
  await page.route('**/api/admin/requests', route => route.fulfill({ json: { requests: QUEUE_ROWS } }));
  await page.route('**/api/admin/requests/*', route => route.fulfill({ json: queueDetail(new URL(route.request().url()).pathname.split('/').at(-1)!) }));
  await page.route('**/api/admin/requests/*/candidates', route => route.fulfill({ json: { candidates: Array.from({ length: 5 }, (_, i) => ({ ...QUEUE_CANDIDATE, id: `candidate-${i}`, name: `${QUEUE_CANDIDATE.name} ${i + 1}` })) } }));
}
