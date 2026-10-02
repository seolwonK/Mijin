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
import {
  INSPECTION_CHECKS_PER_YEAR,
  INSPECTION_MIN_MONTHLY_WON,
  INSPECTION_PRICING,
  INSPECTION_TERMS,
  planYears,
} from '@/lib/inspection';

// title·description 은 루트 기본값을 그대로 쓴다. canonical 만 정식 도메인의 '/' 로 고정(CloudType 원본 호스트 대비).
export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

const PROCESS_STEPS = [
  { title: '고장 내용 접수', desc: '글이나 음성으로 증상과 주소를 남겨 주세요.' },
  { title: '현장 방문·수리', desc: '업체가 접수를 수락하면 출동해요. 비용은 현장 확인 후 안내해요.' },
  { title: '완료 확인', desc: '처리 결과는 접수 내역에서 확인할 수 있어요.' },
] as const;

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

// 번개 이모지(⚡) 대신 쓰는 브랜드 마크 — 네모 테두리 안에 "일렉트릭"(사용자 요청 2026-10-02).
const ElectricTag = () => <span className={styles.electricTag}>일렉트릭</span>;

// 첫 화면 가격표 아래의 "무엇을 받나" — 랜딩(/inspection)의 약속과 같은 범위만 말한다.
const INSPECTION_INCLUDES = [
  `1년에 ${INSPECTION_CHECKS_PER_YEAR}회 전기점검`,
  '분전반·누전차단기·콘센트·조명을 함께 점검해요',
  '유·무선 check 후 전기기사가 방문',
] as const;

const INSPECTION_STEPS = [
  { title: '구독 신청', desc: '2년·1년 약정 중 고르고 첫 점검 날짜를 정해요. 자동이체를 신청해요.' },
  { title: '유·무선 check', desc: '고른 날짜·시간대에 전기아저씨가 check해요.' },
  { title: '필요하면 방문 점검', desc: '유·무선 check 후 필요하다고 판단되면 전기기사가 직접 찾아가 점검해요.' },
] as const;

const INSPECTION_CHECKS = ['분전반(두꺼비집)', '누전차단기', '콘센트·스위치', '조명·배선'] as const;

const LEAK_SIGNS = [
  '두꺼비집(차단기)이 자꾸 내려가요',
  '콘센트·스위치에서 타는 냄새가 나요',
  '벽이나 수도꼭지를 만지면 찌릿해요',
  '전기요금이 갑자기 크게 늘었어요',
] as const;

