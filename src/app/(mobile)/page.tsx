import Link from 'next/link';
import Image from 'next/image';
import Surface from '@/components/Surface';
import TrackStepper from '@/components/TrackStepper';
import SectionCta from '@/components/SectionCta';
import ReviewSection from '@/components/ReviewSection';
import BrandLogo from '@/components/BrandLogo';
import { buttonClasses } from '@/components/Button';
import { UrgencyPill } from '@/components/StatusPill';
import { BoltIcon, ClipboardIcon, ShieldIcon, MapPinIcon, CheckIcon, AlertIcon } from '@/components/icons';
import { SYMPTOM_ITEMS, LEAK_SYMPTOM } from '@/lib/symptoms';

// 롱폼 증축 섹션(§2~§7) 데이터 — 카피 방향은 .omc/research/longform/gate/section-plan.md 승인안 승계.
// §2·§3의 시각 자료는 Phase 2에서 캐릭터 브랜드로 전환하며 이미지 필드를 걷어냈다(아래 주석 참조).
const PROCESS_STEPS = [
  { n: 1, title: '접수', desc: '음성 또는 텍스트로 고장 내용을 30초 만에 남겨요.' },
  { n: 2, title: '배정', desc: '관리자 확인 또는 자동배정으로 담당자를 연결해요.' },
  { n: 3, title: '출동', desc: '배정된 업체·전기기사가 현장으로 출동해요.' },
  { n: 4, title: '완료', desc: '수리가 끝나면 처리 완료로 표시돼요.' },
] as const;

// 6칸은 예시 카테고리 — ServiceRequest.description은 자유 텍스트라 이 목록으로 한정되지 않는다(카피에서도 단정 금지).
// §3.5 누전 안내 — 위험 신호 체크리스트. 생활 언어("두꺼비집"·"찌릿")로 쓴다.
const LEAK_SIGNS = [
  '두꺼비집(차단기)이 자꾸 내려가요',
  '콘센트·스위치에서 타는 냄새가 나요',
  '벽이나 수도꼭지를 만지면 찌릿해요',
  '전기요금이 갑자기 크게 늘었어요',
] as const;

const SCOPE_ITEMS = [
  { title: '콘센트' },
  { title: '배선' },
  { title: '조명' },
  { title: '차단기' },
  { title: '누전' },
  { title: '설비' },
] as const;

