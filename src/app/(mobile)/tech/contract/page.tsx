'use client';

import { useEffect, useState } from 'react';
import PortalSupportLink from '@/components/PortalSupportLink';
import { readApiJson, requestError } from '@/lib/clientApi';
import { workHoursText } from '@/lib/contractDefaults';
import PageHeader from '@/components/PageHeader';
import { buttonClasses } from '@/components/Button';
import SignaturePad from '@/components/SignaturePad';
import { CheckIcon } from '@/components/icons';

const inputClass =
  'w-full rounded-xl border border-neutral-300 bg-white p-3 text-base text-fg placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none disabled:bg-neutral-100 disabled:text-muted';

const WAGE_TYPE_LABEL: Record<string, string> = {
  MONTHLY: '월급',
  DAILY: '일급',
  HOURLY: '시급',
};
const PAY_METHOD_LABEL: Record<string, string> = {
  BANK_TRANSFER: '예금통장 입금',
  DIRECT: '직접 지급',
};

type Contract = {
  updatedAt: string;
  confirmedAt: string | null;
  bonusExists: boolean;
  bonusAmount: number | null;
  otherPayExists: boolean;
  otherPayDesc: string | null;
  otherPayAmount: number | null;
  insuranceEmployment: boolean;
  insuranceAccident: boolean;
  insurancePension: boolean;
  insuranceHealth: boolean;
  annualLeaveNote: string | null;
  status: 'DRAFT' | 'SUBMITTED' | 'CONFIRMED';
  employmentType: 'DAILY' | 'PERMANENT';
  contractStartDate: string;
  contractEndDate: string | null;
  workLocation: string;
  jobDescription: string;
  workStartTime: string | null;
  workEndTime: string | null;
  breakStartTime: string | null;
  breakEndTime: string | null;
  hoursNote: string | null;
  workDays: string;
  weeklyHoliday: string | null;
  wageType: 'MONTHLY' | 'DAILY' | 'HOURLY' | null;
  wageAmount: number | null;
  payDate: string | null;
  payMethod: 'BANK_TRANSFER' | 'DIRECT' | null;
  workerAddress: string | null;
  workerSignatureName: string | null;
  workerSignatureDataUrl: string | null;
  signedAt: string | null;
  submittedAt: string | null;
};

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-1.5 sm:grid-cols-2 text-sm">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="font-medium text-fg sm:text-right">{value}</span>
    </div>
  );
}

