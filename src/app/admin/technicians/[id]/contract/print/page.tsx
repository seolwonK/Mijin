'use client';

import { use, useEffect, useState } from 'react';

const WAGE_TYPE_LABEL: Record<string, string> = {
  MONTHLY: '월급',
  DAILY: '일급',
  HOURLY: '시급',
};
const PAY_METHOD_LABEL: Record<string, string> = {
  BANK_TRANSFER: '예금통장 입금',
  DIRECT: '근로자에게 직접 지급',
};

type Contract = {
  status: string;
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
  technician: { name: string; phone: string; address: string; employmentType: string };
  employer: { name: string; ceo: string | null; address: string | null; phone: string | null };
  contract: Contract | null;
};

function won(n: number | null): string {
  return n != null ? `${n.toLocaleString('ko-KR')}원` : '';
}

function hoursText(c: Contract): string {
  const parts: string[] = [];
  if (c.workStartTime && c.workEndTime) parts.push(`${c.workStartTime} ~ ${c.workEndTime}`);
  if (c.breakStartTime && c.breakEndTime)
    parts.push(`(휴게시간 ${c.breakStartTime} ~ ${c.breakEndTime})`);
  if (c.hoursNote) parts.push(c.hoursNote);
  return parts.join(' ');
}

function Clause({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-gray-300 py-2">
      <p className="font-bold">
        {n}. {title}
      </p>
      <div className="mt-0.5 pl-4 text-[0.95em] leading-relaxed">{children}</div>
    </div>
  );
}

export default function ContractPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/technicians/${id}/contract`, {
          cache: 'no-store',
        });
        const data = await res.json();
        if (!res.ok) {
          setErr(data.error ?? '불러오지 못했습니다');
          return;
        }
        setD(data);
      } catch {
        setErr('네트워크 오류가 발생했습니다');
      }
    })();
  }, [id]);

  if (err) return <main className="p-6 text-red-600">{err}</main>;
  if (!d) return <main className="p-6 text-center text-gray-400">불러오는 중…</main>;
  if (!d.contract) {
    return (
      <main className="p-6 text-center text-gray-500">
        기술자가 아직 근로계약서를 작성하지 않았습니다.
      </main>
    );
  }
  const c = d.contract;

  return (
    <main className="bg-white">
      {/* 화면 전용 인쇄 버튼 (인쇄물에는 제외) */}
      <div
        data-print-hide
        className="sticky top-0 z-10 flex justify-end gap-2 border-b border-gray-200 bg-white/95 p-3 backdrop-blur"
      >
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl bg-gray-800 px-5 py-2.5 text-sm font-bold text-white"
        >
          🖨 인쇄 / PDF 저장
        </button>
      </div>

      {/* 계약서 본문 (A4) */}
      <div className="mx-auto max-w-[820px] px-6 py-8 text-[15px] text-gray-900 print:max-w-none print:px-0 print:py-0">
        <h1 className="mb-6 text-center text-2xl font-bold tracking-widest">
          표준근로계약서
        </h1>

        {/* 당사자 */}
        <div className="mb-4 leading-relaxed">
          <p>
            <b>{d.employer.name}</b>(이하 &ldquo;사업주&rdquo;라 함)과(와){' '}
            <b>{c.workerSignatureName ?? d.technician.name}</b>(이하
            &ldquo;근로자&rdquo;라 함)은 다음과 같이 근로계약을 체결한다.
          </p>
        </div>

        <div className="border-t-2 border-gray-800">
          <Clause n={1} title="근로계약기간">
            {c.contractStartDate ?? '____년 __월 __일'}
            {c.employmentType === 'DAILY'
              ? ' (근로개시일 당일, 1일 단위)'
              : c.contractEndDate
                ? ` ~ ${c.contractEndDate}`
                : ' 부터 (기간의 정함이 없음)'}
          </Clause>
          <Clause n={2} title="근무장소">
            {c.workLocation || '—'}
          </Clause>
          <Clause n={3} title="업무의 내용">
            {c.jobDescription || '—'}
          </Clause>
          <Clause n={4} title="소정근로시간">
            {hoursText(c)}
          </Clause>
          <Clause n={5} title="근무일 / 휴일">
            근무일: {c.workDays}
            {c.weeklyHoliday ? ` / 주휴일: 매주 ${c.weeklyHoliday}` : ''}
          </Clause>
          <Clause n={6} title="임금">
            <ul className="space-y-0.5">
              <li>
                {c.wageType ? WAGE_TYPE_LABEL[c.wageType] : '월(일, 시간)급'} :{' '}
                {won(c.wageAmount) || '____________원'}
              </li>
              <li>
                상여금: {c.bonusExists ? `있음 (${won(c.bonusAmount)})` : '없음'}
              </li>
              <li>
                기타급여(제수당 등):{' '}
                {c.otherPayExists
                  ? `있음 ${c.otherPayDesc ?? ''} ${won(c.otherPayAmount)}`.trim()
                  : '없음'}
              </li>
              <li>임금지급일: {c.payDate || '매월 ____일'}</li>
              <li>
                지급방법: {c.payMethod ? PAY_METHOD_LABEL[c.payMethod] : '____________'}
              </li>
            </ul>
          </Clause>
          <Clause n={7} title="연차유급휴가">
            연차유급휴가는 근로기준법에서 정하는 바에 따라 부여한다.
          </Clause>
          <Clause n={8} title="사회보험 적용여부 (해당란 체크)">
            <div className="flex flex-wrap gap-4">
              <span>{c.insuranceEmployment ? '☑' : '☐'} 고용보험</span>
              <span>{c.insuranceAccident ? '☑' : '☐'} 산재보험</span>
              <span>{c.insurancePension ? '☑' : '☐'} 국민연금</span>
              <span>{c.insuranceHealth ? '☑' : '☐'} 건강보험</span>
            </div>
          </Clause>
          <Clause n={9} title="근로계약서 교부">
            사업주는 근로계약을 체결함과 동시에 본 계약서를 사본하여 근로자에게 교부한다.
          </Clause>
          <Clause n={10} title="근로계약, 취업규칙 등의 성실한 이행의무">
            사업주와 근로자는 각자가 근로계약, 취업규칙, 단체협약을 지키고 성실하게
            이행하여야 한다.
          </Clause>
          <Clause n={11} title="기타">
            이 계약에 정함이 없는 사항은 근로기준법령에 의한다.
          </Clause>
        </div>

        {/* 서명란 */}
        <div className="mt-10 grid grid-cols-2 gap-8 text-[0.95em]">
          <div className="space-y-1">
            <p className="font-bold">(사업주)</p>
            <p>사업체명: {d.employer.name}</p>
            <p>주 소: {d.employer.address ?? ''}</p>
            <p>대표자: {d.employer.ceo ?? ''} (서명)</p>
            {d.employer.phone && <p>전 화: {d.employer.phone}</p>}
          </div>
          <div className="space-y-1">
            <p className="font-bold">(근로자)</p>
            <p>주 소: {c.workerAddress ?? ''}</p>
            <p>연락처: {d.technician.phone}</p>
            <p>성 명: {c.workerSignatureName ?? d.technician.name} (서명)</p>
          </div>
        </div>
      </div>
    </main>
  );
}
