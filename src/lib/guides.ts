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
  category: GuideCategoryId;
  featured?: boolean; // 홈 '전기 상식' 섹션 노출
};

export type GuideCategoryId = 'breaker' | 'outage' | 'safety' | 'cost';
export const GUIDE_CATEGORIES: readonly { id: GuideCategoryId; label: string; desc: string }[] = [
  { id: 'breaker', label: '누전·두꺼비집·차단기', desc: '차단기가 내려갈 때 원인을 찾고, 어디까지 직접 해도 되는지' },
  { id: 'outage', label: '정전', desc: '우리 집만인지 동네 정전인지 가르고, 누구에게 연락할지' },
  { id: 'safety', label: '콘센트·화재·긴급 신호', desc: '타는 냄새·스파크·찌릿함처럼 그냥 두면 안 되는 신호' },
  { id: 'cost', label: '비용·점검·주거 형태', desc: '출장비가 정해지는 방식, 점검 제도, 세입자와 집주인의 부담' },
];

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
    category: 'breaker',
    featured: true,
  },
  {
    slug: 'jeongjeon-hwakin',
    title: '우리 집만 정전일 때 확인 순서 — 두꺼비집은 올라가 있는데 정전이라면',
    short: '정전 확인 순서',
    description: '동네 정전인지 우리 집만 정전인지 1분 안에 가르는 법, 두꺼비집이 올라가 있는데 정전일 때 의심할 곳, 정전 중 하지 말아야 할 행동과 복전 후 확인 순서.',
    published: '2026-09-15',
    updated: '2026-09-15',
    symptom: 'outage',
    keywords: ["우리집만 정전", "정전 됐을 때", "두꺼비집 올라가 있는데 정전", "갑자기 우리집만 정전", "정전 확인 순서"],
    category: 'outage',
    featured: true,
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
    category: 'safety',
    featured: true,
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
    category: 'cost',
    featured: true,
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
    category: 'breaker',
  },
  {
    slug: 'nujeon-chadangi-gyoche',
    title: '누전차단기 교체 시기·수명·비용 요소 — 두꺼비집 차단기 교체 전 확인',
    short: '누전차단기 교체',
    description: '누전차단기를 언제 바꿔야 하는지(시험 버튼 무반응·잦은 오작동·발열), 수명에 정해진 주기가 없는 이유, 전기기사가 현장에서 하는 교체 절차, 비용이 갈리는 요소, 직접 교체가 위험한 이유.',
    published: '2026-09-15',
    updated: '2026-09-15',
    symptom: 'breaker',
    keywords: ["누전차단기 교체", "누전차단기 교체비용", "두꺼비집 교체비용", "두꺼비집 교체", "누전차단기 수명", "누전차단기 안올라감", "차단기 테스트 버튼"],
    category: 'breaker',
  },
  {
    slug: 'dukkeobijip-wichi-gujo',
    title: '두꺼비집 위치와 구조 — 원룸·아파트·단독주택 어디에 있고 무엇이 들어있나',
    short: '두꺼비집 위치·구조',
    description: '원룸·오피스텔·아파트·단독주택별 두꺼비집(분전반) 위치 찾는 법, 안에 있는 메인·분기 차단기와 라벨 읽는 법, 열어도 되는 부분과 만지면 안 되는 부분.',
    published: '2026-09-15',
    updated: '2026-09-15',
    symptom: 'breaker',
    keywords: ['두꺼비집 위치', '원룸 두꺼비집 위치', '아파트 두꺼비집 위치', '분전반 구조', '두꺼비집 내려갔을때'],
    category: 'breaker',
  },
  {
    slug: 'apateu-jeongjeon',
    title: '아파트 정전 대처 — 우리 집만·동 전체·엘리베이터, 누구에게 연락하나',
    short: '아파트 정전 대처',
    description: '아파트에서 정전이 났을 때 우리 세대만인지 동 전체인지 가르는 법, 관리사무소·한전 123·전기기사 중 연락처 고르기, 엘리베이터·냉장고·복전 후 확인 사항, 복구 시간과 보상 문의처.',
    published: '2026-09-15',
    updated: '2026-09-15',
    symptom: 'outage',
    keywords: ['아파트 정전', '아파트 우리집만 정전', '아파트 정전 복구 시간', '아파트 정전 원인', '아파트 정전 보상'],
    category: 'outage',
  },
  {
    slug: 'jangma-nujeon-yebang',
    title: '장마철·비 오는 날 누전 예방 체크리스트 — 차단기가 비만 오면 내려갈 때',
    short: '장마철 누전 예방',
    description: '비 오는 날만 누전차단기가 내려가는 이유(외벽·베란다·옥상 배선 습기), 장마 전에 점검할 곳, 침수 시 전기 안전 수칙, 점검을 맡겨야 하는 기준.',
    published: '2026-09-15',
    updated: '2026-09-15',
    symptom: 'leak',
    keywords: ['비 오면 차단기 내려감', '장마철 누전', '베란다 누전', '침수 전기 안전', '누전 예방'],
    category: 'breaker',
  },
  {
    slug: 'concent-gyoche',
    title: '콘센트 교체·접지·스파크 — 타는 냄새·헐거움·안 될 때 확인 순서',
    short: '콘센트 교체·점검',
    description: '콘센트에서 타는 냄새·스파크·헐거움이 있을 때 확인 순서, 접지 콘센트와 일반 콘센트 차이, 교체가 필요한 신호, 교체 비용이 정해지는 요소, 직접 교체의 위험.',
    published: '2026-09-15',
    updated: '2026-09-15',
    symptom: 'outlet',
    keywords: ['콘센트 교체', '콘센트 교체 비용', '콘센트 타는 냄새', '콘센트 스파크', '접지 콘센트'],
    category: 'safety',
  },
  {
    slug: 'gajeon-nujeon',
    title: '세탁기·냉장고·보일러·에어컨 누전 — 어느 가전이 원인인지 찾는 법',
    short: '가전 누전 찾기',
    description: '누전차단기가 내려갈 때 세탁기·냉장고·보일러·에어컨·전기온수기 중 원인 가전을 찾는 순서, 가전별 누전이 잘 생기는 이유, 가전 수리와 전기 배선 수리를 가르는 기준.',
    published: '2026-09-15',
    updated: '2026-09-15',
    symptom: 'appliance',
    keywords: ['세탁기 누전', '냉장고 누전 수리', '보일러 누전', '에어컨 누전', '가전 누전'],
    category: 'breaker',
  },
  {
    slug: 'jeongi-yogeum-geupjeung',
    title: '전기요금이 갑자기 늘었을 때 — 누전·대기전력·계량기 확인 순서',
    short: '전기요금 급증 원인',
    description: '사용 습관이 그대로인데 전기요금이 크게 늘었을 때 누전·대기전력·고장 난 가전·계량기 오류를 구분하는 확인 순서, 한전 사용량 조회 방법, 누전이 의심될 때 점검 요청.',
    published: '2026-09-15',
    updated: '2026-09-15',
    symptom: 'leak',
    keywords: ['전기요금 급증', '전기요금 갑자기 많이 나옴', '누전 전기요금', '대기전력', '전기 사용량 조회'],
    category: 'breaker',
  },
  {
    slug: 'jeongi-hwajae-yebang',
    title: '전기 화재 예방 — 멀티탭·문어발·전열기구·노후 배선에서 불이 나는 이유',
    short: '전기 화재 예방',
    description: '전기 화재가 시작되는 흔한 지점(멀티탭 과부하·문어발·전열기구·노후 배선·먼지 낀 콘센트), 겨울철 전열기구 안전 사용법, 집에서 바로 할 수 있는 예방 점검, 타는 냄새가 날 때 대처.',
    published: '2026-09-15',
    updated: '2026-09-15',
    symptom: 'burning',
    keywords: ['전기 화재 예방', '멀티탭 화재', '문어발 콘센트', '전기 화재 원인', '전열기구 안전'],
    category: 'safety',
  },
  {
    slug: 'jeongi-anjeon-jeomgeom',
    title: '전기 안전점검 받는 법 — 정기점검 대상·주기, 신청 방법, 전기기사 점검과 차이',
    short: '전기 안전점검',
    description: '한국전기안전공사 정기점검 대상과 주기(일반 주택 3년), 사용전점검 신청 방법과 수수료, 점검에서 지적되는 항목, 부적합 시 재점검·개선명령 절차, 전기기사 출동 점검과의 차이.',
    published: '2026-09-15',
    updated: '2026-09-15',
    symptom: null,
    keywords: ["전기 안전점검", "전기안전공사 점검", "주택 전기 점검", "전기설비 정기점검", "전기 점검 신청", "전기 정기점검 주기"],
    category: 'cost',
  },
  {
    slug: 'wonrum-jeongi-gojang',
    title: '원룸·오피스텔 전기 고장 — 세입자와 집주인 중 누가 수리비를 내나',
    short: '원룸 전기 고장·비용 부담',
    description: '원룸·오피스텔·전세에서 두꺼비집·콘센트·조명이 고장 났을 때 임대인과 세입자의 수리비 부담 원칙, 먼저 연락할 사람, 긴급 상황에서 세입자가 바로 해도 되는 조치, 접수 방법.',
    published: '2026-09-15',
    updated: '2026-09-15',
    symptom: null,
    keywords: ['원룸 전기 고장', '원룸 두꺼비집', '오피스텔 전기 수리 비용', '세입자 수리비', '임대인 수선의무'],
    category: 'cost',
  },
] as const;

export function getGuide(slug: string): GuideMeta | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
