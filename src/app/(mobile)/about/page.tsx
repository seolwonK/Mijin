import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import PageHeader from '@/components/PageHeader';
import Surface from '@/components/Surface';
import { CompanyInfoBlock } from '@/components/LegalDoc';
import { buttonClasses } from '@/components/Button';
import { BoltIcon, BuildingIcon, WrenchIcon, ShieldIcon, ClipboardIcon } from '@/components/icons';
import { COMPANY } from '@/lib/company';

export const metadata: Metadata = {
  title: `서비스 소개 — ${COMPANY.name}`,
  description: `${COMPANY.name}는 전기 고장 접수부터 가까운 출동 업체·전기기사 연결까지 돕는 전기 출동 중개 서비스입니다.`,
};

// 서비스 소개 페이지 — PG(NHN KCP 본인인증) 심사 요건 "어떤 서비스를 운영하는지 확인할 수 있는
// 소개 페이지". 랜딩이 고객 전환용이라면 이 페이지는 "회사가 무엇을 하는 곳인지"를 제3자(심사
// 담당자)가 1분 안에 파악하도록 사실 위주로 쓴다 — 서비스 성격(중개), 이용 대상 3종, 흐름,
// 요금·결제 구조(앱 내 결제 없음), 본인인증을 쓰는 이유와 위치, 사업자 정보.
const AUDIENCES = [
  {
    Icon: BoltIcon,
    title: '고객',
    desc: '전기 고장을 음성·텍스트·사진으로 접수하고, 전화번호로 진행 상황을 조회합니다. 별도 가입 없이 이용할 수 있습니다.',
  },
  {
    Icon: BuildingIcon,
    title: '출동 업체',
    desc: '전기공사업 등록 업체가 가입·승인 후 담당 지역의 접수 건을 배정받아 출동합니다.',
  },
  {
    Icon: WrenchIcon,
    title: '전기기사',
    desc: '개인 전기기사가 가입·본인인증·근로확인 서명을 마치면 배정 대상이 됩니다.',
  },
] as const;

const FLOW = [
  { n: 1, title: '접수', desc: '고객이 고장 내용·긴급도·위치를 남깁니다.' },
  { n: 2, title: '배정', desc: '관리자 확인 또는 자동배정으로 가까운 업체·전기기사를 연결합니다.' },
  { n: 3, title: '출동·수리', desc: '배정된 담당자가 현장으로 출동해 수리합니다.' },
  { n: 4, title: '완료·후기', desc: '완료 처리 후 고객에게 만족도 조사 문자가 발송됩니다.' },
] as const;

export default function AboutPage() {
  return (
    <main className="min-h-screen pb-28 md:pb-12">
      <PageHeader title="서비스 소개" back="/" />

      <div className="mx-auto w-full max-w-2xl px-5">
        <section className="mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-50 via-white to-brand-100/50 md:mt-6">
          <div className="flex flex-col md:flex-row md:items-center">
            <div className="px-6 pt-6 pb-4 md:w-3/5 md:py-10">
              <p className="text-xs font-bold text-brand-600">전기 출동 중개 플랫폼</p>
              <h2 className="mt-2 text-2xl leading-tight font-extrabold text-fg md:text-3xl">
                전기 고장을 접수하면
                <br />
                가까운 출동 업체를 연결합니다
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {COMPANY.name}는 정전·누전·콘센트·조명·차단기 등 생활 전기 고장을 접수받아, 등록된
                출동 업체와 전기기사에게 배정하는 온라인 중개 서비스입니다.
              </p>
            </div>
            <div className="flex justify-center px-5 pb-2 md:w-2/5 md:justify-end md:pb-0">
              <Image
                src="/brand/ajeossi-working.webp"
                alt=""
                width={563}
                height={688}
                className="h-44 w-auto md:h-60"
              />
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-fg">무엇을 하는 서비스인가요</h2>
          <div className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-700">
            <p>
              {COMPANY.name}는 고객과 전기 수리 업체·전기기사를 연결하는 <strong>중개 플랫폼</strong>
              입니다. 고객이 고장 내용을 남기면 관리자 확인 또는 자동배정을 거쳐 담당 지역의 업체나
              전기기사가 현장으로 출동합니다.
            </p>
            <p>
              수리 자체는 배정된 업체·전기기사가 수행하며, {COMPANY.name}는 접수·배정·진행 상황
              안내와 문자 알림을 제공합니다.
            </p>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-fg">누가 이용하나요</h2>
          <div className="mt-4 space-y-3">
            {AUDIENCES.map((a) => (
              <Surface key={a.title} as="section" className="flex gap-4 rounded-2xl p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-100">
                  <a.Icon className="h-5 w-5 text-brand-700" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-fg">{a.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted">{a.desc}</p>
                </div>
              </Surface>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-fg">이용 흐름</h2>
          <ol className="mt-4">
            {FLOW.map((step, i) => (
              <li key={step.n} className="relative flex gap-4 pb-5 last:pb-0">
                {i < FLOW.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-9 left-[17px] h-[calc(100%-1.25rem)] w-px bg-neutral-200"
                  />
                )}
                <span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                  {step.n}
                </span>
                <div className="flex-1 pt-1">
                  <p className="font-bold text-fg">{step.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-fg">요금과 결제</h2>
          <ul className="mt-3 space-y-2 rounded-2xl bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-700">
            <li className="flex gap-2">
              <ClipboardIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <span>고장 접수와 조회는 <strong>무료</strong>입니다.</span>
            </li>
            <li className="flex gap-2">
              <ClipboardIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <span>
                서비스 내 온라인 결제나 고정 가격표는 없습니다. 수리 비용은 고장 원인과 자재에 따라
                현장 확인 후 안내되며, <strong>시공 업체·전기기사와 현장에서 직접 정산</strong>합니다.
              </span>
            </li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-fg">휴대폰 본인인증 안내</h2>
          <div className="mt-3 flex gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
            <ShieldIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
            <div className="text-sm leading-relaxed text-neutral-700">
              <p>
                전기기사 가입 시 <strong>휴대폰 본인인증(통신사 본인확인)</strong>을 진행합니다.
                고객의 집·사업장에 직접 방문하는 전기기사의 명의를 확인하고 허위·중복 가입을
                막기 위한 절차입니다.
              </p>
              <p className="mt-2">
                인증은{' '}
                <Link href="/tech/signup" className="font-semibold text-brand-700 underline">
                  전기기사 가입 페이지
                </Link>
                에서 이루어지며, 인증 결과의 처리 기준은{' '}
                <Link href="/privacy" className="font-semibold text-brand-700 underline">
                  개인정보처리방침
                </Link>
                에 따릅니다.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-fg">사업자 정보</h2>
          <div className="mt-3">
            <CompanyInfoBlock />
          </div>
        </section>

        <div className="mt-8 flex flex-col gap-3 md:flex-row">
          <Link href="/request/new" className={buttonClasses('primary', 'lg', 'w-full md:w-auto')}>
            <BoltIcon className="h-4 w-4" />
            고장 접수하기
          </Link>
          <Link href="/terms" className={buttonClasses('secondary', 'lg', 'w-full md:w-auto')}>
            이용약관 보기
          </Link>
        </div>
      </div>
    </main>
  );
}
