// 전기 상식 가이드용 인라인 SVG 도해 — 외부 이미지 없이 렌더되고, 텍스트 라벨이 그대로 HTML 에 남아 검색엔진이 읽는다.
// 색은 브랜드 토큰이 아닌 고정값(인쇄·다크 무관 라이트 고정 사이트).
const INK = '#1f2547';
const MUTED = '#6b7290';
const BRAND = '#2e3a7c';
const RED = '#c0392b';
const GREEN = '#1e8449';
const LIGHT = '#f2f5ff';

function Frame({ children, w, h, label }: { children: React.ReactNode; w: number; h: number; label: string }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="h-auto w-full max-w-xl">
      {children}
    </svg>
  );
}

// 두꺼비집(분전반) 구조: 메인 누전차단기 1 + 분기 배선용 차단기 여러 개
export function PanelLayoutFigure() {
  const branches = ['거실 콘센트', '주방', '욕실', '에어컨', '조명', '보일러'];
  return (
    <Frame w={640} h={300} label="두꺼비집 구조 도해: 왼쪽 메인 누전차단기, 오른쪽 분기 배선용 차단기 여섯 개">
      <rect x="10" y="10" width="620" height="280" rx="14" fill="#fff" stroke={MUTED} strokeWidth="2" />
      <text x="24" y="40" fontSize="16" fontWeight="700" fill={INK}>두꺼비집(분전반) 안</text>
      <rect x="30" y="70" width="120" height="180" rx="10" fill={LIGHT} stroke={BRAND} strokeWidth="2" />
      <rect x="70" y="100" width="40" height="70" rx="6" fill={BRAND} />
      <circle cx="90" cy="200" r="9" fill="#fff" stroke={BRAND} strokeWidth="2" />
      <text x="90" y="205" fontSize="10" textAnchor="middle" fill={BRAND} fontWeight="700">T</text>
      <text x="90" y="235" fontSize="12" textAnchor="middle" fill={INK} fontWeight="700">메인 누전차단기</text>
      <text x="90" y="250" fontSize="10" textAnchor="middle" fill={MUTED}>테스트 버튼 있음 · 집 전체</text>
      {branches.map((b, i) => (
        <g key={b} transform={`translate(${180 + i * 72}, 70)`}>
          <rect x="0" y="0" width="60" height="180" rx="8" fill="#fff" stroke={MUTED} strokeWidth="1.5" />
          <rect x="18" y="30" width="24" height="60" rx="5" fill={MUTED} />
          <text x="30" y="150" fontSize="10" textAnchor="middle" fill={INK} fontWeight="700">{b}</text>
          <text x="30" y="166" fontSize="9" textAnchor="middle" fill={MUTED}>분기 차단기</text>
        </g>
      ))}
      <text x="320" y="275" fontSize="11" textAnchor="middle" fill={MUTED}>분기 하나만 내려가면 그 회로만, 메인이 내려가면 집 전체가 정전</text>
    </Frame>
  );
}

// 차단기 레버 3위치: ON / 트립(중간) / OFF — 트립 상태는 OFF 까지 내렸다가 올려야 복구
export function LeverPositionsFigure() {
  const items = [
    { title: 'ON (정상)', y: 60, color: GREEN, desc: '레버가 위' },
    { title: '트립 (내려감)', y: 105, color: RED, desc: '레버가 중간에 걸림' },
    { title: 'OFF', y: 150, color: MUTED, desc: '레버를 끝까지 내린 상태' },
  ];
  return (
    <Frame w={640} h={260} label="차단기 레버 위치 도해: 정상은 위, 트립은 중간, 끄면 아래. 트립된 차단기는 끝까지 내렸다가 올려야 복구된다">
      {items.map((it, i) => (
        <g key={it.title} transform={`translate(${40 + i * 200}, 30)`}>
          <rect x="0" y="0" width="150" height="180" rx="12" fill="#fff" stroke={MUTED} strokeWidth="2" />
          <rect x="55" y="30" width="40" height="120" rx="8" fill={LIGHT} stroke={MUTED} />
          <rect x="60" y={it.y - 20} width="30" height="30" rx="6" fill={it.color} />
          <text x="75" y="172" fontSize="12" textAnchor="middle" fontWeight="700" fill={INK}>{it.title}</text>
          <text x="75" y="198" fontSize="10" textAnchor="middle" fill={MUTED}>{it.desc}</text>
        </g>
      ))}
      <path d="M 300 230 L 500 230" stroke={BRAND} strokeWidth="2" markerEnd="url(#arrow)" />
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill={BRAND} />
        </marker>
      </defs>
      <text x="320" y="250" fontSize="11" fill={BRAND} fontWeight="700">복구 순서: 트립 → OFF 까지 내리기 → ON</text>
    </Frame>
  );
}

