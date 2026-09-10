import styles from '@/components/portal.module.css';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { COMPANY } from '@/lib/company';
export default function SupportPage() {
  return (
    <main className={`${styles.frame} min-h-screen bg-surface`}>
      <PageHeader title="도움 및 문의" back="/login" />
      <div className="mx-auto max-w-2xl space-y-6 p-4 pb-10">
        <section className="rounded-xl border border-border bg-white p-5">
          <h2 className="text-lg font-bold">관리자에게 문의하기</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            가입한 이름 또는 업체명과 문의 내용을 준비해 주세요. 통화가 어려우면
            잠시 후 다시 연락해 주세요.
          </p>
          <a
            href={`tel:${COMPANY.tel.replace(/-/g, '')}`}
            className="mt-4 inline-flex min-h-12 items-center rounded-lg bg-brand-700 px-5 font-semibold text-white"
          >
            전화 문의 {COMPANY.tel}
          </a>
        </section>
        <section id="account" className="space-y-2">
          <h2 className="font-bold">아이디·비밀번호를 잊었어요</h2>
          <p className="text-sm leading-6">
            관리자에게 계정 확인 또는 비밀번호 재설정을 요청해 주세요. 가입한
            이름·업체명과 등록된 연락처를 기준으로 본인 확인을 진행합니다.
            비밀번호 자체를 전달할 필요는 없습니다.
          </p>
        </section>
        <section id="approval" className="space-y-2">
          <h2 className="font-bold">업체 가입 승인·서류 보완</h2>
          <p className="text-sm leading-6">
            사업자등록증과 전기공사업 등록증을 확인한 뒤 가입을 승인합니다.
            로그인했을 때 승인 대기·거절 안내가 나오면 관리자에게 심사 상태와
            보완할 서류를 확인해 주세요.
          </p>
          <Link
            href="/partner/login"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 underline"
          >
            업체 로그인에서 승인 상태 확인
          </Link>
        </section>
        <section className="space-y-2">
          <h2 className="font-bold">배정이 오지 않아요</h2>
          <p className="text-sm leading-6">
            내 정보에서 ‘새 배정 받기’가 켜져 있는지, 서비스 가능 지역이 맞는지
            확인하고 저장해 주세요. 전기기사는 근로확인서 서명을 마쳐야 배정을
            받을 수 있습니다.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="font-bold">근로확인서 내용이 달라요</h2>
          <p className="text-sm leading-6">
            서명 전에 관리자에게 근무조건 정정을 요청해 주세요. 서명을 완료한
            문서는 직접 수정할 수 없습니다. 완료된 문서는 근로확인서 화면에서
            인쇄하거나 PDF로 저장할 수 있습니다.
          </p>
        </section>
        <section id="notifications" className="space-y-2">
          <h2 className="font-bold">새 배정 알림이 차단되었어요</h2>
          <p className="text-sm leading-6">
            브라우저 주소창의 사이트 설정에서 이 사이트의 알림 권한을 허용한 뒤
            포털을 다시 열어 주세요. 기기의 알림·집중 모드 설정도 확인해 주세요.
            브라우저에 알림 설정이 없다면 포털의 응답 대기 목록을 확인할 수
            있습니다.
          </p>
        </section>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/partner"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 underline"
          >
            업체 포털
          </Link>
          <Link
            href="/tech"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 underline"
          >
            전기기사 포털
          </Link>
        </div>
      </div>
    </main>
  );
}
