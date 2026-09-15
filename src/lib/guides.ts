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
    title: '누전차단기(두꺼비집) 내려가는 이유 5가지 — 하나만 내려감·안 올라감 대처',
    short: '누전차단기 내려감',
    description:
      '두꺼비집(누전차단기)이 내려가는 이유 5가지(가전 누전·습기·노후 배선·과부하·차단기 불량), 차단기가 하나만 내려갈 때·안 올라갈 때·올려도 전기가 안 들어올 때 각각의 뜻과 확인 순서, 전기기사를 불러야 하는 기준.',
    published: '2026-09-15',
    updated: '2026-09-15',
    symptom: 'breaker',
    keywords: ['누전차단기 내려감', '두꺼비집 내려가는 이유', '누전 차단기 하나만 내려감', '누전차단기 안올라감', '두꺼비집 올려도 전기 안들어옴'],
  },
  {
    slug: 'jeongjeon-hwakin',
    title: '우리 집만 정전·아파트 정전일 때 — 1분 확인 순서와 접수 방법',
    short: '정전 확인 순서',
    description:
      '동네 전체 정전인지 우리 집만 정전인지 1분 안에 가르는 법, 두꺼비집이 올라가 있는데 정전일 때, 아파트 정전에서 관리사무소·한전(123)·전기기사 중 누구에게 연락할지, 정전 중 하지 말아야 할 행동과 복구 순서.',
    published: '2026-09-15',
    updated: '2026-09-15',
    symptom: 'outage',
    keywords: ['우리집만 정전', '아파트 정전', '아파트 우리집만 정전', '두꺼비집 올라가 있는데 정전', '정전 됐을 때'],
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
    keywords: ['콘센트 타는 냄새', '콘센트 스파크', '긴급 누전', '누전 신호', '전기 찌릿'],
  },
  {
    slug: 'jeongi-suri-biyong',
    title: '전기 수리 출장비·비용은 어떻게 정해지나요 — 누전 수리·차단기·콘센트 교체',
    short: '전기 수리 비용',
    description:
      '전기 수리 출장비와 수리 비용이 정찰가로 정해지지 않는 이유, 비용을 구성하는 4가지 요소(출장·진단, 자재, 작업, 할증), 누전 수리·누전차단기 교체·콘센트 교체·분전반 교체별로 비용이 갈리는 지점, 현장에서 바가지를 피하는 확인 항목.',
    published: '2026-09-15',
    updated: '2026-09-15',
    symptom: null,
    keywords: ['전기 수리 출장비', '전기 수리 비용', '누전 수리 비용', '누전차단기 교체비용', '콘센트 교체 비용', '전기 기사 출장비'],
  },
  {
    slug: 'nujeon-baeseon-chadangi',
    title: '누전차단기와 배선용 차단기 차이 — 두꺼비집에서 하나만 내려갈 때 읽는 법',
    short: '차단기 차이·하나만 내려감',
    description:
      '두꺼비집 안의 누전차단기와 배선용 차단기가 각각 무엇을 막는지, 테스트 버튼으로 구분하는 법, 차단기가 하나만 내려갔을 때·메인만 내려갔을 때·안 올라갈 때 각각이 뜻하는 원인과 대처, 교체가 필요한 신호.',
    published: '2026-09-15',
    updated: '2026-09-15',
    symptom: 'breaker',
    keywords: ['누전 차단기 하나만 내려감', '배선차단기 누전차단기 차이', '누전차단기 배선용차단기 차이', '두꺼비집 하나만 내려감', '누전차단기 종류'],
  },
] as const;

export function getGuide(slug: string): GuideMeta | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
