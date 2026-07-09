'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import BackButton from '@/components/BackButton';

const inputClass =
  'w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-500 focus:outline-none';

const EMPLOYMENT_LABEL: Record<string, string> = {
  DAILY: '일일 근로자',
  PERMANENT: '상시 근로자',
};
const STATUS_LABEL: Record<string, string> = {
  DRAFT: '서명 전 (배정 불가)',
  SUBMITTED: '서명 전 (배정 불가)',
  CONFIRMED: '서명 완료 (배정 가능)',
};
const WAGE_TYPES: { value: string; label: string }[] = [
  { value: 'MONTHLY', label: '월급' },
  { value: 'DAILY', label: '일급' },
  { value: 'HOURLY', label: '시급' },
];

type Contract = {
  status: 'DRAFT' | 'SUBMITTED' | 'CONFIRMED';
  employmentType: 'DAILY' | 'PERMANENT';
  contractStartDate: string | null;
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
  wageType: string | null;
  wageAmount: number | null;
  bonusExists: boolean;
  bonusAmount: number | null;
  otherPayExists: boolean;
  otherPayDesc: string | null;
  otherPayAmount: number | null;
  payDate: string | null;
  payMethod: string | null;
  insuranceEmployment: boolean;
  insuranceAccident: boolean;
  insurancePension: boolean;
  insuranceHealth: boolean;
};

type Data = {
  technician: {
    id: string;
    name: string;
    phone: string;
    address: string;
    employmentType: string;
  };
  employer: { name: string; ceo: string | null; address: string | null; phone: string | null };
  contract: Contract | null;
};

function hoursText(c: Contract): string {
  const parts: string[] = [];
  if (c.workStartTime && c.workEndTime) parts.push(`${c.workStartTime} ~ ${c.workEndTime}`);
  if (c.breakStartTime && c.breakEndTime)
    parts.push(`(휴게 ${c.breakStartTime} ~ ${c.breakEndTime})`);
  if (c.hoursNote) parts.push(c.hoursNote);
  return parts.join(' ');
}

