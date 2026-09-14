// Schema.org 구조화 데이터 — 사업자 정보는 COMPANY(사업자등록증 원천)만 읽어 푸터·약관과 NAP 가 어긋나지 않게 한다.
// 모델링 원칙(2026-08-31·09-14 SEO 감사 확정): 우리는 시공 업체가 아니라 중개 플랫폼이므로 LocalBusiness 를
// 쓰지 않는다 → Organization + Service. 리뷰(AggregateRating)는 실노출 리뷰가 생길 때까지 넣지 않는다.
import { COMPANY } from '@/lib/company';

const SITE_URL = COMPANY.siteUrl;
export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const SERVICE_ID = `${SITE_URL}/#service`;

// 070-4995-3910 → +82-70-4995-3910 (E.164 표기, 선행 0 제거)
const TELEPHONE = `+82-${COMPANY.tel.replace(/^0/, '')}`;

export function getOrganizationSchema() {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: COMPANY.name,
    alternateName: COMPANY.siteDisplayUrl,
    url: `${SITE_URL}/`,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_URL}/brand/ajeossi-logo-bust.webp`,
      width: 646,
      height: 917,
    },
    image: `${SITE_URL}/brand/og-default.png`,
    description: '전기 고장 접수부터 가까운 출동 업체·전기기사 연결까지 돕는 전기 출동 중개 서비스.',
    telephone: TELEPHONE,
    address: {
      '@type': 'PostalAddress',
      streetAddress: '중앙로346번길 41, 1동 401호(송정동, 베일리하우스)',
      addressLocality: '광주시',
      addressRegion: '경기도',
      addressCountry: 'KR',
    },
    taxID: COMPANY.bizRegNo,
    founder: { '@type': 'Person', name: COMPANY.ceo },
    contactPoint: [
      {
        '@type': 'ContactPoint',
        telephone: TELEPHONE,
        contactType: 'customer service',
        areaServed: 'KR',
        availableLanguage: ['Korean'],
      },
    ],
  };
}

export function getWebsiteSchema() {
  // 사이트 내 검색 기능이 없으므로 SearchAction 은 넣지 않는다.
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: `${SITE_URL}/`,
    name: COMPANY.name,
    inLanguage: 'ko-KR',
    publisher: { '@id': ORG_ID },
  };
}

// 홈 증상 그리드(lib/symptoms.ts SYMPTOM_ITEMS 6종) + 누전 섹션(LEAK_SYMPTOM) = 실제 접수 가능 증상 7종.
// key 는 symptoms.ts 와 1:1 이고, 이름은 검색용 명사형으로 정리한 값이다(화면 라벨은 구어체).
const SERVICE_CATEGORIES = [
  { key: 'outage', name: '정전' },
  { key: 'burning', name: '타는 냄새·스파크' },
  { key: 'breaker', name: '두꺼비집(차단기)' },
  { key: 'appliance', name: '냉장고·에어컨 고장' },
  { key: 'outlet', name: '콘센트 고장' },
  { key: 'light', name: '조명 고장' },
  { key: 'leak', name: '누전' },
] as const;

export function getServiceSchema() {
  return {
    '@type': 'Service',
    '@id': SERVICE_ID,
    name: '전기 수리 출동 서비스',
    serviceType: '전기 수리 출동',
    provider: { '@id': ORG_ID },
    // 홈 FAQ 실제 카피: "전국 시/도·시/군/구 단위로 접수 가능합니다"
    areaServed: { '@type': 'Country', name: 'KR' },
    audience: { '@type': 'Audience', audienceType: '전기 고장을 겪는 일반 소비자' },
    description:
      '전기 고장(정전·누전·콘센트·조명·차단기·가전)을 접수하면 관리자 확인 또는 자동배정을 거쳐 ' +
      '등록된 출동 업체·전기기사가 현장으로 출동하는 전기 출동 중개 서비스. 접수 무료, 수리 대금은 현장에서 시공 업체와 직접 정산.',
    url: `${SITE_URL}/request/new`,
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: '출동 가능 고장 유형',
      itemListElement: SERVICE_CATEGORIES.map((c, i) => ({
        '@type': 'Offer',
        position: i + 1,
        itemOffered: { '@type': 'Service', name: `${c.name} 수리 출동` },
      })),
    },
  };
}

// 루트 레이아웃에 한 번 삽입하는 사이트 공통 그래프.
export function getSiteGraph() {
  return {
    '@context': 'https://schema.org',
    '@graph': [getOrganizationSchema(), getWebsiteSchema(), getServiceSchema()],
  };
}
