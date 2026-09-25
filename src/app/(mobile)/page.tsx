import Link from 'next/link';
import Image from 'next/image';
import BrandLogo from '@/components/BrandLogo';
import ReviewSection from '@/components/ReviewSection';
import { AlertIcon, CheckIcon } from '@/components/icons';
import { SYMPTOM_ITEMS, LEAK_SYMPTOM } from '@/lib/symptoms';
import HomeSymptomIcon from './home-symptom-icon';
import styles from './home.module.css';
import type { Metadata } from 'next';
import JsonLd from '@/components/JsonLd';
import { getFaqPageSchema, getProcessListSchema, getWebPageGraph } from '@/lib/schema';
import { GUIDES } from '@/lib/guides';
import { PAGE_UPDATED } from '@/lib/pageDates';
import { AREAS_PATH, PRIORITY_AREA_LINKS } from '@/lib/areas';
import { INSPECTION_PRICE_WON, INSPECTION_VISITS_PER_TERM } from '@/lib/inspection';
import InspectionPromoDialog from '@/components/InspectionPromoDialog';

// title·description 은 루트 기본값을 그대로 쓴다. canonical 만 정식 도메인의 '/' 로 고정(CloudType 원본 호스트 대비).
export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

const PROCESS_STEPS = [
  { title: '고장 내용 접수', desc: '글이나 음성으로 증상과 주소를 남겨 주세요.' },
  { title: '담당 업체 연결', desc: '지역과 긴급도를 확인해 출동 가능한 업체를 배정해요.' },
  { title: '현장 방문·수리', desc: '업체가 접수를 수락하면 출동해요. 비용은 현장 확인 후 안내해요.' },
  { title: '완료 확인', desc: '처리 결과는 접수 내역에서 확인할 수 있어요.' },
] as const;

const LEAK_SIGNS = [
  '두꺼비집(차단기)이 자꾸 내려가요',
  '콘센트·스위치에서 타는 냄새가 나요',
  '벽이나 수도꼭지를 만지면 찌릿해요',
  '전기요금이 갑자기 크게 늘었어요',
] as const;

const FAQ_ITEMS = [
  {
    q: '전기점검은 1년에 얼마이고 몇 번 방문하나요?',
    a: `정기 전기점검은 연 ${INSPECTION_PRICE_WON.toLocaleString('ko-KR')}원에 분기마다 1회씩 1년에 ${INSPECTION_VISITS_PER_TERM}회, 전기기사가 방문해 분전반·누전차단기·콘센트·조명을 점검하는 구독 서비스입니다. 방문 날짜는 분기마다 직접 고를 수 있습니다.`,
  },
  {
    q: '요금은 어떻게 책정되나요?',
    a: '접수는 무료예요. 수리 비용은 고장 원인과 필요한 자재에 따라 달라져 현장 확인 후 안내해요. 수리 대금은 현장에서 시공 업체와 직접 정산합니다.',
  },
  {
    q: '접수하면 얼마나 빨리 배정되나요?',
    a: '접수 시 선택한 긴급도에 따라 목표 응대 시간이 다릅니다. 초긴급은 1시간 내, 긴급은 2시간 내, 일반은 순차적으로 처리됩니다. 실제 배정은 담당 지역의 업체·전기기사 현황에 따라 달라질 수 있습니다.',
  },
  {
    q: '긴급도는 어떻게 구분되나요?',
    a: '초긴급(정전·누전 등 즉시 위험)·긴급·일반 3단계로 접수 시 직접 선택합니다.',
  },
  {
    q: '누전인지 어떻게 알 수 있나요?',
    a: '두꺼비집(차단기)이 자꾸 내려가거나, 콘센트·스위치에서 타는 냄새가 나거나, 벽·수도꼭지를 만졌을 때 찌릿한 느낌이 들면 누전일 수 있습니다. 누전은 감전·화재로 이어질 수 있으니 그대로 두지 마시고 바로 접수해 주세요.',
  },
  {
    q: '서비스 가능 지역은 어디인가요?',
    a: '송파·하남·성남·경기 광주·분당·위례를 중심으로 운영하며 전국 시/도·시/군/구 단위로 접수 가능합니다. 실제 배정은 등록된 업체·전기기사 현황에 따라 다르며, 담당 업체가 없는 지역은 관리자가 확인 후 안내합니다.',
  },
  {
    q: '어떤 업체와 전기기사가 방문하나요?',
    a: '관리자 승인을 거친 업체와 전기기사를 연결해 드려요. 전기기사는 근로확인서 전자 서명도 완료해야 배정 대상이 됩니다.',
  },
  {
    q: '진행 상황은 어떻게 확인하나요?',
    a: '접수 시 등록한 전화번호로 접수 내역 조회에서 확인할 수 있습니다. 진행 중인 건은 15초마다 자동으로 갱신됩니다.',
  },
  {
    q: '완료 후 후기는 어떻게 남기나요?',
    a: '완료 처리되면 문자로 만족도 조사 링크가 발송되며, 별점과 선택 후기를 1회 제출할 수 있습니다.',
  },
] as const;

