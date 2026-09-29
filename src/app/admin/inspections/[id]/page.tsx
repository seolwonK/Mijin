'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { buttonClasses } from '@/components/Button';
import { useConfirm } from '@/components/useConfirm';
import { AdminStatusTag, AdminUrgencyTag } from '@/components/AdminStatusTag';
import { InspectionResultDialog, ResultBadge, type ResultInput } from '@/components/InspectionResult';
import { readApiJson, redirectToLogin, requestError } from '@/lib/clientApi';
import type { AdminInspectionDetail } from '@/app/api/admin/inspections/[id]/route';
import {
  PLAN_STATUS_LABEL,
  VISIT_STATUS_LABEL,
  type PlanView,
  type VisitView,
} from '@/lib/inspectionView';
import {
  type InspectionMethod,
  TIME_SLOT_LABEL,
  formatDateRange,
  formatPhone,
  formatVisitDate,
  formatWon,
  planLabel,
  todayKst,
} from '@/lib/inspection';

// 전기점검 고객 상세 — 고객이 전화했을 때 한 화면에서 답하기 위한 곳.
// 목록(/admin/inspections)은 "지금 처리할 일"만 보이므로, 여기서 전체 회차 이력·결과,
// 고객 정보 수정, 임시 비밀번호 발급, 환불 기록, 같은 번호의 고장 수리 접수를 모아 본다.
// 일정 변경·방식 전환·취소는 일정표에만 둔다 — 같은 조작이 두 곳에 있으면 규칙이 갈라진다.

const STATUS_TONE: Record<PlanView['status'], string> = {
  PENDING_PAYMENT: 'bg-amber-100 text-amber-900',
  ACTIVE: 'bg-brand-50 text-brand-700',
  EXPIRED: 'bg-neutral-100 text-muted',
  CANCELED: 'bg-neutral-100 text-muted',
};

// 점검 방식 배지 — 일정표(admin/inspections/page.tsx)의 MethodBadge 와 같은 모양.
const METHOD_TONE: Record<InspectionMethod, string> = {
  PHONE: 'border border-border bg-white text-muted',
  ONSITE: 'bg-orange-600 text-white',
};
const METHOD_SHORT: Record<InspectionMethod, string> = { PHONE: '전화', ONSITE: '방문' };

const cardClass = 'rounded-admin-md border border-border bg-white p-4';
const cellClass = 'px-3 py-2 align-top text-sm';
const headClass = 'whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-muted';
const fieldClass = 'min-h-11 w-full rounded-admin-md border border-border bg-white px-3 text-sm';

/** ISO 시각 → 한국 달력 날짜. 앞 10자리를 자르면 UTC 날짜가 나와 하루 밀린다. */
function kstDate(iso: string): string {
  return todayKst(new Date(iso));
}

async function send<T>(url: string, method: 'POST' | 'PATCH', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return readApiJson<T>(res);
}

