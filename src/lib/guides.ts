// 전기 상식 가이드 레지스트리 — 목차(/guide)·사이트맵·Article 스키마·관련 글 링크가 전부 이 배열을 읽는다.
// 본문은 src/app/(mobile)/guide/<slug>/page.tsx 에 있다. 글을 고치면 updated 를 함께 올릴 것.
export type GuideMeta = {
  slug: string;
  title: string; // <title>·h1 (브랜드 접미사는 루트 템플릿이 붙인다)
  short: string; // 목차·브레드크럼용 짧은 이름
  description: string; // meta description·Article.description
  published: string;
  updated: string;
  symptom: string | null; // 접수 CTA 에 붙일 ?symptom= 키(lib/symptoms.ts)
  keywords: string[];
};

export const GUIDES: readonly GuideMeta[] = [
  {
    slug: 'nujeon-chadangi',
    title: '누전차단기가 자꾸 내려가요 — 원인 5가지와 대처 순서',
    short: '누전차단기 내려감',
    description:
      '두꺼비집(누전차단기)이 자꾸 내려가는 원인 5가지(가전 누전·습기·노후 배선·과부하·차단기 불량)와 집에서 바로 해볼 확인 순서, 하지 말아야 할 행동, 전기기사를 불러야 하는 기준.',
    published: '2026-09-15',
    updated: '2026-09-15',
    symptom: 'breaker',
    keywords: ['누전차단기 내려감', '두꺼비집 내려감', '차단기 자꾸 떨어짐'],
  },
  {
    slug: 'jeongjeon-hwakin',
    title: '우리 집만 정전됐을 때 — 1분 확인 순서와 접수 방법',
    short: '정전 확인 순서',
    description:
      '동네 전체 정전인지 우리 집만 정전인지 1분 안에 가르는 법, 한전(123)에 연락할 상황과 전기기사를 불러야 할 상황의 차이, 정전 중 하지 말아야 할 행동과 복구 순서.',
    published: '2026-09-15',
    updated: '2026-09-15',
    symptom: 'outage',
    keywords: ['정전 됐을 때', '우리 집만 정전', '정전 확인'],
  },
  {
    slug: 'gingeup-nujeon',
    title: '긴급 누전 신호 — 타는 냄새·찌릿함·차단기 반복 시 즉시 할 일',
    short: '긴급 누전 대처',
    description:
      '누전을 알리는 위험 신호 6가지와 감전·화재를 막기 위해 지금 바로 해야 할 조치 순서, 초긴급으로 접수해야 하는 기준, 전기기사가 현장에서 누전을 찾는 방법.',
    published: '2026-09-15',
    updated: '2026-09-15',
    symptom: 'leak',
    keywords: ['긴급 누전', '누전 신호', '콘센트 타는 냄새', '전기 찌릿'],
  },
  {
    slug: 'jeongi-suri-biyong',
    title: '전기 수리 출장 비용은 어떻게 정해지나요',
    short: '전기 수리 비용',
    description:
      '전기 수리 출장 비용이 정찰가로 정해지지 않는 이유, 비용을 구성하는 4가지 요소(출장·진단, 자재, 작업, 할증), 작업 규모별 체감 차이, 현장에서 바가지를 피하는 확인 항목.',
    published: '2026-09-15',
    updated: '2026-09-15',
    symptom: null,
    keywords: ['전기 수리 비용', '전기 출장비', '전기 기사 부르기 비용'],
  },
] as const;

export function getGuide(slug: string): GuideMeta | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
