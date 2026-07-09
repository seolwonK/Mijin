'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { buttonClasses } from '@/components/Button';
import SignaturePad from '@/components/SignaturePad';

const inputClass =
  'w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-500 focus:outline-none';

const EMPLOYMENT_LABEL: Record<string, string> = {
  DAILY: '일일 근로자',
  PERMANENT: '상시 근로자',
};
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

function hoursText(c: Contract): string {
  const parts: string[] = [];
  if (c.workStartTime && c.workEndTime) parts.push(`${c.workStartTime} ~ ${c.workEndTime}`);
  if (c.breakStartTime && c.breakEndTime)
    parts.push(`(휴게 ${c.breakStartTime} ~ ${c.breakEndTime})`);
  if (c.hoursNote) parts.push(c.hoursNote);
  return parts.join(' ');
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-800">{value}</span>
    </div>
  );
}

export default function TechContractPage() {
  const [c, setC] = useState<Contract | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 편집 필드
  const [startDate, setStartDate] = useState('');
  const [workLocation, setWorkLocation] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [workerAddress, setWorkerAddress] = useState('');
  const [workerSignatureName, setWorkerSignatureName] = useState('');
  const [signature, setSignature] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/tech/contract', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) {
          setLoadError(data.error ?? '불러오지 못했습니다');
          return;
        }
        const ct: Contract = data.contract;
        setC(ct);
        // 근로개시일이 비어 있으면 오늘 날짜(로컬)를 기본값으로 채워 바로 서명 가능하게 한다.
        const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (로컬)
        setStartDate(ct.contractStartDate || today);
        setWorkLocation(ct.workLocation ?? '');
        setJobDescription(ct.jobDescription ?? '');
        setWorkerAddress(ct.workerAddress ?? '');
        setWorkerSignatureName(ct.workerSignatureName ?? '');
      } catch {
        setLoadError('네트워크 오류가 발생했습니다');
      }
    })();
  }, []);

  // 유효성 실패 시 안내 + 해당 필드로 스크롤·포커스
  function fail(msg: string, id?: string) {
    setError(msg);
    const el = id ? (document.getElementById(id) as HTMLElement | null) : null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!startDate) return fail('근로개시일을 입력해 주세요', 'ct-start');
    if (!workLocation.trim()) return fail('근무장소를 입력해 주세요', 'ct-loc');
    if (!jobDescription.trim()) return fail('업무 내용을 입력해 주세요', 'ct-job');
    if (!workerSignatureName.trim()) return fail('성명을 입력해 주세요', 'ct-name');
    if (!workerAddress.trim()) return fail('주소를 입력해 주세요', 'ct-addr');
    if (!signature) return fail('서명을 해 주세요');
    setBusy(true);
    try {
      const res = await fetch('/api/tech/contract', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractStartDate: startDate,
          workLocation,
          jobDescription,
          workerAddress,
          workerSignatureName,
          workerSignatureDataUrl: signature,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '서명·완료에 실패했습니다');
        return;
      }
      setC(data.contract);
    } catch {
      setError('네트워크 오류가 발생했습니다');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <main className="p-6">
        <p className="text-red-600">{loadError}</p>
      </main>
    );
  }
  if (!c) {
    return <main className="p-6 text-center text-gray-400">불러오는 중…</main>;
  }

  const confirmed = c.status === 'CONFIRMED';

  return (
    <main className="min-h-screen">
      <PageHeader title="근로계약서 작성" back="/tech" />

      <form
        onSubmit={submit}
        className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-10 md:py-8"
      >
        {confirmed ? (
          <div className="rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">
            <p>✅ 서명 완료 — 계약이 체결되었습니다.</p>
            {c.workerSignatureDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.workerSignatureDataUrl}
                alt="내 서명"
                className="mt-2 h-16 rounded border border-gray-200 bg-white object-contain p-1"
              />
            )}
            <p className="mt-1 text-xs font-normal text-gray-500">
              수정이 필요하면 관리자에게 문의해 주세요.
            </p>
          </div>
        ) : (
          <p className="rounded-xl bg-blue-50 p-3 text-sm font-medium text-blue-700">
            아래 내용을 확인하고 서명하면 계약이 바로 완료됩니다.
          </p>
        )}

        {/* 근로형태 + 근무조건 (읽기전용, 서버 확정) */}
        <section className="space-y-1 rounded-2xl border border-slate-200 bg-gray-50 p-4">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold">근무 조건</h2>
            <span className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
              {EMPLOYMENT_LABEL[c.employmentType]}
            </span>
          </div>
          <ReadOnlyRow label="소정근로시간" value={hoursText(c)} />
          <ReadOnlyRow label="근무일" value={c.workDays} />
          {c.weeklyHoliday && <ReadOnlyRow label="주휴일" value={c.weeklyHoliday} />}
          <p className="pt-1 text-xs text-gray-500">
            근무 조건은 근로형태에 따라 자동 설정되며 수정할 수 없습니다.
          </p>
        </section>

        {/* 기술자 작성 항목 */}
        <section className="space-y-3 md:rounded-2xl md:bg-white md:p-6 md:shadow-card">
          <h2 className="text-sm font-semibold">계약 내용</h2>
          <div>
            <label className="mb-1 block text-xs text-gray-500">근로개시일</label>
            <input
              type="date"
              id="ct-start"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={confirmed}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">근무장소</label>
            <input
              type="text"
              id="ct-loc"
              value={workLocation}
              onChange={(e) => setWorkLocation(e.target.value)}
              placeholder="예: 고객 현장 (출동), 미진전기 사업장 등"
              disabled={confirmed}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">업무의 내용</label>
            <textarea
              id="ct-job"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={2}
              disabled={confirmed}
              className={inputClass}
            />
          </div>
        </section>

        <section className="space-y-3 md:rounded-2xl md:bg-white md:p-6 md:shadow-card">
          <h2 className="text-sm font-semibold">근로자(본인) 정보</h2>
          <div>
            <label className="mb-1 block text-xs text-gray-500">성명</label>
            <input
              type="text"
              id="ct-name"
              value={workerSignatureName}
              onChange={(e) => setWorkerSignatureName(e.target.value)}
              disabled={confirmed}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">주소</label>
            <input
              type="text"
              id="ct-addr"
              value={workerAddress}
              onChange={(e) => setWorkerAddress(e.target.value)}
              disabled={confirmed}
              className={inputClass}
            />
          </div>
        </section>

        {/* 임금 (관리자 설정, 읽기전용) */}
        <section className="space-y-1 rounded-2xl border border-slate-200 bg-gray-50 p-4">
          <h2 className="mb-1 text-sm font-semibold">임금</h2>
          {c.wageAmount != null ? (
            <>
              <ReadOnlyRow
                label={c.wageType ? WAGE_TYPE_LABEL[c.wageType] : '임금'}
                value={`${c.wageAmount.toLocaleString('ko-KR')}원`}
              />
              {c.payDate && <ReadOnlyRow label="임금지급일" value={c.payDate} />}
              {c.payMethod && (
                <ReadOnlyRow label="지급방법" value={PAY_METHOD_LABEL[c.payMethod]} />
              )}
            </>
          ) : (
            <p className="text-sm text-amber-700">
              관리자가 임금을 확정하면 서명할 수 있습니다.
            </p>
          )}
          <p className="pt-1 text-xs text-gray-400">
            임금은 기본값으로 설정되어 바로 서명할 수 있으며, 이후 관리자가 실제
            조건으로 조정할 수 있습니다.
          </p>
        </section>

        {/* 서명 → 계약 완료 */}
        {!confirmed && c.wageAmount != null && (
          <section className="space-y-2 md:rounded-2xl md:bg-white md:p-6 md:shadow-card">
            <h2 className="text-sm font-semibold">근로자 서명</h2>
            <SignaturePad onChange={setSignature} />
          </section>
        )}

        {error && (
          <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">
            {error}
          </p>
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
