import { test, expect } from '@playwright/test';
import { COMPANY } from '../../src/lib/company';

// PG(NHN KCP 휴대폰 본인인증) 심사 필수 요건 회귀 가드.
//  - 모든 공개 화면(본인인증이 일어나는 /tech/signup 포함) 하단에 사업자 정보가 고정 노출된다.
//  - 서비스 소개 / 이용약관 / 개인정보처리방침 페이지가 200으로 열리고 핵심 문구를 담는다.
// 유선 전화번호는 COMPANY.tel 이 채워진 뒤에만 행이 생기므로, 값이 있을 때만 단언한다.

const FOOTER_PAGES = ['/', '/lookup', '/login', '/request/new', '/tech/signup', '/partner/signup', '/about', '/terms', '/privacy'];

for (const path of FOOTER_PAGES) {
  test(`푸터 사업자 정보 고정 노출: ${path}`, async ({ page }) => {
    await page.goto(path);
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText(COMPANY.name);
    await expect(footer).toContainText(COMPANY.ceo);
    await expect(footer).toContainText(COMPANY.bizRegNo);
    await expect(footer).toContainText(COMPANY.address);
    if (COMPANY.tel) await expect(footer).toContainText(COMPANY.tel);
    await expect(footer.getByRole('link', { name: '서비스 소개' })).toHaveAttribute('href', '/about');
    await expect(footer.getByRole('link', { name: '이용약관' })).toHaveAttribute('href', '/terms');
    await expect(footer.getByRole('link', { name: '개인정보처리방침' })).toHaveAttribute('href', '/privacy');
  });
}

test('서비스 소개: 중개 서비스 설명·본인인증 위치·사업자 정보', async ({ page }) => {
  const res = await page.goto('/about');
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: '서비스 소개' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('중개 플랫폼');
  await expect(page.getByRole('main')).toContainText('휴대폰 본인인증');
  await expect(page.getByRole('main').getByRole('link', { name: '전기기사 가입 페이지' })).toHaveAttribute('href', '/tech/signup');
  await expect(page.getByRole('main')).toContainText(COMPANY.bizRegNo);
});

test('이용약관: 시행일·중개자 조항·사업자 정보', async ({ page }) => {
  const res = await page.goto('/terms');
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: '이용약관' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText(`시행일자 ${COMPANY.termsEffectiveDate}`);
  await expect(page.getByRole('main')).toContainText('제5조 (회원 가입 및 본인인증)');
  await expect(page.getByRole('main')).toContainText(COMPANY.bizRegNo);
});

test('개인정보처리방침: 법정 고지 항목·본인인증 위탁·보호책임자', async ({ page }) => {
  const res = await page.goto('/privacy');
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: '개인정보처리방침' })).toBeVisible();
  const main = page.getByRole('main');
  for (const clause of ['처리 목적', '수집하는 개인정보의 항목', '보유 기간', '제3자 제공', '처리의 위탁', '국외 이전', '파기', '정보주체의 권리', '안전성 확보 조치', '개인정보 보호책임자']) {
    await expect(main).toContainText(clause);
  }
  await expect(main).toContainText('NHN KCP');
  // 포트원 접수 안내 메일(2026-08-24)의 계약 요건 — 포트원을 개인정보 처리 수탁자로 고지
  await expect(main).toContainText('코리아포트원');
  await expect(main).toContainText(`${COMPANY.ceo} (대표)`);
});

test('가입·접수 동의 문구에서 개인정보처리방침으로 이동할 수 있다', async ({ page }) => {
  for (const path of ['/tech/signup', '/partner/signup', '/request/new']) {
    await page.goto(path);
    const link = page.locator('label').getByRole('link', { name: '개인정보처리방침' });
    await expect(link).toHaveAttribute('href', '/privacy');
  }
  await page.goto('/tech/signup');
  await expect(page.locator('label').getByRole('link', { name: '이용약관' })).toHaveAttribute('href', '/terms');
});

test.describe('모바일 뷰포트', () => {
  // devices[] 스프레드는 defaultBrowserType 을 포함해 describe 안에서 못 쓴다 — 뷰포트만 지정.
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('푸터가 한 컬럼 시트 안에서 잘리지 않고 보인다', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeVisible();
    const box = await footer.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    // 주소 행이 시트 밖으로 넘치지 않는다(가로 스크롤 발생 금지)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});