// 누전차단기 vs 배선용 차단기
export function ElbVsMcbFigure() {
  return (
    <Frame w={640} h={240} label="누전차단기와 배선용 차단기 비교 도해: 누전차단기는 누설전류와 과전류를 막고 테스트 버튼이 있다, 배선용 차단기는 과부하와 합선만 막는다">
      <g transform="translate(30, 20)">
        <rect x="0" y="0" width="270" height="200" rx="12" fill={LIGHT} stroke={BRAND} strokeWidth="2" />
        <rect x="20" y="30" width="36" height="60" rx="6" fill={BRAND} />
        <circle cx="38" cy="115" r="9" fill="#fff" stroke={BRAND} strokeWidth="2" />
        <text x="38" y="119" fontSize="9" textAnchor="middle" fill={BRAND} fontWeight="700">T</text>
        <text x="80" y="45" fontSize="14" fontWeight="700" fill={INK}>누전차단기 (ELB)</text>
        <text x="80" y="70" fontSize="11" fill={INK}>· 새는 전기(누설전류) 감지 → 차단</text>
        <text x="80" y="90" fontSize="11" fill={INK}>· 과전류도 차단</text>
        <text x="80" y="110" fontSize="11" fill={INK}>· 테스트(T) 버튼 있음</text>
        <text x="80" y="130" fontSize="11" fill={INK}>· 감전·화재 예방</text>
        <text x="80" y="165" fontSize="10" fill={MUTED}>가정용 기준: 30mA 누설, 0.03초 내 차단</text>
      </g>
      <g transform="translate(340, 20)">
        <rect x="0" y="0" width="270" height="200" rx="12" fill="#fff" stroke={MUTED} strokeWidth="2" />
        <rect x="20" y="30" width="36" height="60" rx="6" fill={MUTED} />
        <text x="80" y="45" fontSize="14" fontWeight="700" fill={INK}>배선용 차단기 (MCCB·MCB)</text>
        <text x="80" y="70" fontSize="11" fill={INK}>· 과부하(너무 많은 전류) 차단</text>
        <text x="80" y="90" fontSize="11" fill={INK}>· 합선(단락) 차단</text>
        <text x="80" y="110" fontSize="11" fill={INK}>· 누전은 감지 못 함</text>
        <text x="80" y="130" fontSize="11" fill={INK}>· 테스트 버튼 없음</text>
        <text x="80" y="165" fontSize="10" fill={MUTED}>회로별(방·주방·에어컨) 분기 차단기로 주로 사용</text>
      </g>
    </Frame>
  );
}

// 정전 판단 흐름
export function OutageDecisionFigure() {
  const box = (x: number, y: number, w: number, text: string, sub: string, color = BRAND) => (
    <g transform={`translate(${x}, ${y})`}>
      <rect x="0" y="0" width={w} height="56" rx="10" fill="#fff" stroke={color} strokeWidth="2" />
      <text x={w / 2} y="24" fontSize="12" textAnchor="middle" fontWeight="700" fill={INK}>{text}</text>
      <text x={w / 2} y="42" fontSize="10" textAnchor="middle" fill={MUTED}>{sub}</text>
    </g>
  );
  return (
    <Frame w={640} h={330} label="정전 판단 흐름 도해: 옆집·가로등도 꺼졌으면 한전 123, 우리 집만이면 두꺼비집 확인, 차단기가 올라가 있는데 정전이면 계량기함·관리사무소, 내려갔으면 원인 회로 확인">
      {box(220, 10, 200, '전기가 나갔다', '먼저 창밖·옆집 확인')}
      <path d="M 320 66 L 320 90" stroke={MUTED} strokeWidth="2" />
      {box(40, 90, 240, '동네·옆집도 꺼짐', '한전 설비 정전 → 123 문의', MUTED)}
      {box(360, 90, 240, '우리 집만 꺼짐', '옥내 문제 → 두꺼비집 확인')}
      <path d="M 320 90 L 160 90" stroke={MUTED} strokeWidth="2" />
      <path d="M 320 90 L 480 90" stroke={MUTED} strokeWidth="2" />
      <path d="M 480 146 L 480 170" stroke={MUTED} strokeWidth="2" />
      {box(250, 170, 210, '차단기가 내려가 있다', '플러그 뽑고 올려서 원인 회로 찾기', RED)}
      {box(480, 170, 150, '차단기는 올라가 있다', '계량기함·세대 인입·관리사무소', MUTED)}
      <path d="M 355 226 L 355 250" stroke={MUTED} strokeWidth="2" />
      {box(210, 250, 290, '바로 다시 내려가거나 원인을 못 찾음', '전기기사 접수(초긴급 선택 가능)', GREEN)}
    </Frame>
  );
}

export const GUIDE_FIGURES = {
  'panel-layout': { Component: PanelLayoutFigure, caption: '두꺼비집(분전반) 구조 — 메인 누전차단기 1개와 회로별 분기 차단기' },
  'lever-positions': { Component: LeverPositionsFigure, caption: '차단기 레버 위치 — 트립(중간)된 차단기는 OFF 까지 내렸다가 올려야 복구됩니다' },
  'elb-vs-mcb': { Component: ElbVsMcbFigure, caption: '누전차단기와 배선용 차단기의 차이' },
  'outage-decision': { Component: OutageDecisionFigure, caption: '정전이 났을 때 누구에게 연락할지 가르는 순서' },
} as const;

export type GuideFigureId = keyof typeof GUIDE_FIGURES;