const FAQ_ITEMS = [
  {
    q: '전기점검은 얼마이고 1년에 몇 번 받나요?',
    a: `정기 전기점검은 월 ${INSPECTION_PRICING.TWO_YEAR.monthlyWon.toLocaleString('ko-KR')}원(2년 약정)·${INSPECTION_PRICING.ONE_YEAR.monthlyWon.toLocaleString('ko-KR')}원(1년 약정)이며 VAT 포함, 매월 자동이체로 내는 구독 서비스입니다. 1년에 ${INSPECTION_CHECKS_PER_YEAR}회, 원하는 날짜에 전화로 분전반·누전차단기·콘센트·조명 상태를 점검합니다. 모든 회차에 방문하지는 않고, 필요하다고 판단되면 전기기사가 방문해 점검합니다.`,
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
    a: '서울·경기 전지역에서 운영하며 전국 시/도·시/군/구 단위로 접수 가능합니다. 실제 배정은 등록된 업체·전기기사 현황에 따라 다르며, 담당 업체가 없는 지역은 관리자가 확인 후 안내합니다.',
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
      {/* 구조화 데이터 — 화면의 절차 3단계·FAQ 7문답과 같은 배열을 넘긴다(보이지 않는 내용을 마크업하지 않는다) */}
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
                <p className={styles.eyebrow}>정기 전기점검 · 월 {INSPECTION_MIN_MONTHLY_WON.toLocaleString('ko-KR')}원부터</p>
                <h1 id="home-title" className={styles.title}>
                  {/* 마크를 윗줄에 따로 둔다 — 한 줄로 이으면 모바일에서 마스코트 그림 뒤로 넘친다. */}
                  <span><ElectricTag /></span>
                  <span>전기구독 하세요</span>
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
            <p className={styles.lead}>
              <span>내 가정, 내 가족</span>
              <span>전기안전은</span>
              <span>내가 지킨다</span>
            </p>
            <div className={styles.heroAction}>
              <Link href="/inspection/apply" className={styles.primaryLink}><span><ElectricTag />전기구독 신청하기</span> <span aria-hidden="true">↗</span></Link>
              <Link href="#inspection-how" className={`${styles.secondaryLink} ${styles.desktopOnly}`}>어떻게 점검하나요? <span aria-hidden="true">↓</span></Link>
            </div>
          </section>

          {/* 첫 화면 가격표 — 들어오자마자 요금과 신청 버튼이 함께 보이게 한다(사용자 요청 2026-09-28).
              요금제별 버튼은 신청서에 그 요금제를 미리 골라 둔다(?term=). */}
          <section aria-labelledby="pricing-title" className={styles.pricing}>
            <div className={styles.pricingHead}>
              <h2 id="pricing-title"><ElectricTag />전기구독료</h2>
            </div>
            <ul className={styles.planList}>
              {INSPECTION_TERMS.map((term) => {
                const p = INSPECTION_PRICING[term];
                const featured = term === 'TWO_YEAR';
                return (
                  <li key={term} className={featured ? `${styles.plan} ${styles.planFeatured}` : styles.plan}>
                    {/* 요금제 이름·추천 배지 없이 월 요금과 약정 조건만 보인다(사용자 요청 2026-09-29). */}
                    <p className={styles.planPrice}><span>월</span> {won(p.monthlyWon)}<small>(VAT 포함)</small></p>
                    <p className={styles.planTerm}>({planYears(p.months)}년 자동이체 약정시)</p>
                    <Link
                      href={`/inspection/apply?term=${term}`}
                      className={featured ? styles.planCtaPrimary : styles.planCta}
                      aria-label={`월 ${won(p.monthlyWon)} ${planYears(p.months)}년 약정 구독하기`}
                    >
                      구독하기 <span aria-hidden="true">→</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <ul className={styles.includeList}>
              {INSPECTION_INCLUDES.map((line) => (
                <li key={line}><CheckIcon className="h-4 w-4 shrink-0" />{line}</li>
              ))}
            </ul>
          </section>
        </div>

        {/* 전기점검 진행 방식 — 가격표 바로 다음에 "무엇을 받는가"를 세 단계로 보여 준다. */}
        <section id="inspection-how" aria-labelledby="inspection-title" className={styles.inspectionPromo}>
          <div className={styles.inspectionIntro}>
            <p className={styles.eyebrow}>고장 나기 전에, 미리 점검</p>
            <h2 id="inspection-title">1년에 {INSPECTION_CHECKS_PER_YEAR}번이나 <ElectricTag />check check</h2>
            <p>(유·무선 check 후 필요 판단시 방문)</p>
            <ul className={styles.checkChips} aria-label="점검 항목">
              {INSPECTION_CHECKS.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <ol className={styles.inspectionSteps}>
            {INSPECTION_STEPS.map((step, index) => (
              <li key={step.title}>
                <span className={styles.stepNumber} aria-hidden="true">0{index + 1}</span>
                <div><h3>{step.title}</h3><p>{step.desc}</p></div>
              </li>
            ))}
          </ol>
          <div className={styles.inspectionCta}>
            <Link href="/inspection/apply" className={styles.primaryLink}>
              월 {won(INSPECTION_MIN_MONTHLY_WON)}부터 전기점검 구독하기 <span aria-hidden="true">↗</span>
            </Link>
            <Link href="/inspection" className={styles.textLink}>정기 전기점검 자세히 보기 <span aria-hidden="true">→</span></Link>
          </div>
        </section>

        {/* 고장 수리 접수 — 홈의 서브 상품. 전기점검 다음 구획으로 내렸다(사용자 요청 2026-09-28). */}
        <section aria-labelledby="symptom-title" className={`${styles.section} ${styles.symptoms}`}>
          <h2 id="symptom-title">전기가 고장나면, 아저씨가 갑니다</h2>
          <p className={styles.sectionDescription}>이미 고장이 났다면 증상을 골라 접수하세요.</p>
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

        <section aria-labelledby="areas-title" className={styles.section}>
          <div className={styles.sectionHeading}>
            <h2 id="areas-title">우리 동네 전기수리 출동 안내</h2>
            <Link href={AREAS_PATH} className={styles.textLink}>전체 지역 <span aria-hidden="true">→</span></Link>
          </div>
          <p className={styles.sectionDescription}>
            서울·경기 전지역에서 운영해요. 누전 점검, 차단기·콘센트·조명 교체가
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
    </main>
  );
}