export default function AdminContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [d, setD] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 임금 편집 필드
  const [wageType, setWageType] = useState('');
  const [wageAmount, setWageAmount] = useState('');
  const [bonusExists, setBonusExists] = useState(false);
  const [bonusAmount, setBonusAmount] = useState('');
  const [otherPayExists, setOtherPayExists] = useState(false);
  const [otherPayDesc, setOtherPayDesc] = useState('');
  const [otherPayAmount, setOtherPayAmount] = useState('');
  const [payDate, setPayDate] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [insEmployment, setInsEmployment] = useState(true);
  const [insAccident, setInsAccident] = useState(true);
  const [insPension, setInsPension] = useState(true);
  const [insHealth, setInsHealth] = useState(true);

  function hydrate(c: Contract) {
    setWageType(c.wageType ?? '');
    setWageAmount(c.wageAmount != null ? String(c.wageAmount) : '');
    setBonusExists(c.bonusExists);
    setBonusAmount(c.bonusAmount != null ? String(c.bonusAmount) : '');
    setOtherPayExists(c.otherPayExists);
    setOtherPayDesc(c.otherPayDesc ?? '');
    setOtherPayAmount(c.otherPayAmount != null ? String(c.otherPayAmount) : '');
    setPayDate(c.payDate ?? '');
    setPayMethod(c.payMethod ?? '');
    setInsEmployment(c.insuranceEmployment);
    setInsAccident(c.insuranceAccident);
    setInsPension(c.insurancePension);
    setInsHealth(c.insuranceHealth);
  }

  async function load() {
    try {
      const res = await fetch(`/api/admin/technicians/${id}/contract`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error ?? '불러오지 못했습니다');
        return;
      }
      setD(data);
      if (data.contract) hydrate(data.contract);
    } catch {
      setLoadError('네트워크 오류가 발생했습니다');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/technicians/${id}/contract`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wageType: wageType || null,
          wageAmount: wageAmount ? Number(wageAmount) : null,
          bonusExists,
          bonusAmount: bonusAmount ? Number(bonusAmount) : null,
          otherPayExists,
          otherPayDesc: otherPayDesc || null,
          otherPayAmount: otherPayAmount ? Number(otherPayAmount) : null,
          payDate: payDate || null,
          payMethod: payMethod || null,
          insuranceEmployment: insEmployment,
          insuranceAccident: insAccident,
          insurancePension: insPension,
          insuranceHealth: insHealth,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '저장에 실패했습니다');
        return;
      }
      setMsg('저장했습니다.');
      await load();
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
  if (!d) return <main className="p-6 text-center text-gray-400">불러오는 중…</main>;

  const c = d.contract;
  const confirmed = c?.status === 'CONFIRMED';

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-3">
          <BackButton fallback={`/admin/technicians/${id}`} />
          <h1 className="text-lg font-bold">근로계약서 — {d.technician.name}</h1>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl space-y-5 p-4 md:py-8">
        {!c ? (
          <p className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500">
            기술자가 아직 근로계약서를 작성하지 않았습니다.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3 text-sm">
              <span className="text-gray-500">상태</span>
              <span className="font-semibold">{STATUS_LABEL[c.status]}</span>
            </div>

            {c.workerSignatureDataUrl ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-3">
                <p className="text-sm font-medium text-green-700">
                  ✍️ 기술자 서명 완료
                  {c.signedAt &&
                    ` · ${new Date(c.signedAt).toLocaleString('ko-KR')}`}
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.workerSignatureDataUrl}
                  alt="기술자 서명"
                  className="mt-2 h-16 rounded border border-gray-200 bg-white object-contain p-1"
                />
              </div>
            ) : (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
                기술자 서명 대기 중입니다.
              </p>
            )}

            {/* 기술자 제출 내용 (읽기전용) */}
            <section className="space-y-1 rounded-2xl border border-gray-200 p-4">
              <h2 className="mb-1 text-sm font-semibold">
                기술자 작성 내용 · {EMPLOYMENT_LABEL[c.employmentType]}
              </h2>
              <Row label="근로개시일" value={c.contractStartDate ?? '-'} />
              {c.employmentType === 'DAILY' ? (
                <Row label="계약기간" value={`${c.contractStartDate ?? '-'} (당일)`} />
              ) : (
                <Row label="계약기간" value="기간의 정함이 없음" />
              )}
              <Row label="근무장소" value={c.workLocation || '-'} />
              <Row label="업무의 내용" value={c.jobDescription || '-'} />
              <Row label="소정근로시간" value={hoursText(c)} />
              <Row label="근무일" value={c.workDays} />
              {c.weeklyHoliday && <Row label="주휴일" value={c.weeklyHoliday} />}
              <Row label="근로자 성명" value={c.workerSignatureName || '-'} />
              <Row label="근로자 주소" value={c.workerAddress || '-'} />
            </section>

            {/* 임금 입력 (관리자) */}
            <section className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
              <h2 className="text-sm font-semibold text-blue-800">임금 (관리자 입력)</h2>
              <div>
                <label className="mb-1 block text-xs text-gray-500">임금 형태</label>
                <div className="grid grid-cols-3 gap-2">
                  {WAGE_TYPES.map((w) => (
                    <button
                      key={w.value}
                      type="button"
                      onClick={() => setWageType(w.value)}
                      disabled={confirmed}
                      className={`rounded-xl border p-2 text-sm font-medium ${
                        wageType === w.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-300 bg-white'
                      } disabled:opacity-60`}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">금액 (원)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={wageAmount}
                  onChange={(e) => setWageAmount(e.target.value)}
                  disabled={confirmed}
                  className={inputClass}
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={bonusExists}
                  onChange={(e) => setBonusExists(e.target.checked)}
                  disabled={confirmed}
                  className="h-4 w-4"
                />
                상여금 있음
              </label>
              {bonusExists && (
                <input
                  type="number"
                  inputMode="numeric"
                  value={bonusAmount}
                  onChange={(e) => setBonusAmount(e.target.value)}
                  placeholder="상여금 (원)"
                  disabled={confirmed}
                  className={inputClass}
                />
              )}

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={otherPayExists}
                  onChange={(e) => setOtherPayExists(e.target.checked)}
                  disabled={confirmed}
                  className="h-4 w-4"
                />
                기타급여(제수당 등) 있음
              </label>
              {otherPayExists && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={otherPayDesc}
                    onChange={(e) => setOtherPayDesc(e.target.value)}
                    placeholder="항목 (예: 식대)"
                    disabled={confirmed}
                    className={inputClass}
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    value={otherPayAmount}
                    onChange={(e) => setOtherPayAmount(e.target.value)}
                    placeholder="금액 (원)"
                    disabled={confirmed}
                    className={inputClass}
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs text-gray-500">임금지급일</label>
                <input
                  type="text"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  placeholder="예: 매월 25일"
                  disabled={confirmed}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">지급방법</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'BANK_TRANSFER', label: '예금통장 입금' },
                    { value: 'DIRECT', label: '직접 지급' },
                  ].map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setPayMethod(m.value)}
                      disabled={confirmed}
                      className={`rounded-xl border p-2 text-sm font-medium ${
                        payMethod === m.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-300 bg-white'
                      } disabled:opacity-60`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* 4대보험 */}
            <section className="space-y-2 rounded-2xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold">사회보험 적용</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  { label: '고용보험', v: insEmployment, set: setInsEmployment },
                  { label: '산재보험', v: insAccident, set: setInsAccident },
                  { label: '국민연금', v: insPension, set: setInsPension },
                  { label: '건강보험', v: insHealth, set: setInsHealth },
                ].map((it) => (
                  <label key={it.label} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={it.v}
                      onChange={(e) => it.set(e.target.checked)}
                      disabled={confirmed}
                      className="h-4 w-4"
                    />
                    {it.label}
                  </label>
                ))}
              </div>
            </section>

            {/* 사업주 (미진전기, 읽기전용) */}
            <section className="space-y-1 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <h2 className="mb-1 text-sm font-semibold">사업주 (고용주)</h2>
              <Row label="사업체명" value={d.employer.name} />
              {d.employer.ceo && <Row label="대표자" value={d.employer.ceo} />}
              {d.employer.address && <Row label="주소" value={d.employer.address} />}
              {d.employer.phone && <Row label="전화" value={d.employer.phone} />}
              <p className="pt-1 text-xs text-gray-400">
                사업주 정보는 관리자 설정에서 수정합니다.
              </p>
            </section>

            {error && (
              <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">
                {error}
              </p>
            )}
            {msg && (
              <p className="rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">
                {msg}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {!confirmed && (
                <button
                  type="button"
                  onClick={save}
                  disabled={busy}
                  className="h-12 flex-1 rounded-2xl border border-gray-300 font-bold text-gray-700 disabled:opacity-60"
                >
                  임금 저장
                </button>
              )}
              <Link
                href={`/admin/technicians/${id}/contract/print`}
                className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-gray-800 font-bold text-white"
              >
                🖨 인쇄
              </Link>
            </div>
            {!confirmed && (
              <p className="text-center text-xs text-gray-400">
                기술자가 포털에서 서명하면 자동으로 완료됩니다. 임금은 비워두면 계약서에
                &ldquo;추후 협의&rdquo;로 표기됩니다.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-800">{value}</span>
    </div>
  );
}