// section-plan.md §2 FAQ 초안 8개 중 #5(취소/변경)는 게이트 결정으로 제외 — 공개 채널 미확정.
const FAQ_ITEMS = [
  {
    q: '요금은 어떻게 책정되나요?',
    a: '앱 내 온라인 결제·가격표는 없습니다. 고장 원인과 자재에 따라 비용이 달라져 현장 확인 후 안내되며, 정산은 현장에서 직접 이루어집니다. 접수 자체는 무료입니다.',
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
    a: '전국 시/도·시/군/구 단위로 접수 가능합니다. 다만 지역별 실제 배정은 등록된 업체·전기기사 현황에 따라 다르며, 담당 업체가 없는 지역은 관리자가 직접 확인 후 연결합니다.',
  },
  {
    q: '전기기사·업체는 어떻게 신뢰할 수 있나요?',
    a: '업체·전기기사 모두 관리자 승인을 거친 후에만 활동하며, 전기기사는 추가로 근로확인서에 전자 서명을 완료해야 배정 대상이 됩니다.',
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

// "전기아저씨" 캐릭터 히어로 재구축(redesign/ajeossi, Phase 2 선발대 — G3 게이트 승인 전 후보안).
// 이전 "신뢰 블루 프로" 단계의 사진 히어로(hero-main.webp, 배전반+블루 케이블)를 캐릭터
// 중심으로 교체했다 — G0 브리프(.omc/research/ajeossi/g0-brief.md §5) "고객 표면은 전신·맥락
// 포즈로 크게 등장" 원칙. 히어로=인사(ajeossi-hero.webp) · §4 신뢰=작업중(ajeossi-working.webp)
// · §7 최종CTA=완료 엄지척(ajeossi-complete.webp), 세 포즈를 겹치지 않게 배치해 페이지 전체가
// 한 캐릭터의 자연스러운 등장 흐름처럼 읽히게 했다.
//
// 기존 Higgsfield 이미지(공정 아이콘 4·범위 아이콘 6·밴드 사진 2, 총 12개, public/images/landing/)는
// 전량 미사용 처리했다 — 공정/범위 아이콘은 구 "블루 프로" 라인아이콘 문법(얇은 스트로크+시안
// 듀오톤)이라 새 캐릭터의 굵은 라인+플랫 컬러 언어와 부딪히고, 밴드 사진 2장은 전기 업종과
// 무관한 무드 스톡컷이라 어느 쪽으로도 톤이 안 맞았다 — 세 가지 이상의 이미지 문법이 한 화면에
// 공존하는 것 자체가 이전 3회 개편의 실패축(디테일·질감 부재/브랜드 개성 부재)을 재현하므로
// files 자체를 제거했다(ralplan 2-1 "미사용 파일 제거").
//
// §2 프로세스는 카드 그리드 대신 연결선이 있는 세로 타임라인으로, §3 서비스 범위는 아이콘
// 대신 칩 태그로 바꿔 §5(리뷰)·§6(아코디언)까지 포함해 화면 전체의 구조 리듬이 실제로
// 갈리도록 했다(원칙 1 "구조 획일성" — 이전 개편은 어디든 같은 카드 스택이었다).
//
// 타이포는 G0 승인 스케일(전/후: 13px→text-xs 12px, 15px→text-sm 14px)로 정리했고, 히어로
// h1은 md:text-4xl(36px) 자리 대신 새 스케일의 3xl→5xl(34px→56px) 자리로 올렸다(디스플레이는
// 더 크고 타이트하게). CTA 버튼은 이제 흰 배경 하드코딩 대신 Button.tsx의 buttonClasses()를
// 그대로 쓴다 — 히어로 배경이 사진 오버레이에서 밝은 브랜드 틴트로 바뀌어 표준 primary
// 배색(brand-600 배경+흰 텍스트)이 그대로 맞기 때문(특수 케이스 코드 제거).
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col px-5 pb-28 md:items-center md:justify-center md:px-6 md:py-16">
      <div className="w-full md:max-w-2xl">
        <BrandLogo size="sm" />
      </div>

      {/* 긴급 배너 — FAQ에 이미 있는 "초긴급 1시간 내 응대 목표"를 첫 화면으로 끌어올린 것(새 약속 아님).
          긴급 상황 사용자가 첫 화면에서 바로 접수로 진입하는 지름길. */}
      <Link
        href="/request/new"
        className="mt-2 flex w-full items-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 transition-colors ease-brand duration-brand-base hover:bg-red-100/70 md:mt-3 md:max-w-2xl"
      >
        <span aria-hidden="true">🚨</span>
        <span className="min-w-0 text-sm font-semibold text-red-700">
          정전·타는 냄새는 <strong className="font-extrabold">초긴급 접수 시 1시간 내 응대</strong>가
          목표예요
        </span>
        <span className="ml-auto shrink-0 text-sm font-bold text-red-600">접수 →</span>
      </Link>

      <section className="relative -mx-5 mt-1 w-[calc(100%+2.5rem)] overflow-hidden bg-gradient-to-br from-brand-50 via-white to-brand-100/50 md:mx-0 md:mt-3 md:w-full md:max-w-2xl md:rounded-3xl md:shadow-surface-lg">
        <div className="flex flex-col md:flex-row md:items-center">
          <div className="px-5 pt-6 pb-3 md:w-3/5 md:px-8 md:py-12">
            <p className="text-xs font-bold text-brand-600">가까운 출동 업체를 바로 연결해 드려요</p>
            <h1 className="mt-2 text-3xl leading-tight font-extrabold text-fg md:text-5xl">
              전기 고장?
              <br />
              아저씨가 갑니다
            </h1>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted md:max-w-sm md:text-base">
              정전·누전·긴급 수리까지 — 접수하시면 가까운 출동 업체를 빠르게 연결해 드립니다.
            </p>
            <Link href="/request/new" className={buttonClasses('primary', 'lg', 'mt-5 w-fit')}>
              <BoltIcon className="h-4 w-4" />
              고장 접수하기
            </Link>
          </div>
          <div className="flex justify-center px-5 pb-1 md:w-2/5 md:justify-end md:px-6 md:pb-0">
            <Image
              src="/brand/ajeossi-hero.webp"
              alt=""
              width={436}
              height={689}
              preload={true}
              className="h-52 w-auto md:h-72"
            />
          </div>
        </div>
      </section>

      {/* 증상 선택 CTA — "고장 접수하기"라는 추상 버튼을 못 찾는 사용자를 위해 자기 상황을 그대로
          고르게 한다. 누르면 접수 화면으로 이동하고 설명란만 프리필된다(긴급도 자동 지정 없음 —
          긴급도는 폼에서 고객이 직접 고른다). */}
      <Surface as="section" tint className="mt-3 w-full rounded-3xl p-5 md:mt-4 md:max-w-2xl md:p-7">
        <h2 className="text-lg font-bold text-fg md:text-xl">어떤 문제가 생겼나요?</h2>
        <p className="mt-1 text-sm text-muted">눌러 주시면 바로 접수 화면으로 이동해요.</p>
        <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-3">
          {SYMPTOM_ITEMS.map((s) => (
            <Link
              key={s.key}
              href={`/request/new?symptom=${s.key}`}
              className="flex min-h-[84px] flex-col justify-center gap-1.5 rounded-2xl border border-border bg-white p-3.5 shadow-surface-sm transition-colors ease-brand duration-brand-base hover:border-brand-300 active:bg-brand-50"
            >
              <Image src={s.icon} alt="" width={256} height={256} className="h-10 w-10" />
              <span className="text-sm leading-snug font-bold text-fg">{s.label}</span>
            </Link>
          ))}
          <Link
            href="/request/new"
            className="col-span-2 flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-300 bg-white p-3.5 text-sm font-bold text-muted transition-colors ease-brand duration-brand-base hover:border-brand-300 hover:text-fg md:col-span-3"
          >
            <span aria-hidden="true">🤔</span>잘 모르겠어요 — 그냥 접수할게요
          </Link>
        </div>
      </Surface>

      {/* CTA */}
      <div className="mt-3 flex w-full flex-col gap-3 md:mt-4 md:max-w-2xl md:flex-row md:gap-4">
        {/* 틴트는 위 증상 그리드(1차 액션 표면)로 이동 — 여기는 일반 표면으로 낮춘다. */}
        <Surface as="section" className="rounded-3xl md:flex-1">
          <Link
            href="/request/new"
            className="group flex items-center gap-4 p-5 text-left md:flex-col md:items-start md:gap-3 md:p-7"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-100">
              <BoltIcon className="h-6 w-6 text-brand-700" />
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-bold text-fg md:text-xl">
                고장 접수하기
              </span>
              <span className="mt-0.5 block text-sm text-muted">
                음성 또는 텍스트로, 1분이면 접수 완료
              </span>
            </span>
            <span className="ml-auto text-xl text-brand-400 transition-transform ease-brand duration-brand-base group-hover:translate-x-0.5 md:hidden">
              ›
            </span>
          </Link>
        </Surface>

        <Surface as="section" className="rounded-3xl md:flex-1">
          <Link
            href="/lookup"
            className="group flex items-center gap-4 p-5 text-left md:flex-col md:items-start md:gap-3 md:p-7"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-neutral-100">
              <ClipboardIcon className="h-6 w-6 text-muted" />
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-bold text-fg md:text-xl">
                접수 내역 조회
              </span>
              <span className="mt-0.5 block text-sm text-muted">
                전화번호로 진행 상황 확인
              </span>
            </span>
            <span className="ml-auto text-xl text-neutral-300 transition-transform ease-brand duration-brand-base group-hover:translate-x-0.5 md:hidden">
              ›
            </span>
          </Link>
        </Surface>
      </div>

      {/* 서비스 소개 — 처리 파이프라인 */}
      <Surface as="section" className="mt-3 rounded-3xl p-6 md:mt-4 md:max-w-2xl md:p-7">
        <p className="text-xs font-semibold text-muted">접수하면 이렇게 진행돼요</p>
        <div className="mt-4">
          <TrackStepper currentIndex={0} />
        </div>
        <div className="mt-5 flex flex-wrap gap-4">
          <UrgencyPill urgency="CRITICAL" />
          <UrgencyPill urgency="URGENT" />
          <UrgencyPill urgency="NORMAL" />
        </div>
      </Surface>

      {/* §2 프로세스 4단계 — 카드 그리드 대신 연결선 타임라인(§3 칩 그리드와 구조를 갈랐다) */}
      <section className="mt-8 w-full md:mt-10 md:max-w-2xl">
        <h2 className="text-2xl font-extrabold text-fg md:text-3xl">이렇게 진행돼요</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          접수부터 완료까지, 각 단계가 어떻게 이어지는지 미리 알려 드립니다.
        </p>
        <ol className="mt-6">
          {PROCESS_STEPS.map((step, i) => (
            <li key={step.n} className="relative flex gap-4 pb-6 last:pb-0">
              {i < PROCESS_STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute top-10 left-[19px] h-[calc(100%-1.5rem)] w-px bg-neutral-200"
                />
              )}
              <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                {step.n}
              </span>
              <div className="flex-1 pt-1.5">
                <p className="text-base font-bold text-fg">{step.title}</p>
                <p className="mt-1 text-sm text-muted">{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-2">
          <SectionCta />
        </div>
      </section>

      {/* §3 서비스 범위 — 칩 태그(아이콘 매칭 없이도 항목 나열이 깔끔하게 끝난다) */}
      <section className="mt-8 w-full md:mt-10 md:max-w-2xl">
        <h2 className="text-2xl font-extrabold text-fg md:text-3xl">어떤 고장이든 문의해 주세요</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          콘센트부터 배전반까지, 전기와 관련된 문제라면 접수 시 자유롭게 설명해 주세요.
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          {SCOPE_ITEMS.map((item) => (
            <span
              key={item.title}
              className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-fg shadow-surface-sm"
            >
              {item.title}
            </span>
          ))}
        </div>
      </section>

      {/* §3.5 누전 안내 — 정보를 주면서 자연스럽게 접수로 연결. 위험 신호라 red 액센트를 이 섹션에서만 쓴다. */}
      <section className="mt-8 w-full md:mt-10 md:max-w-2xl">
        <h2 className="text-2xl font-extrabold text-fg md:text-3xl">혹시 누전일 수 있어요</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          이런 신호가 보이면 미루지 마세요. 누전은 감전·화재로 이어질 수 있어요.
        </p>
        <ul className="mt-5 space-y-3 rounded-3xl border border-red-100 bg-red-50/60 p-5">
          {LEAK_SIGNS.map((sign) => (
            <li key={sign} className="flex gap-3">
              <AlertIcon className="h-5 w-5 shrink-0 text-red-500" />
              <span className="text-sm font-semibold text-fg">{sign}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          위 증상이 있다면 두꺼비집을 내려 두시고, 젖은 손으로 콘센트·스위치를 만지지 마세요.
        </p>
        <div className="mt-4">
          <Link
            href={`/request/new?symptom=${LEAK_SYMPTOM.key}`}
            className={buttonClasses('primary', 'md', 'w-full md:w-auto')}
          >
            <BoltIcon className="h-4 w-4" />
            누전 의심 접수하기
          </Link>
        </div>
      </section>

      {/* §4 신뢰 요소 — 밴드 사진 대신 작업중 포즈(ajeossi-working.webp) */}
      <section className="mt-8 w-full md:mt-10 md:max-w-2xl">
        <h2 className="text-2xl font-extrabold text-fg md:text-3xl">믿고 맡기세요</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          근로확인을 마친 전기기사와 관리자의 배정 확인을 거쳐 연결해 드립니다.
        </p>
        <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-center md:gap-8">
          <div className="mx-auto flex w-48 shrink-0 items-end justify-center rounded-3xl bg-gradient-to-b from-brand-50 to-white pt-4 md:mx-0 md:h-64 md:w-2/5">
            <Image
              src="/brand/ajeossi-working.webp"
              alt=""
              width={563}
              height={688}
              className="h-40 w-auto md:h-56"
            />
          </div>
          <ul className="space-y-3 md:flex-1">
            <li className="flex gap-3">
              <ShieldIcon className="h-5 w-5 shrink-0 text-brand-600" />
              <span className="text-sm text-fg">
                <strong className="font-bold">계약 전기기사</strong> — 근로확인 전자 서명을 완료한 전기기사만
                배정 대상이 됩니다.
              </span>
            </li>
            <li className="flex gap-3">
              <MapPinIcon className="h-5 w-5 shrink-0 text-brand-600" />
              <span className="text-sm text-fg">
                <strong className="font-bold">전국 지역 커버리지</strong> — 담당 업체가 없는 지역은 관리자가
                직접 확인 후 연결합니다.
              </span>
            </li>
            <li className="flex gap-3">
              <CheckIcon className="h-5 w-5 shrink-0 text-brand-600" />
              <span className="text-sm text-fg">
                <strong className="font-bold">관리자 배정 시스템</strong> — 업체·전기기사 모두 승인 절차를 거친
                후에만 배정 후보가 됩니다.
              </span>
            </li>
          </ul>
        </div>
        <div className="mt-5">
          <SectionCta />
        </div>
      </section>

      {/* §5 실설문 집계 후기 — 독립 async 데이터 경계, 임계 미만/조회 실패 시 미렌더 */}
      <ReviewSection />

      {/* §6 FAQ */}
      <section className="mt-8 w-full md:mt-10 md:max-w-2xl">
        <h2 className="text-2xl font-extrabold text-fg md:text-3xl">자주 묻는 질문</h2>
        <div className="mt-5 divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white shadow-surface-sm">
          {FAQ_ITEMS.map((item) => (
            <details key={item.q} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-fg [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="shrink-0 text-lg text-neutral-300 transition-transform ease-brand duration-brand-base group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* §7 최종 CTA — 완료 엄지척 포즈(ajeossi-complete.webp)로 마무리, 히어로와 같은 틴트 문법으로 페이지를 여닫는다 */}
      <section className="relative -mx-5 mt-8 w-[calc(100%+2.5rem)] overflow-hidden bg-gradient-to-b from-brand-50 to-white md:mx-0 md:mt-10 md:w-full md:max-w-2xl md:rounded-3xl md:shadow-surface-lg">
        <div className="flex flex-col items-center px-5 py-8 text-center md:py-12">
          <Image
            src="/brand/ajeossi-complete.webp"
            alt=""
            width={401}
            height={689}
            className="h-40 w-auto md:h-48"
          />
          <h2 className="mt-4 text-2xl font-extrabold text-fg md:text-3xl">전기 고장, 지금 접수하세요</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted md:max-w-sm">
            출동 가능한 업체를 바로 연결해 드립니다.
          </p>
          <Link href="/request/new" className={buttonClasses('primary', 'lg', 'mt-5 w-fit')}>
            <BoltIcon className="h-4 w-4" />
            고장 접수하기
          </Link>
        </div>
      </section>

      {/* 로그인 허브 */}
      <div className="mt-6 text-center md:mt-8">
        <Link
          href="/login"
          className="inline-block rounded-full px-4 py-2 text-sm font-medium text-muted transition-colors ease-brand duration-brand-base hover:bg-white hover:text-fg"
        >
          업체 · 전기기사 로그인 →
        </Link>
      </div>
    </main>
  );
}