export default function Home() {
  return (
    <main className={styles.page}>
      {/* 구조화 데이터 — 화면의 절차 4단계·FAQ 9문답과 같은 배열을 넘긴다(보이지 않는 내용을 마크업하지 않는다) */}
      <JsonLd data={getWebPageGraph({ path: '/', name: '전기아저씨 — 정기 전기점검 · 전기 고장 출동 접수', dateModified: PAGE_UPDATED.home })} />
      <JsonLd data={getProcessListSchema('전기 고장 접수 처리 절차', PROCESS_STEPS)} />
      <JsonLd data={getFaqPageSchema(FAQ_ITEMS)} />
      <div className={styles.container}>
        <header className={styles.header}>
          <Link href="/" aria-label="전기아저씨 홈"><BrandLogo size="md" /></Link>
          <nav aria-label="메인 메뉴" className={styles.headerNav}>
            <Link href="#process" className={styles.desktopLink}>이용 방법</Link>
            <Link href="/inspection" className={styles.desktopLink}>전기점검</Link>
            <Link href="/lookup">접수 내역 조회</Link>
            <Link href="/login" className={styles.desktopLink}>업체 · 전기기사 로그인</Link>
          </nav>
        </header>

        <div className={styles.hero}>
          <section aria-labelledby="home-title" className={styles.intro}>
            <div className={styles.heroHeading}>
              <div>
                <p className={styles.eyebrow}>정기 전기점검 · 1년 {INSPECTION_PRICE_WON.toLocaleString('ko-KR')}원</p>
                <h1 id="home-title" className={styles.title}>
                  <span>전기점검 하러,</span>
                  <span>아저씨가 갑니다</span>
                </h1>
              </div>
              <Image
                src="/brand/ajeossi-hero.webp"
                alt="손을 흔드는 전기아저씨 마스코트 — 안전모를 쓰고 공구를 든 전기기사"
                width={436}
                height={689}
                sizes="(min-width: 1024px) 148px, (min-width: 768px) 88px, (min-width: 448px) 180px, calc(44vw - 17.6px)"
                preload
                className={styles.character}
              />
            </div>
            <p className={styles.lead}>분기마다 한 번, 전기기사가 찾아가 <span className={styles.keepWide}>분전반·차단기·콘센트를</span> <span>살펴 드려요.</span></p>
            <div className={styles.heroAction}>
              <Link href="/inspection" className={styles.primaryLink}>전기점검 신청하기 <span aria-hidden="true">↗</span></Link>
              <Link href="/request/new" className={styles.secondaryLink}>전기 수리 요청하기 <span aria-hidden="true">→</span></Link>
            </div>
            <p className={styles.priceNote}><CheckIcon className="h-4 w-4 shrink-0" />1년 {INSPECTION_PRICE_WON.toLocaleString('ko-KR')}원 · 연 {INSPECTION_VISITS_PER_TERM}회 방문 · 날짜는 직접 선택</p>
          </section>

          <section aria-labelledby="symptom-title" className={styles.symptoms}>
            <h2 id="symptom-title">전기가 고장나면, 아저씨가 갑니다</h2>
            <p className={styles.sectionDescription}>이미 고장이 났다면 증상을 골라 무료로 접수하세요. 가까운 출동 업체를 연결해 드려요.</p>
            <div className={styles.symptomGrid}>
              {SYMPTOM_ITEMS.map((symptom) => (
                <Link key={symptom.key} href={`/request/new?symptom=${symptom.key}`} className={styles.symptomLink}>
                  <HomeSymptomIcon symptom={symptom.key} className={styles.symptomIcon} />
                  <span>{symptom.label}</span>
                </Link>
              ))}
            </div>
            <Link href="/request/new" className={styles.otherSymptom}>다른 증상이거나 잘 모르겠어요 <span aria-hidden="true">→</span></Link>
          </section>
        </div>

        <section aria-label="접수와 비용 안내" className={styles.serviceNotes}>
          <div><h2>접수는 무료예요</h2><p>글이나 음성으로 고장 내용을 남겨 주세요.</p></div>
          <div><h2>수리비는 현장에서 안내해요</h2><p>고장 원인과 자재에 따라 비용이 달라져요.</p></div>
          <div><h2>승인된 업체를 연결해요</h2><p>지역별 출동 가능 여부를 확인해 배정해요.</p></div>
        </section>

        {/* 정기 전기점검 — 고장 접수의 반대편 상품(사고 전 예방). 홈에서 한 번은 만나게 한다. */}
        <section aria-labelledby="inspection-title" className={styles.inspectionPromo}>
          <div>
            <p className={styles.eyebrow}>고장 나기 전에, 미리 점검</p>
            <h2 id="inspection-title">1년에 {INSPECTION_PRICE_WON.toLocaleString('ko-KR')}원, 분기마다 전기를 봐 드려요</h2>
            <p>
              연회비만 내시면 전기기사가 3개월에 한 번씩 찾아가 분전반·누전차단기·콘센트·조명을
              점검해요. 방문 날짜는 분기마다 직접 고르시면 돼요.
            </p>
          </div>
          <dl className={styles.inspectionFacts}>
            <div><dt>연회비</dt><dd>{INSPECTION_PRICE_WON.toLocaleString('ko-KR')}원</dd></div>
            <div><dt>방문 횟수</dt><dd>연 {INSPECTION_VISITS_PER_TERM}회</dd></div>
            <div><dt>방문 주기</dt><dd>분기당 1회</dd></div>
          </dl>
          <Link href="/inspection" className={styles.textLink}>정기 전기점검 자세히 보기 <span aria-hidden="true">→</span></Link>
        </section>

        <section aria-labelledby="areas-title" className={styles.section}>
          <div className={styles.sectionHeading}>
            <h2 id="areas-title">우리 동네 전기수리 출동 안내</h2>
            <Link href={AREAS_PATH} className={styles.textLink}>전체 지역 <span aria-hidden="true">→</span></Link>
          </div>
          <p className={styles.sectionDescription}>
            송파·하남·성남·경기 광주·분당·위례를 중심으로 운영해요. 누전 점검, 차단기·콘센트·조명 교체가
            필요하면 지역별 접수 방법과 비용 안내를 확인하세요.
          </p>
          <ul className={styles.areaGrid}>
            {PRIORITY_AREA_LINKS.map((area) => (
              <li key={area.key}>
                <Link href={area.path} className={styles.guideCard}>
                  <strong>{area.name} 전기수리</strong>
                  <span>{area.detail}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section id="process" aria-labelledby="process-title" className={styles.section}>
          <div className={styles.sectionHeading}>
            <h2 id="process-title">접수 후에는 이렇게 진행돼요</h2>
            <Link href="/lookup" className={styles.textLink}>내 접수 확인 <span aria-hidden="true">→</span></Link>
          </div>
          <ol className={styles.processList}>
            {PROCESS_STEPS.map((step, index) => (
              <li key={step.title}>
                <span className={styles.stepNumber} aria-hidden="true">0{index + 1}</span>
                <div><h3>{step.title}</h3><p>{step.desc}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="leak-title" className={styles.leakSection}>
          <div>
            <p className={styles.leakEyebrow}><AlertIcon className="h-4 w-4" />이런 증상도 확인해 주세요</p>
            <h2 id="leak-title">혹시 누전일 수 있어요</h2>
            <p className={styles.sectionDescription}>누전은 감전·화재로 이어질 수 있어요.</p>
          </div>
          <div>
            <ul className={styles.leakSigns}>{LEAK_SIGNS.map((sign) => <li key={sign}>{sign}</li>)}</ul>
            <Link href="/guide/gingeup-nujeon" className={styles.textLink}>누전 신호별 대처법 자세히 보기 <span aria-hidden="true">→</span></Link>
            <p className={styles.safetyNote}>위 증상이 있다면 두꺼비집을 내려 두시고, 젖은 손으로 콘센트·스위치를 만지지 마세요.</p>
            <Link href={`/request/new?symptom=${LEAK_SYMPTOM.key}`} className={styles.textLink}>누전 의심 접수하기 <span aria-hidden="true">→</span></Link>
          </div>
        </section>

        <section aria-labelledby="guide-title" className={styles.section}>
          <div className={styles.sectionHeading}>
            <h2 id="guide-title">부르기 전에 1분, 전기 상식</h2>
            <Link href="/guide" className={styles.textLink}>전체 보기 <span aria-hidden="true">→</span></Link>
          </div>
          <p className={styles.sectionDescription}>별것 아닌 원인으로 출장비를 내지 않도록, 증상별 확인 순서와 안전 기준을 정리했어요.</p>
          <ul className={styles.guideGrid}>
            {GUIDES.filter((g) => g.featured).map((g) => (
              <li key={g.slug}>
                <Link href={`/guide/${g.slug}`} className={styles.guideCard}>
                  <span className={styles.guideCategory}>{g.short}</span>
                  <strong>{g.title}</strong>
                  <span>{g.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <ReviewSection />

        <section aria-labelledby="faq-title" className={`${styles.section} ${styles.faqSection}`}>
          <div><h2 id="faq-title">자주 묻는 질문</h2><p className={styles.sectionDescription}>접수 전에 궁금한 점을 확인해 보세요.</p></div>
          <div className={styles.faqList}>
            {FAQ_ITEMS.map((item) => (
              <details key={item.q}>
                <summary>{item.q}<span className={styles.faqToggle} aria-hidden="true" /></summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <div className={styles.partnerLink}><span>전기아저씨와 함께 일하고 계신가요?</span><Link href="/login">업체 · 전기기사 로그인 <span aria-hidden="true">→</span></Link></div>
      </div>

      {/* 전기점검 첫 방문 팝업 — 홈에만 단다. 가이드·지역 페이지는 검색 유입이 바로 떨어지는
          자리라 팝업이 침입형 간지 광고로 잡힐 위험이 크다. 본문은 클라이언트에서 지연 렌더되므로
          서버 HTML·크롤러가 보는 문서에는 들어가지 않는다. */}
      <InspectionPromoDialog />
    </main>
  );
}
