'use client';

import { useEffect, useState } from 'react';
import BackButton from '@/components/BackButton';
import SignaturePad from '@/components/SignaturePad';

const inputClass =
  'w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-500 focus:outline-none';

const EMPLOYMENT_LABEL: Record<string, string> = {
  DAILY: '일일 근로자',
  PERMANENT: '상시 근로자',
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
        setStartDate(ct.contractStartDate ?? '');
        setWorkLocation(ct.workLocation ?? '');
        setJobDescription(ct.jobDescription ?? '');
        setWorkerAddress(ct.workerAddress ?? '');
        setWorkerSignatureName(ct.workerSignatureName ?? '');
      } catch {
        setLoadError('네트워크 오류가 발생했습니다');
      }
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!signature) return setError('서명을 해 주세요');
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
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-2 md:py-3">
          <BackButton fallback="/tech" />
          <h1 className="text-lg font-bold">근로계약서 작성</h1>
        </div>
      </header>

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
        <section className="space-y-1 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold">근무 조건</h2>
            <span className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
              {EMPLOYMENT_LABEL[c.employmentType]}
            </span>
          </div>
          <ReadOnlyRow label="소정근로시간" value={hoursText(c)} />
          <ReadOnlyRow label="근무일" value={c.workDays} />
          {c.weeklyHoliday && <ReadOnlyRow label="주휴일" value={c.weeklyHoliday} />}
          <p className="pt-1 text-xs text-gray-400">
            근무 조건은 근로형태에 따라 자동 설정되며 수정할 수 없습니다.
          </p>
        </section>

        {/* 기술자 작성 항목 */}
        <section className="space-y-3 md:rounded-2xl md:bg-white md:p-6 md:shadow-sm">
          <h2 className="text-sm font-semibold">계약 내용</h2>
          <div>
            <label className="mb-1 block text-xs text-gray-500">근로개시일</label>
            <input
              type="date"
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
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={2}
              disabled={confirmed}
              className={inputClass}
            />
          </div>
        </section>

        <section className="space-y-3 md:rounded-2xl md:bg-white md:p-6 md:shadow-sm">
          <h2 className="text-sm font-semibold">근로자(본인) 정보</h2>
          <div>
            <label className="mb-1 block text-xs text-gray-500">성명</label>
            <input
              type="text"
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
              value={workerAddress}
              onChange={(e) => setWorkerAddress(e.target.value)}
              disabled={confirmed}
              className={inputClass}
            />
          </div>
        </section>

        {/* 관리자 입력 영역 안내 */}
        <section className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
          <h2 className="mb-1 font-semibold text-gray-600">임금 · 4대보험</h2>
          <p>
            임금(월급/일급/시급)·4대보험은 관리자가 설정한 값이 적용됩니다. 금액이
            정해지지 않은 경우 &ldquo;추후 협의&rdquo;로 표기됩니다.
          </p>
        </section>

        {/* 서명 → 계약 완료 */}
        {!confirmed && (
          <section className="space-y-2 md:rounded-2xl md:bg-white md:p-6 md:shadow-sm">
            <h2 className="text-sm font-semibold">근로자 서명</h2>
            <SignaturePad onChange={setSignature} />
          </section>
        )}

        {error && (
          <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">
            {error}
          </p>
        )}

        {!confirmed && (
          <button
            type="submit"
            disabled={
              busy ||
              !signature ||
              !startDate ||
              !workLocation.trim() ||
              !jobDescription.trim() ||
              !workerSignatureName.trim() ||
              !workerAddress.trim()
            }
            className="h-14 w-full rounded-2xl bg-blue-600 text-lg font-bold text-white transition-colors enabled:hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? '처리 중…' : '서명하고 완료'}
          </button>
        )}
      </form>
    </main>
  );
}
