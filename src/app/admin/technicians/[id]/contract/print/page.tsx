'use client';

import { use, useEffect, useState } from 'react';

const WAGE_TYPE_LABEL: Record<string, string> = {
  MONTHLY: '월급',
  DAILY: '일급',
  HOURLY: '시급',
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
  technician: { name: string; phone: string; address: string; employmentType: string };
  employer: {
    name: string;
    ceo: string | null;
    address: string | null;
    phone: string | null;
    signatureDataUrl: string | null;
  };
  contract: Contract | null;
};

function won(n: number | null): string {
  return n != null ? `${n.toLocaleString('ko-KR')}원` : '';
}

function koDate(s: string | null): string {
  if (!s) return '____년 __월 __일';
  const [y, m, d] = s.split('-');
  return `${y}년 ${m}월 ${d}일`;
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

// 사업주/근로자 서명란: 등록된 서명 이미지가 있으면 삽입, 없으면 "(서명)"
function SignatureMark({ dataUrl, alt }: { dataUrl: string | null; alt: string }) {
  if (!dataUrl) return <span>(서명)</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUrl} alt={alt} className="inline-block h-10 object-contain align-middle" />
      <span className="text-xs text-gray-400">(서명)</span>
    </span>
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
  if (!d) return <main className="p-6 text-center text-muted">불러오는 중…</main>;
  if (!d.contract) {
    return (
      <main className="p-6 text-center text-muted">
        기술자가 아직 근로계약서를 작성하지 않았습니다.
      </main>
    );
  }
  const c = d.contract;
  const isDaily = c.employmentType === 'DAILY';
  const title = isDaily ? '일용근로자 표준근로계약서' : '표준근로계약서';

  return (
    <main className="bg-white">
      {/* 화면 전용 인쇄 버튼 (인쇄물에는 제외) */}
      <div
        data-print-hide
        className="sticky top-0 z-10 flex justify-end gap-2 border-b border-border bg-surface/95 p-3 backdrop-blur"
      >
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-700"
        >
          🖨 인쇄 / PDF 저장
        </button>
      </div>

      {/* 계약서 본문 (A4) */}
      <div className="mx-auto max-w-[820px] px-6 py-8 text-[15px] text-gray-900 print:max-w-none print:px-0 print:py-0">
        <h1 className="mb-6 text-center text-2xl font-bold tracking-widest">{title}</h1>

        {/* 당사자 */}
        <div className="mb-4 leading-relaxed">
          <p>
            <b>{d.employer.name}</b>(이하 &ldquo;사업주&rdquo;라 함)과(와){' '}
            <b>{c.workerSignatureName ?? d.technician.name}</b>(이하
            &ldquo;근로자&rdquo;라 함)은 다음과 같이 근로계약을 체결한다.
          </p>
        </div>

        <div className="border-t-2 border-gray-800">
          {isDaily ? (
            <Clause n={1} title="근로계약기간">
              {koDate(c.contractStartDate)} (근로개시일)
            </Clause>
          ) : (
            <Clause n={1} title="근로개시일">
              {koDate(c.contractStartDate)}부터 (기간의 정함이 없음)
            </Clause>
          )}
          <Clause n={2} title="근무장소">
            {c.workLocation || '—'}
          </Clause>
          <Clause n={3} title="업무의 내용">
            {c.jobDescription || '—'}
          </Clause>
          <Clause n={4} title={isDaily ? '근로시간' : '소정근로시간'}>
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
                {c.wageAmount != null ? won(c.wageAmount) : '추후 협의'}
              </li>
              <li>상여금: {c.bonusExists ? `있음 (${won(c.bonusAmount)})` : '없음'}</li>
              <li>
                기타급여(제수당 등):{' '}
                {c.otherPayExists
                  ? `있음 ${c.otherPayDesc ?? ''} ${won(c.otherPayAmount)}`.trim()
                  : '없음'}
              </li>
              <li>임금지급일: {c.payDate || '추후 협의'}</li>
              <li>
                지급방법:{' '}
                {c.payMethod === 'BANK_TRANSFER'
                  ? '근로자 명의 예금통장에 입금'
                  : c.payMethod === 'DIRECT'
                    ? '근로자에게 직접지급'
                    : '추후 협의'}
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
            사업주는 근로계약을 체결함과 동시에 본 계약서를 사본하여 근로자의 교부요구와
            관계없이 근로자에게 교부한다. (근로기준법 제17조 이행)
          </Clause>
          <Clause n={10} title="근로계약, 취업규칙 등의 성실한 이행의무">
            사업주와 근로자는 각자가 근로계약, 취업규칙, 단체협약을 지키고 성실하게
            이행하여야 한다.
          </Clause>
          <Clause n={11} title="기타">
            이 계약에 정함이 없는 사항은 근로기준법령에 의한다.
          </Clause>
        </div>

        {/* 작성일자 */}
        <p className="mt-6 text-center">{koDate(c.signedAt ? c.signedAt.slice(0, 10) : null)}</p>

        {/* 서명란 */}
        <div className="mt-6 grid grid-cols-2 gap-8 text-[0.95em]">
          <div className="space-y-1">
            <p className="font-bold">(사업주)</p>
            <p>사업체명 : {d.employer.name}</p>
            <p>주 소 : {d.employer.address ?? ''}</p>
            {d.employer.phone && <p>전 화 : {d.employer.phone}</p>}
            <p className="flex items-center gap-1">
              대표자 : {d.employer.ceo ?? ''}{' '}
              <SignatureMark dataUrl={d.employer.signatureDataUrl} alt="사업주 서명" />
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-bold">(근로자)</p>
            <p>주 소 : {c.workerAddress ?? ''}</p>
            <p>연락처 : {d.technician.phone}</p>
            <p className="flex items-center gap-1">
              성 명 : {c.workerSignatureName ?? d.technician.name}{' '}
              <SignatureMark dataUrl={c.workerSignatureDataUrl} alt="근로자 서명" />
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