export default function AdminInspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [detail, setDetail] = useState<AdminInspectionDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultFor, setResultFor] = useState<{ visit: VisitView; complete: boolean } | null>(null);
  const [tempPassword, setTempPassword] = useState<{ loginId: string; password: string } | null>(
    null,
  );
  const [confirm, confirmUI] = useConfirm();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/inspections/${id}`, { cache: 'no-store' });
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      setDetail(await readApiJson<AdminInspectionDetail>(res));
      setLoadError(null);
    } catch (e) {
      setLoadError(requestError(e));
    }
  }, [id]);

  useEffect(() => {
    // 마운트 시 한 번 불러온다 — load 안의 setState 는 응답을 받은 뒤에 일어난다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /** 요청 하나를 감싼다 — 바쁨 표시와 오류 문구를 한 곳에서. 성공하면 true. */
  async function run(action: () => Promise<void>): Promise<boolean> {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      return true;
    } catch (e) {
      setActionError(requestError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** 구독 PATCH — 응답이 갱신된 상세라 다시 불러오지 않는다. */
  const patchPlan = (body: Record<string, unknown>) =>
    run(async () => {
      setDetail(await send<AdminInspectionDetail>(`/api/admin/inspections/${id}`, 'PATCH', body));
    });

  async function saveResult(visit: VisitView, complete: boolean, input: ResultInput) {
    await run(async () => {
      await send(`/api/admin/inspections/visits/${visit.id}`, 'PATCH', {
        ...(complete ? { status: 'COMPLETED' } : {}),
        ...input,
      });
      await load();
    });
  }

  async function issueTempPassword() {
    if (!detail) return;
    const ok = await confirm({
      title: '임시 비밀번호 발급',
      message: `먼저 전화한 사람이 고객 본인인지 확인하세요(신청서의 이름·연락처·주소 대조). 발급하면 ${detail.account.loginId} 계정의 지금 비밀번호는 더 이상 쓸 수 없습니다.`,
      confirmText: '본인 확인함 · 발급',
      danger: true,
    });
    if (!ok) return;
    await run(async () => {
      const res = await send<{ loginId: string; tempPassword: string }>(
        `/api/admin/inspections/${id}/reset-password`,
        'POST',
      );
      setTempPassword({ loginId: res.loginId, password: res.tempPassword });
    });
  }

  if (!detail) {
    return (
      <main className="min-h-screen">
        <PageHeader title="전기점검 고객" back="/admin/inspections" width="max-w-6xl" />
        <div className="mx-auto max-w-6xl p-6 text-center text-sm text-muted">
          {notFound ? (
            <>
              <p>구독을 찾을 수 없습니다.</p>
              <Link href="/admin/inspections" className="mt-2 inline-block underline">
                전기점검 목록으로
              </Link>
            </>
          ) : loadError ? (
            <>
              <p role="alert">{loadError}</p>
              <button
                type="button"
                onClick={() => void load()}
                className={buttonClasses('secondary', 'sm', 'mt-3')}
              >
                다시 시도
              </button>
            </>
          ) : (
            '불러오는 중…'
          )}
        </div>
      </main>
    );
  }

  const { plan, account } = detail;
  const today = todayKst();
  // 결과·완료는 서버가 살아 있는(또는 막 끝난) 구독에서만 받는다.
  const canComplete = plan.status === 'ACTIVE' || plan.status === 'EXPIRED';

  return (
    <main className="min-h-screen md:bg-surface">
      <PageHeader
        width="max-w-6xl"
        title={plan.contactName}
        back="/admin/inspections"
        crumbs={[
          { label: '전기점검', href: '/admin/inspections' },
          { label: plan.contactName, href: `/admin/inspections/${id}` },
        ]}
        right={
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[plan.status]}`}
          >
            {PLAN_STATUS_LABEL[plan.status]}
          </span>
        }
      />

      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4">
        {/* 요약 */}
        <section className={`${cardClass} flex flex-wrap gap-x-8 gap-y-2 text-sm`}>
          <div>
            <p className="text-xs text-muted">요금제</p>
            <p className="font-semibold">
              {planLabel(plan.termMonths, plan.priceWon)}
              <span className="ml-1 font-normal text-muted tabular-nums">
                총 {formatWon(plan.priceWon)}
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">이용 기간</p>
            <p className="font-semibold tabular-nums">
              {plan.startDate && plan.endDate
                ? formatDateRange(plan.startDate, plan.endDate)
                : '입금 확인 후 시작'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">신청일</p>
            <p className="font-semibold tabular-nums">{plan.createdDate}</p>
          </div>
          <div>
            <p className="text-xs text-muted">입금 확인</p>
            <p className="font-semibold tabular-nums">
              {plan.paidConfirmedAt ? kstDate(plan.paidConfirmedAt) : '확인 전'}
              {detail.paidConfirmedBy && (
                <span className="ml-1 font-normal text-muted">({detail.paidConfirmedBy})</span>
              )}
            </p>
          </div>
          {plan.status === 'CANCELED' && plan.cancelReason && (
            <div className="w-full">
              <p className="text-xs text-muted">취소 사유</p>
              <p>{plan.cancelReason}</p>
            </div>
          )}
        </section>

        {actionError && (
          <p role="alert" className="rounded-admin-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {actionError}
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <CustomerCard
            plan={plan}
            busy={busy}
            onSave={patchPlan}
          />
          <section className={cardClass} aria-labelledby="account-title">
            <h2 id="account-title" className="text-sm font-bold">
              로그인 계정
            </h2>
            <dl className="mt-3 grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
              <dt className="text-muted">아이디</dt>
              <dd className="font-semibold">{account.loginId}</dd>
              <dt className="text-muted">계정 이름</dt>
              <dd>{account.name}</dd>
              <dt className="text-muted">계정 전화</dt>
              <dd>{account.phone ? formatPhone(account.phone) : '—'}</dd>
              <dt className="text-muted">가입일</dt>
              <dd className="tabular-nums">{kstDate(account.createdAt)}</dd>
            </dl>
            <div className="mt-4 border-t border-border pt-3">
              <button
                type="button"
                disabled={busy}
                onClick={issueTempPassword}
                className={buttonClasses('secondary', 'sm')}
              >
                임시 비밀번호 발급
              </button>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                고객이 비밀번호를 잊었을 때 씁니다. 본인 확인 후 발급하고 전화로 불러 주세요.
                발급한 비밀번호는 저장되지 않아 다시 볼 수 없습니다.
              </p>
            </div>
          </section>
        </div>

        {/* 점검 이력 */}
        <section className={cardClass} aria-labelledby="visits-title">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 id="visits-title" className="text-sm font-bold">
              점검 이력
            </h2>
            <span className="text-xs text-muted">
              전체 {plan.visits.length}건 · 완료 {plan.completedCount}건
            </span>
            <Link
              href="/admin/inspections?tab=schedule"
              className="ml-auto text-sm font-semibold text-admin-cyan-ink underline"
            >
              점검 일정에서 변경 →
            </Link>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs tabular-nums">
            {plan.years.map((y) => (
              <li
                key={y.year}
                className={`rounded-admin-md border px-3 py-2 ${
                  y.isCurrent ? 'border-admin-cyan-ink' : 'border-border'
                }`}
              >
                <p className="font-semibold">
                  {y.year}년차 {y.used}/{y.quota}회
                  <span className="font-normal text-muted">
                    {' '}
                    · 완료 {y.completed} · 남음 {y.remaining}
                  </span>
                  {y.isCurrent && <span className="ml-1 text-admin-cyan-ink">이번 연차</span>}
                </p>
                {y.window && (
                  <p className="text-muted">{formatDateRange(y.window.start, y.window.lastDay)}</p>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3 overflow-x-auto rounded-admin-md border border-border">
            <table className="w-full min-w-[60rem] border-collapse">
              <thead className="border-b border-border bg-neutral-50">
                <tr>
                  <th className={headClass}>회차</th>
                  <th className={headClass}>날짜</th>
                  <th className={headClass}>시간대</th>
                  <th className={headClass}>방식</th>
                  <th className={headClass}>상태</th>
                  <th className={headClass}>결과</th>
                  <th className={headClass}>결과 설명</th>
                  <th className={headClass}>담당 메모</th>
                  <th className={headClass}>처리</th>
                </tr>
              </thead>
              <tbody>
                {plan.visits.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted">
                      아직 잡힌 점검이 없습니다.
                    </td>
                  </tr>
                )}
                {plan.visits.map((visit) => {
                  const canceled = visit.status === 'CANCELED';
                  return (
                    <tr
                      key={visit.id}
                      className={`border-b border-border last:border-0 ${canceled ? 'text-muted' : ''}`}
                    >
                      <td className={`${cellClass} whitespace-nowrap`}>
                        {visit.round}회차
                        <p className="text-xs text-muted">{visit.year}년차</p>
                      </td>
                      <td className={`${cellClass} whitespace-nowrap tabular-nums`}>
                        <span className={canceled ? 'line-through' : ''}>
                          {formatVisitDate(visit.date)}
                        </span>
                        {visit.note && (
                          <p className="max-w-[12rem] whitespace-normal break-keep text-xs text-muted">
                            요청: {visit.note}
                          </p>
                        )}
                      </td>
                      <td className={`${cellClass} whitespace-nowrap`}>
                        {TIME_SLOT_LABEL[visit.timeSlot]}
                      </td>
                      <td className={`${cellClass} whitespace-nowrap text-xs`}>
                        <span
                          className={`whitespace-nowrap rounded-full px-2 py-0.5 font-semibold ${METHOD_TONE[visit.method]}`}
                        >
                          {METHOD_SHORT[visit.method]}
                        </span>
                      </td>
                      <td className={`${cellClass} whitespace-nowrap`}>
                        {VISIT_STATUS_LABEL[visit.status]}
                        {visit.completedAt && (
                          <p className="text-xs text-muted tabular-nums">
                            {kstDate(visit.completedAt)} 처리
                          </p>
                        )}
                      </td>
                      <td className={`${cellClass} whitespace-nowrap`}>
                        {visit.result ? <ResultBadge result={visit.result} /> : '—'}
                      </td>
                      <td className={`${cellClass} min-w-[12rem] max-w-[20rem] whitespace-pre-line break-keep`}>
                        {visit.resultNote ?? ''}
                      </td>
                      <td className={`${cellClass} min-w-[8rem] max-w-[14rem] break-keep text-xs`}>
                        {visit.adminMemo ?? ''}
                      </td>
                      <td className={cellClass}>
                        {visit.status === 'COMPLETED' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setResultFor({ visit, complete: false })}
                            className={buttonClasses('secondary', 'sm', 'whitespace-nowrap')}
                          >
                            {visit.result || visit.resultNote ? '결과 수정' : '결과 기록'}
                          </button>
                        )}
                        {visit.status === 'SCHEDULED' && canComplete && visit.date <= today && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setResultFor({ visit, complete: true })}
                            className={buttonClasses('primary', 'sm', 'whitespace-nowrap')}
                          >
                            완료 처리
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <RefundCard plan={plan} busy={busy} onSave={patchPlan} confirm={confirm} />

        {/* 같은 번호 고장 수리 접수 */}
        <section className={cardClass} aria-labelledby="repairs-title">
          <h2 id="repairs-title" className="text-sm font-bold">
            같은 번호 고장 수리 접수
            <span className="ml-2 text-xs font-normal text-muted">
              신청 연락처·계정 전화번호 기준, 최근 20건
            </span>
          </h2>
          {detail.repairs.length === 0 ? (
            <p className="mt-3 text-sm text-muted">같은 번호로 들어온 고장 수리 접수가 없습니다.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {detail.repairs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start gap-3 py-3 text-sm">
                  <div className="flex shrink-0 items-center gap-1.5">
                    <AdminStatusTag status={r.status} />
                    <AdminUrgencyTag urgency={r.urgency} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 break-keep">{r.description}</p>
                    <p className="mt-0.5 text-xs text-muted tabular-nums">
                      {kstDate(r.createdAt)} 접수 · {r.lookupCode}
                      {r.address ? ` · ${r.address}` : ''}
                    </p>
                  </div>
                  <Link
                    href={`/admin/requests/${encodeURIComponent(r.id)}`}
                    className="shrink-0 text-sm font-semibold text-admin-cyan-ink underline"
                  >
                    접수 상세
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 이전·다른 구독 */}
        <section className={cardClass} aria-labelledby="other-plans-title">
          <h2 id="other-plans-title" className="text-sm font-bold">
            이전·다른 구독
          </h2>
          {detail.otherPlans.length === 0 ? (
            <p className="mt-3 text-sm text-muted">같은 계정의 다른 구독이 없습니다.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {detail.otherPlans.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[p.status]}`}
                  >
                    {PLAN_STATUS_LABEL[p.status]}
                  </span>
                  <span className="font-semibold">
                    {planLabel(p.termMonths, p.priceWon)}
                    <span className="ml-1 font-normal text-muted tabular-nums">
                      {formatWon(p.priceWon)}
                    </span>
                  </span>
                  <span className="text-muted tabular-nums">
                    {p.startDate && p.endDate
                      ? formatDateRange(p.startDate, p.endDate)
                      : `${kstDate(p.createdAt)} 신청`}
                  </span>
                  <Link
                    href={`/admin/inspections/${p.id}`}
                    className="ml-auto font-semibold text-admin-cyan-ink underline"
                  >
                    상세 보기
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {confirmUI}
      {resultFor && (
        <InspectionResultDialog
          title={
            resultFor.complete
              ? `${resultFor.visit.round}회차 점검 완료`
              : `${resultFor.visit.round}회차 점검 결과`
          }
          description={
            resultFor.complete
              ? `${formatVisitDate(resultFor.visit.date)} 점검을 완료 처리합니다. 통화·방문 결과를 함께 남길 수 있습니다.`
              : `${formatVisitDate(resultFor.visit.date)} 점검의 결과를 기록합니다.`
          }
          confirmText={resultFor.complete ? '완료 처리' : '결과 저장'}
          initial={{ result: resultFor.visit.result, resultNote: resultFor.visit.resultNote }}
          onClose={() => setResultFor(null)}
          onSubmit={async (input) => {
            const { visit, complete } = resultFor;
            setResultFor(null);
            await saveResult(visit, complete, input);
          }}
        />
      )}
      {tempPassword && (
        <TempPasswordDialog
          loginId={tempPassword.loginId}
          password={tempPassword.password}
          onClose={() => setTempPassword(null)}
        />
      )}
    </main>
  );
}

/** 방문지 연락처·주소·요청 사항. 읽기 모드가 기본이고 "수정"을 눌러야 입력란이 열린다. */
function CustomerCard({
  plan,
  busy,
  onSave,
}: {
  plan: PlanView;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    contactName: '',
    contactPhone: '',
    address: '',
    addressDetail: '',
    memo: '',
  });

  function startEdit() {
    // 열 때마다 서버의 현재 값으로 시작한다 — 낡은 값을 도로 저장하지 않게.
    setForm({
      contactName: plan.contactName,
      contactPhone: plan.contactPhone,
      address: plan.address,
      addressDetail: plan.addressDetail ?? '',
      memo: plan.memo ?? '',
    });
    setEditing(true);
  }

  async function save() {
    // 바뀐 칸만 보낸다 — 주소를 보내면 서버가 좌표를 지우므로 그대로인 주소는 보내지 않는다.
    const before = {
      contactName: plan.contactName,
      contactPhone: plan.contactPhone,
      address: plan.address,
      addressDetail: plan.addressDetail ?? '',
      memo: plan.memo ?? '',
    };
    const body = Object.fromEntries(
      (Object.keys(form) as (keyof typeof form)[])
        .filter((k) => form[k].trim() !== before[k])
        .map((k) => [k, form[k]]),
    );
    if (Object.keys(body).length === 0) {
      setEditing(false);
      return;
    }
    if (await onSave(body)) setEditing(false);
  }

  const field = (
    key: keyof typeof form,
    label: string,
    opts: { maxLength: number; type?: string; multiline?: boolean },
  ) => (
    <div>
      <label htmlFor={`customer-${key}`} className="mb-1 block text-xs font-semibold text-muted">
        {label}
      </label>
      {opts.multiline ? (
        <textarea
          id={`customer-${key}`}
          value={form[key]}
          maxLength={opts.maxLength}
          rows={3}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className="w-full rounded-admin-md border border-border p-3 text-sm"
        />
      ) : (
        <input
          id={`customer-${key}`}
          type={opts.type ?? 'text'}
          value={form[key]}
          maxLength={opts.maxLength}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className={fieldClass}
        />
      )}
    </div>
  );

  return (
    <section className={cardClass} aria-labelledby="customer-title">
      <div className="flex items-center gap-2">
        <h2 id="customer-title" className="text-sm font-bold">
          고객 정보
        </h2>
        {!editing && (
          <button
            type="button"
            disabled={busy}
            onClick={startEdit}
            className={buttonClasses('secondary', 'sm', 'ml-auto')}
          >
            수정
          </button>
        )}
      </div>
      {!editing ? (
        <dl className="mt-3 grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
          <dt className="text-muted">이름</dt>
          <dd className="font-semibold">{plan.contactName}</dd>
          <dt className="text-muted">연락처</dt>
          <dd>
            <a href={`tel:${plan.contactPhone}`} className="underline">
              {formatPhone(plan.contactPhone)}
            </a>
          </dd>
          <dt className="text-muted">점검 주소</dt>
          <dd className="break-keep">
            {plan.address}
            {plan.addressDetail ? ` ${plan.addressDetail}` : ''}
          </dd>
          <dt className="text-muted">입금자명</dt>
          <dd>{plan.depositorName}</dd>
          <dt className="text-muted">요청 사항</dt>
          <dd className="whitespace-pre-line break-keep">{plan.memo || '—'}</dd>
        </dl>
      ) : (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {field('contactName', '이름', { maxLength: 50 })}
            {field('contactPhone', '연락처', { maxLength: 20, type: 'tel' })}
          </div>
          {field('address', '점검 주소', { maxLength: 200 })}
          {field('addressDetail', '상세주소', { maxLength: 100 })}
          {field('memo', '요청 사항', { maxLength: 500, multiline: true })}
          <p className="text-xs text-muted">
            바꾼 연락처·주소는 이후 점검 전화·문자·방문에 쓰입니다. 고객에게 따로 알림이 가지 않습니다.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(false)}
              className={buttonClasses('secondary', 'sm')}
            >
              취소
            </button>
            <button type="submit" disabled={busy} className={buttonClasses('primary', 'sm')}>
              {busy ? '저장 중…' : '저장'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/** 입금·환불. 환불은 기록일 뿐 돈을 돌려보내지 않는다 — 이체는 관리자가 따로 한다. */
function RefundCard({
  plan,
  busy,
  onSave,
  confirm,
}: {
  plan: PlanView;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
  confirm: ReturnType<typeof useConfirm>[0];
}) {
  const [won, setWon] = useState('');
  const [note, setNote] = useState('');
  const paid = plan.paidConfirmedAt != null;
  const amount = Number(won);
  const issue =
    won === ''
      ? null
      : !Number.isInteger(amount) || amount <= 0
        ? '환불 금액은 0보다 큰 원 단위 정수로 입력해 주세요.'
        : amount > plan.priceWon
          ? `입금액(${formatWon(plan.priceWon)})보다 클 수 없습니다.`
          : null;

  async function record() {
    if (won === '' || issue) return;
    if (await onSave({ refund: { won: amount, note: note.trim() || null } })) {
      setWon('');
      setNote('');
    }
  }

  async function remove() {
    const ok = await confirm({
      title: '환불 기록 삭제',
      message: '잘못 입력한 환불 기록을 지웁니다. 실제 이체는 되돌려지지 않습니다.',
      confirmText: '기록 삭제',
      danger: true,
    });
    if (ok) await onSave({ refund: null });
  }

  return (
    <section className={cardClass} aria-labelledby="refund-title">
      <h2 id="refund-title" className="text-sm font-bold">
        입금·환불
      </h2>
      <dl className="mt-3 grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
        <dt className="text-muted">입금액</dt>
        <dd className="font-semibold tabular-nums">{formatWon(plan.priceWon)}</dd>
        <dt className="text-muted">입금자명</dt>
        <dd>{plan.depositorName}</dd>
        <dt className="text-muted">입금 확인</dt>
        <dd className="tabular-nums">
          {plan.paidConfirmedAt ? kstDate(plan.paidConfirmedAt) : '확인 전'}
        </dd>
      </dl>

      <div className="mt-4 border-t border-border pt-3">
        {plan.refund ? (
          <div className="flex flex-wrap items-start gap-3 rounded-admin-md bg-neutral-50 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                환불 {formatWon(plan.refund.won)}
                <span className="ml-2 text-xs font-normal text-muted tabular-nums">
                  {kstDate(plan.refund.at)} 기록
                </span>
              </p>
              {plan.refund.note && (
                <p className="mt-1 whitespace-pre-line break-keep text-muted">{plan.refund.note}</p>
              )}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className={buttonClasses('secondary', 'sm', 'whitespace-nowrap')}
            >
              기록 삭제
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void record();
            }}
          >
            <fieldset disabled={!paid || busy} className="flex flex-wrap items-end gap-2">
              <legend className="mb-2 text-xs font-semibold text-muted">환불 기록</legend>
              <div>
                <label htmlFor="refund-won" className="mb-1 block text-xs text-muted">
                  환불 금액(원)
                </label>
                <input
                  id="refund-won"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={plan.priceWon}
                  step={1}
                  value={won}
                  onChange={(e) => setWon(e.target.value)}
                  aria-describedby="refund-issue"
                  className={`${fieldClass} w-40`}
                />
              </div>
              <div className="min-w-[14rem] flex-1">
                <label htmlFor="refund-note" className="mb-1 block text-xs text-muted">
                  메모 (선택)
                </label>
                <input
                  id="refund-note"
                  value={note}
                  maxLength={300}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="예) 3회 이용 후 해지, 잔여분 환불"
                  className={fieldClass}
                />
              </div>
              <button
                type="submit"
                disabled={won === '' || issue != null}
                className={buttonClasses('primary', 'sm', 'whitespace-nowrap')}
              >
                환불 기록
              </button>
            </fieldset>
            <p id="refund-issue" role="status" className="mt-1 min-h-5 text-xs text-red-700">
              {issue}
            </p>
            <p className="text-xs text-muted">
              {paid
                ? '이체는 따로 하고, 보낸 금액을 여기 기록해 두세요. 고객 화면에는 보이지 않습니다.'
                : '입금 확인 전인 구독에는 환불을 기록할 수 없습니다.'}
            </p>
          </form>
        )}
      </div>
    </section>
  );
}

/** 발급한 임시 비밀번호 — 이 창을 닫으면 다시 볼 수 없다. */
function TempPasswordDialog({
  loginId,
  password,
  onClose,
}: {
  loginId: string;
  password: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);

  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
  }

  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby="temp-password-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md overflow-visible rounded-2xl border-0 bg-transparent p-0 text-fg backdrop:bg-slate-900/40"
    >
      <div className="rounded-2xl bg-white p-6 shadow-pop">
        <h2 id="temp-password-title" className="text-base font-bold">
          임시 비밀번호를 발급했습니다
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          고객에게 전화로 불러 주고, 로그인 후 마이페이지에서 비밀번호를 바꾸도록 안내하세요. 이
          창을 닫으면 다시 볼 수 없습니다.
        </p>
        <dl className="mt-4 grid grid-cols-[5rem_1fr] items-center gap-y-2 text-sm">
          <dt className="text-muted">아이디</dt>
          <dd className="font-semibold">{loginId}</dd>
          <dt className="text-muted">임시 비밀번호</dt>
          <dd className="flex items-center gap-2">
            <code className="rounded-admin-md bg-neutral-100 px-3 py-2 font-mono text-lg font-bold tracking-wider">
              {password}
            </code>
            <button
              type="button"
              onClick={copy}
              className={buttonClasses('secondary', 'sm', 'whitespace-nowrap')}
            >
              복사
            </button>
          </dd>
        </dl>
        <p role="status" className="mt-2 min-h-5 text-xs text-muted">
          {copied === 'ok' && '복사했습니다.'}
          {copied === 'fail' && '복사하지 못했습니다. 화면을 보고 불러 주세요.'}
        </p>
        <button
          type="button"
          onClick={onClose}
          className={buttonClasses('primary', 'md', 'mt-3 w-full')}
        >
          확인했습니다
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