export default function TechContractPage() {
  const [c, setC] = useState<Contract | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 편집 필드
  const [startDate, setStartDate] = useState('');
  const [workLocation, setWorkLocation] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [workerAddress, setWorkerAddress] = useState('');
  const [workerSignatureName, setWorkerSignatureName] = useState('');
  const [signature, setSignature] = useState<string | null>(null);

  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    // 개발 모드(React Strict Mode)는 마운트 시 effect를 2회 실행해 이 fetch를 거의
    // 동시에 2번 발사할 수 있다. 늦게 도착하는 응답(성공이든 실패든)이 먼저 도착한
    // 응답을 덮어쓰지 않도록, 이 effect 인스턴스가 취소됐는지 확인 후에만 상태를 반영한다.
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tech/contract', {
          cache: 'no-store',
          signal: AbortSignal.timeout(15_000),
        });
        const data = await readApiJson<{ contract: Contract }>(res);
        if (cancelled) return;
        setLoadError(null);
        const ct: Contract = data.contract;
        setC(ct);
        // 근로개시일이 비어 있으면 오늘 날짜(로컬)를 기본값으로 채워 바로 서명 가능하게 한다.
        const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (로컬)
        setStartDate(ct.contractStartDate || today);
        setWorkLocation(ct.workLocation ?? '');
        setJobDescription(ct.jobDescription ?? '');
        setWorkerAddress(ct.workerAddress ?? '');
        setWorkerSignatureName(ct.workerSignatureName ?? '');
      } catch (e) {
        if (!cancelled) setLoadError(requestError(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  // 유효성 실패 시 안내 + 해당 필드로 스크롤·포커스
  function fail(msg: string, id?: string) {
    setError(msg);
    setInvalid(id ?? null);
    const el = id ? (document.getElementById(id) as HTMLElement | null) : null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInvalid(null);
    if (!startDate) return fail('근로개시일을 입력해 주세요', 'ct-start');
    if (!workLocation.trim()) return fail('근무장소를 입력해 주세요', 'ct-loc');
    if (!jobDescription.trim())
      return fail('업무 내용을 입력해 주세요', 'ct-job');
    if (!workerSignatureName.trim())
      return fail('성명을 입력해 주세요', 'ct-name');
    if (!workerAddress.trim()) return fail('주소를 입력해 주세요', 'ct-addr');
    if (!signature) return fail('서명을 해 주세요', 'ct-signature');
    setBusy(true);
    try {
      const res = await fetch('/api/tech/contract', {
        method: 'PUT',
        signal: AbortSignal.timeout(15_000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: c?.updatedAt,
          contractStartDate: startDate,
          workLocation,
          jobDescription,
          workerAddress,
          workerSignatureName,
          workerSignatureDataUrl: signature,
        }),
      });
      const data = await readApiJson<{ contract: Contract }>(res);
      setC(data.contract);
    } catch (e) {
      setError(requestError(e));
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <main className="p-6">
        <PageHeader title="근로확인서" back="/tech" />
        <p role="alert" className="text-red-700">
          {loadError}
        </p>
        <button
          type="button"
          onClick={() => setReloadTick((t) => t + 1)}
          className={buttonClasses('secondary', 'md', 'mt-3')}
        >
          다시 시도
        </button>
      </main>
    );
  }
  if (!c) {
    return (
      <main>
        <PageHeader title="근로확인서" back="/tech" />
        <p role="status" className="p-6 text-center text-muted">
          불러오는 중…
        </p>
      </main>
    );
  }

  const confirmed = c.status === 'CONFIRMED';

  return (
    <main className="min-h-screen">
      <PageHeader
        title={confirmed ? '근로확인서' : '근로확인서 작성'}
        back="/tech"
      />

      <form
        noValidate
        onSubmit={submit}
        className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-10 md:py-8"
      >
        <h1 className="hidden text-2xl font-bold print:block">근로확인서</h1>
        {confirmed ? (
          <div
            role="status"
            className="rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700"
          >
            <p className="flex items-center gap-1.5">
              <CheckIcon className="h-4 w-4 shrink-0" />
              서명 완료 — 근로확인이 완료되었습니다.
            </p>
            {c.workerSignatureDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.workerSignatureDataUrl}
                alt="내 서명"
                className="mt-2 h-16 rounded border border-border bg-white object-contain p-1"
              />
            )}
            <p className="mt-1 text-xs font-normal text-muted">
              서명 완료{' '}
              {c.signedAt ? new Date(c.signedAt).toLocaleString('ko-KR') : ''}.
              서명한 내용은 변경되지 않습니다. 정정은 관리자에게 문의해 주세요.
            </p>
          </div>
        ) : (
          <p className="rounded-xl bg-brand-50 p-3 text-sm font-medium text-brand-700">
            아래 내용을 확인하고 서명하면 근로확인이 바로 완료됩니다.
          </p>
        )}

        {confirmed && (
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-12 w-full rounded-lg border border-border bg-white px-4 font-semibold print:hidden"
          >
            근로확인서 인쇄 · PDF 저장
          </button>
        )}
        <PortalSupportLink />
        <section className="space-y-1 rounded-xl border border-border bg-white p-4">
          <h2 className="mb-2 font-semibold">근무조건 전체</h2>
          <ReadOnlyRow
            label="근로 형태"
            value={c.employmentType === 'DAILY' ? '일일 근로자' : '상시 근로자'}
          />
          <ReadOnlyRow
            label="계약 기간"
            value={
              c.employmentType === 'DAILY'
                ? `${startDate} 당일`
                : `${startDate} ~ ${c.contractEndDate ?? '기간의 정함 없음'}`
            }
          />
          <ReadOnlyRow
            label="소정근로시간 · 휴게"
            value={workHoursText(c) || '기재되지 않음'}
          />
          <ReadOnlyRow label="근무일" value={c.workDays} />
          <ReadOnlyRow
            label="주휴일"
            value={c.weeklyHoliday ?? '기재되지 않음'}
          />
          <ReadOnlyRow
            label="연차 유급휴가"
            value={c.annualLeaveNote ?? '기재되지 않음'}
          />
          <ReadOnlyRow
            label="사회보험"
            value={[
              ['고용보험', c.insuranceEmployment],
              ['산재보험', c.insuranceAccident],
              ['국민연금', c.insurancePension],
              ['건강보험', c.insuranceHealth],
            ]
              .map(
                ([name, enabled]) => `${name}: ${enabled ? '적용' : '미적용'}`,
              )
              .join(' · ')}
          />
        </section>
        {/* 전기기사 작성 항목 */}
        <section className="space-y-3 md:rounded-2xl md:bg-white md:p-6 md:shadow-surface-sm">
          <h2 className="text-sm font-semibold">확인 내용</h2>
          <div>
            <label htmlFor="ct-start" className="mb-1 block text-sm text-muted">
              근로개시일
            </label>
            <p className="hidden whitespace-pre-wrap print:block">
              {startDate}
            </p>
            <input
              type="date"
              id="ct-start"
              aria-invalid={invalid === 'ct-start'}
              aria-describedby={
                invalid === 'ct-start' ? 'ct-start-error' : undefined
              }
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={confirmed || busy}
              className={`${inputClass} print:hidden`}
            />
            {invalid === 'ct-start' && (
              <p
                id="ct-start-error"
                role="alert"
                className="text-sm text-red-700"
              >
                {error}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="ct-loc" className="mb-1 block text-sm text-muted">
              근무장소
            </label>
            <p className="hidden whitespace-pre-wrap print:block">
              {workLocation}
            </p>
            <input
              type="text"
              id="ct-loc"
              aria-invalid={invalid === 'ct-loc'}
              aria-describedby={
                invalid === 'ct-loc' ? 'ct-loc-error' : undefined
              }
              maxLength={200}
              value={workLocation}
              onChange={(e) => setWorkLocation(e.target.value)}
              placeholder="예: 고객 현장 (출동), 전기아저씨 사업장 등"
              disabled={confirmed || busy}
              className={`${inputClass} print:hidden`}
            />
            {invalid === 'ct-loc' && (
              <p
                id="ct-loc-error"
                role="alert"
                className="text-sm text-red-700"
              >
                {error}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="ct-job" className="mb-1 block text-sm text-muted">
              업무의 내용
            </label>
            <p className="hidden whitespace-pre-wrap print:block">
              {jobDescription}
            </p>
            <textarea
              id="ct-job"
              aria-invalid={invalid === 'ct-job'}
              aria-describedby={
                invalid === 'ct-job' ? 'ct-job-error' : undefined
              }
              maxLength={500}
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={2}
              disabled={confirmed || busy}
              className={`${inputClass} print:hidden`}
            />
            {invalid === 'ct-job' && (
              <p
                id="ct-job-error"
                role="alert"
                className="text-sm text-red-700"
              >
                {error}
              </p>
            )}
          </div>
        </section>

        <section className="space-y-3 md:rounded-2xl md:bg-white md:p-6 md:shadow-surface-sm">
          <h2 className="text-sm font-semibold">근로자(본인) 정보</h2>
          <div>
            <label htmlFor="ct-name" className="mb-1 block text-sm text-muted">
              성명
            </label>
            <p className="hidden whitespace-pre-wrap print:block">
              {workerSignatureName}
            </p>
            <input
              type="text"
              id="ct-name"
              aria-invalid={invalid === 'ct-name'}
              aria-describedby={
                invalid === 'ct-name' ? 'ct-name-error' : undefined
              }
              maxLength={50}
              value={workerSignatureName}
              onChange={(e) => setWorkerSignatureName(e.target.value)}
              disabled={confirmed || busy}
              className={`${inputClass} print:hidden`}
            />
            {invalid === 'ct-name' && (
              <p
                id="ct-name-error"
                role="alert"
                className="text-sm text-red-700"
              >
                {error}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="ct-addr" className="mb-1 block text-sm text-muted">
              주소
            </label>
            <p className="hidden whitespace-pre-wrap print:block">
              {workerAddress}
            </p>
            <input
              type="text"
              id="ct-addr"
              aria-invalid={invalid === 'ct-addr'}
              aria-describedby={
                invalid === 'ct-addr' ? 'ct-addr-error' : undefined
              }
              maxLength={200}
              value={workerAddress}
              onChange={(e) => setWorkerAddress(e.target.value)}
              disabled={confirmed || busy}
              className={`${inputClass} print:hidden`}
            />
            {invalid === 'ct-addr' && (
              <p
                id="ct-addr-error"
                role="alert"
                className="text-sm text-red-700"
              >
                {error}
              </p>
            )}
          </div>
        </section>

        {/* 임금 (관리자 설정, 읽기전용) */}
        <section className="space-y-1 rounded-2xl border border-border bg-neutral-50 p-4">
          <h2 className="mb-1 text-sm font-semibold">임금</h2>
          {c.wageAmount != null ? (
            <>
              <ReadOnlyRow
                label={c.wageType ? WAGE_TYPE_LABEL[c.wageType] : '임금'}
                value={`${c.wageAmount.toLocaleString('ko-KR')}원`}
              />
              {c.payDate && (
                <ReadOnlyRow label="임금지급일" value={c.payDate} />
              )}
              {c.payMethod && (
                <ReadOnlyRow
                  label="지급방법"
                  value={PAY_METHOD_LABEL[c.payMethod]}
                />
              )}
            </>
          ) : (
            <p className="text-sm text-amber-700">
              관리자가 임금을 확정하면 서명할 수 있습니다.
            </p>
          )}
          <ReadOnlyRow
            label="상여금"
            value={
              c.bonusExists
                ? c.bonusAmount == null
                  ? '금액 미기재'
                  : `${c.bonusAmount.toLocaleString('ko-KR')}원`
                : '없음'
            }
          />
          <ReadOnlyRow
            label="기타 급여"
            value={
              c.otherPayExists
                ? `${c.otherPayDesc ?? ''} ${c.otherPayAmount?.toLocaleString('ko-KR') ?? '금액 미기재'}원`
                : '없음'
            }
          />
          <p className="pt-1 text-sm text-muted">
            위 금액과 근무조건을 확인한 뒤 서명해 주세요. 실제 협의한 내용과
            다르면 서명 전에 관리자에게 정정을 요청해 주세요. 서명 완료본은
            수정할 수 없습니다.
          </p>
        </section>

        {/* 서명 → 근로확인 완료 */}
        {!confirmed && c.wageAmount != null && (
          <section className="space-y-2 md:rounded-2xl md:bg-white md:p-6 md:shadow-surface-sm">
            <h2
              id="ct-signature"
              tabIndex={-1}
              className="text-sm font-semibold"
            >
              근로자 서명
            </h2>
            <SignaturePad onChange={setSignature} disabled={busy} />
          </section>
        )}

        {error && (
          <p
            id="contract-error"
            role="alert"
            className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600"
          >
            {error}
          </p>
        )}

        {error?.includes('변경') && (
          <button
            type="button"
            onClick={() => {
              setSignature(null);
              setC(null);
              setError(null);
              setReloadTick((t) => t + 1);
            }}
            className="min-h-11 rounded-lg border border-border px-4 text-sm"
          >
            최신 근무조건 다시 불러오기 · 서명 초기화
          </button>
        )}
        {!confirmed && c.wageAmount != null && (
          <button
            type="submit"
            disabled={busy}
            className={buttonClasses('primary', 'lg', 'w-full')}
          >
            {busy ? '처리 중…' : '서명하고 완료'}
          </button>
        )}
      </form>
    </main>
  );
}
