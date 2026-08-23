// 사업자 정보 — 단일 진실 원천.
// 출처: 사업자등록증(등록번호 710-24-02227, 2026-08-18 경기광주세무서 정정 발급).
// 푸터(SiteFooter)·소개/약관/개인정보처리방침 페이지가 전부 이 상수를 읽는다.
// PG(NHN KCP 휴대폰 본인인증) 심사 필수 항목: 상호·대표자·사업자등록번호·사업장 주소·유선 전화번호.
// 근로계약서의 사업주 정보(AppSettings.employer*)와는 별개다 — 그쪽은 관리자가 화면에서 편집하는
// 계약서 기입값이고, 여기는 법정 고지용 고정값이라 코드에 박아 두어 DB 상태와 무관하게 항상 노출된다.
export const COMPANY = {
  name: '전기아저씨',
  ceo: '권미진',
  bizRegNo: '710-24-02227',
  address: '경기도 광주시 중앙로346번길 41, 1동 401호(송정동, 베일리하우스)',
  // 유선 전화번호 — PG 심사는 휴대폰 번호를 인정하지 않는다(유선번호만 가능).
  // 2026-08-23 사용자 지정 070 인터넷전화(유선 취급). 값이 비면 푸터의 전화 행이 렌더되지 않는다.
  tel: '070-4995-3910' as string,
  // 개인정보처리방침 시행일 — 방침 내용을 바꾸면 함께 갱신한다.
  privacyEffectiveDate: '2026-08-23',
  termsEffectiveDate: '2026-08-23',
  // 공개 도메인(한글 도메인의 퓨니코드). 소개 페이지·약관에서 서비스 URL로 표기한다.
  siteUrl: 'https://xn--ok0bp94bnc26kra.com',
  siteDisplayUrl: '전기아저씨.com',
} as const;

export const LEGAL_LINKS = [
  { href: '/about', label: '서비스 소개' },
  { href: '/terms', label: '이용약관' },
  { href: '/privacy', label: '개인정보처리방침', emphasis: true },
] as const;
