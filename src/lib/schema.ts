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

type Crumb = { name: string; path: string };

// 페이지 단위 그래프 — WebPage(dateModified 는 신선도 신호, GEO 감사 권고) + BreadcrumbList.
// 홈 한 단계뿐인 경로에는 BreadcrumbList 를 넣지 않는다(항목 1개짜리 목록은 의미가 없다).
export function getWebPageGraph(opts: {
  path: string;
  name: string;
  description?: string;
  dateModified?: string;
  /** 홈과 현재 페이지 사이의 상위 경로(예: 구 페이지의 시 페이지). 홈은 자동으로 앞에 붙는다. */
  parents?: readonly Crumb[];
}) {
  // Next 가 내는 canonical(홈은 끝 슬래시 없음)과 글자 단위로 같게 맞춘다.
  const url = opts.path === '/' ? SITE_URL : `${SITE_URL}${opts.path}`;
  const crumbs: Crumb[] = [{ name: '홈', path: '/' }, ...(opts.parents ?? [])];
  if (opts.path !== '/') crumbs.push({ name: opts.name, path: opts.path });
  const webPage = {
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: opts.name,
    ...(opts.description ? { description: opts.description } : {}),
    inLanguage: 'ko-KR',
    isPartOf: { '@id': WEBSITE_ID },
    about: { '@id': ORG_ID },
    ...(opts.dateModified ? { dateModified: opts.dateModified } : {}),
  };
  const graph: object[] = [webPage];
  if (crumbs.length > 1) {
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: crumbs.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
        item: `${SITE_URL}${c.path === '/' ? '/' : c.path}`,
      })),
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

// 홈 FAQ — Google 리치결과는 2026-05 부로 은퇴했고, AI 검색(ChatGPT·Perplexity·AI Overviews) 인용용으로 넣는다.
// 화면에 보이는 문답(<details>)과 글자 하나 다르지 않게 같은 배열을 넘길 것.
export function getFaqPageSchema(items: ReadonlyArray<{ q: string; a: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

// 접수 처리 절차 — HowTo 는 폐기된 타입이라 순서 있는 ItemList 로 표현한다.
export function getProcessListSchema(name: string, steps: ReadonlyArray<{ title: string; desc: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    numberOfItems: steps.length,
    itemListElement: steps.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: s.title,
      description: s.desc,
    })),
  };
}

// 가이드 글 — Article + WebPage + BreadcrumbList(홈 › 전기 상식 › 글). author/publisher 는 조직 엔티티를 가리킨다.
export function getArticleGraph(opts: {
  path: string;
  headline: string;
  description: string;
  datePublished: string;
  dateModified: string;
  keywords?: readonly string[];
}) {
  const url = `${SITE_URL}${opts.path}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: opts.headline,
        description: opts.description,
        inLanguage: 'ko-KR',
        datePublished: opts.datePublished,
        dateModified: opts.dateModified,
        author: { '@id': ORG_ID },
        publisher: { '@id': ORG_ID },
        mainEntityOfPage: { '@id': `${url}#webpage` },
        image: `${SITE_URL}/brand/og-default.png`,
        articleSection: '전기 상식',
        ...(opts.keywords?.length ? { keywords: opts.keywords.join(', ') } : {}),
      },
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: opts.headline,
        description: opts.description,
        inLanguage: 'ko-KR',
        isPartOf: { '@id': WEBSITE_ID },
        about: { '@id': ORG_ID },
        dateModified: opts.dateModified,
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '홈', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: '전기 상식', item: `${SITE_URL}/guide` },
          { '@type': 'ListItem', position: 3, name: opts.headline, item: url },
        ],
      },
    ],
  };
}

// 지역 출동 페이지 — 사이트 공통 Service 와 별개 @id 로, areaServed 를 해당 시/군/구로 한정한다.
// LocalBusiness·물리 주소·geo 는 넣지 않는다(디스패치 중개 모델, local.md 기준 유지).
export function getAreaServiceSchema(opts: {
  path: string;
  areaName: string;
  sido: string;
  name: string;
  description: string;
  /** 구 단위 페이지: areaServed 를 AdministrativeArea(구) → City(시) → 시/도 로 중첩한다. */
  city?: string;
  /** 여러 관할에 걸친 생활권(위례): 관할별 AdministrativeArea 배열로 낸다(가짜 행정구역명 생성 금지) */
  jurisdictions?: readonly { name: string; sido: string }[];
}) {
  const url = `${SITE_URL}${opts.path}`;
  const sidoPlace = { '@type': 'AdministrativeArea', name: opts.sido };
  const areaServed = opts.jurisdictions?.length
    ? opts.jurisdictions.map((j) => ({
        '@type': 'AdministrativeArea',
        name: j.name,
        containedInPlace: { '@type': 'AdministrativeArea', name: j.sido },
      }))
    : opts.city
    ? {
        '@type': 'AdministrativeArea',
        name: opts.areaName,
        containedInPlace: { '@type': 'City', name: opts.city, containedInPlace: sidoPlace },
      }
    : { '@type': 'City', name: opts.areaName, containedInPlace: sidoPlace };
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${url}#service`,
    name: opts.name,
    serviceType: '전기 수리 출동',
    description: opts.description,
    provider: { '@id': ORG_ID },
    isRelatedTo: { '@id': SERVICE_ID },
    areaServed,
    url,
    availableChannel: {
      '@type': 'ServiceChannel',
      serviceUrl: `${SITE_URL}/request/new`,
      servicePhone: { '@type': 'ContactPoint', telephone: TELEPHONE, contactType: 'customer service' },
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

// 정기 전기점검 구독 — 사이트 공통 Service(출동 중개)와 **다른 상품**이라 별도 @id 를 쓴다.
// 이쪽은 중개가 아니라 우리가 값을 매겨 파는 구독 상품이므로 Offer(가격·통화·기간)를 붙인다.
// 가격은 코드 상수(INSPECTION_PRICE_WON)를 그대로 받아 화면 표기와 어긋날 수 없게 한다.
export function getInspectionServiceSchema(opts: {
  path: string;
  priceWon: number;
  visitsPerTerm: number;
}) {
  const url = `${SITE_URL}${opts.path}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${url}#service`,
    name: '정기 전기점검 구독',
    serviceType: '전기 안전점검',
    provider: { '@id': ORG_ID },
    isRelatedTo: { '@id': SERVICE_ID },
    areaServed: { '@type': 'Country', name: 'KR' },
    audience: { '@type': 'Audience', audienceType: '주택·상가의 전기 안전을 미리 점검받으려는 일반 소비자' },
    description:
      `연 ${opts.priceWon.toLocaleString('ko-KR')}원에 분기마다 1회씩 1년에 ${opts.visitsPerTerm}회, ` +
      '전기기사가 방문해 분전반·누전차단기·콘센트·조명 등 생활 전기 설비를 점검하는 전기점검 서비스. ' +
      '고장이 난 뒤 부르는 출동 수리와 달리 사고가 나기 전에 미리 확인한다.',
    url,
    offers: {
      '@type': 'Offer',
      price: opts.priceWon,
      priceCurrency: 'KRW',
      url,
      availability: 'https://schema.org/InStock',
      // 계좌이체(무통장입금) 단일 수단 — PG 결제는 쓰지 않는다.
      acceptedPaymentMethod: {
        '@type': 'PaymentMethod',
        name: '계좌이체(무통장입금)',
      },
      itemOffered: {
        '@type': 'Service',
        name: `정기 전기점검 (연 ${opts.visitsPerTerm}회 방문)`,
      },
    },
  };
}
