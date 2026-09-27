'use client';

import Link from 'next/link';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import LocationPicker, { type LocationValue } from '@/components/LocationPicker';
import PasswordInput from '@/components/PasswordInput';
import BankAccountCard from '@/components/BankAccountCard';
import InspectionCalendar, { SelectedDateLine } from '@/components/InspectionCalendar';
import InspectionTimeSlotPicker from '@/components/InspectionTimeSlotPicker';
import { buttonClasses } from '@/components/Button';
import { requestError } from '@/lib/clientApi';
import type { PublicBankAccount } from '@/lib/inspectionAccount';
import {
  INSPECTION_MIN_LEAD_DAYS,
  INSPECTION_PRICE_WON,
  INSPECTION_VISITS_PER_TERM,
  type TimeSlot,
  addDays,
  applyDateIssue,
  applyLatestDate,
  formatDate,
  formatPhone,
  formatWon,
  isDateString,
  todayKst,
} from '@/lib/inspection';

const inputClass =
  'w-full rounded-xl border border-border p-3 text-base transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none';

/** 입력란 바로 아래의 오류 문구. 제출 버튼 옆에만 띄우면 위쪽 입력란으로 스크롤된 사용자는 못 본다. */
function FieldError({ id, children }: { id: string; children: string | undefined }) {
  if (!children) return null;
  return (
    <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-700">
      {children}
    </p>
  );
}

/** 서버가 오류를 특정 입력란에 돌려줄 때 쓰는 이름 → 화면의 입력란 id. */
const SERVER_FIELD: Record<string, string> = {
  loginId: 'ins-loginId',
  preferredDate: 'ins-date',
  phone: 'ins-phone',
};

/** 화면 위에서 아래 순서. 여러 입력란이 틀렸을 때 포커스는 이 순서의 첫 오류로만 간다. */
const FIELD_ORDER = [
  'ins-name',
  'ins-phone',
  'ins-address',
  'ins-date',
  'ins-loginId',
  'ins-password',
  'ins-passwordConfirm',
  'ins-agree',
] as const;

type FieldErrors = Partial<Record<string, string>>;

const PASSWORD_MISMATCH = '비밀번호가 서로 달라요';

/** 아이디 자동 확인 결과. value 는 확인한 아이디(앞뒤 공백 제거) — 입력이 바뀌면 결과가 저절로 무효가 된다. */
type LoginIdCheck = {
  value: string;
  state: 'checking' | IdCheckResult;
  message?: string;
};

/** 한 번의 아이디 확인이 끝났을 때의 판정. */
type IdCheckResult = 'available' | 'taken' | 'error';

export type ApplyPrefill = {
  name: string;
  phone: string;
  address: string;
  addressDetail: string;
};

export default function ApplyForm({
  account,
  renewal = false,
  prefill = null,
}: {
  account: PublicBankAccount | null;
  /** 이미 로그인한 고객의 갱신 신청 — 계정을 새로 만들지 않는다. */
  renewal?: boolean;
  prefill?: ApplyPrefill | null;
}) {
  const router = useRouter();
  // 날짜 경계는 서버 검증(applyDateIssue)과 같은 함수로 계산한다 — 화면이 허용한 날짜를
  // 서버가 거절하는 어긋남이 생기지 않게.
  const today = todayKst();
  const minDate = addDays(today, INSPECTION_MIN_LEAD_DAYS);
  const maxDate = applyLatestDate(today);

  const [name, setName] = useState(prefill?.name ?? '');
  const [phone, setPhone] = useState(prefill?.phone ?? '');
  const [location, setLocation] = useState<LocationValue>({
    lat: null,
    lng: null,
    address: prefill?.address ?? '',
  });
  const [addressDetail, setAddressDetail] = useState(prefill?.addressDetail ?? '');
  const [preferredDate, setPreferredDate] = useState('');
  const [timeSlot, setTimeSlot] = useState<TimeSlot>('ANY');
  const [memo, setMemo] = useState('');
  const [depositorName, setDepositorName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [idCheck, setIdCheck] = useState<LoginIdCheck | null>(null);
  // 진행 중인 아이디 확인 — 자동 확인·버튼·제출 게이트가 같은 요청을 함께 기다린다.
  const idInflight = useRef<{ value: string; promise: Promise<IdCheckResult> } | null>(null);
  // 제출 게이트가 확인을 기다리는 사이 아이디를 바꿨는지 알아보려고 최신 입력을 따로 둔다.
  const latestLoginId = useRef('');
  const [password, setPassword] = useState('');
  // 확인 값은 서버로 보내지 않는다 — 오타로 모르는 비밀번호가 만들어지는 것만 막는다.
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [agreed, setAgreed] = useState(false);
  // 입력란별 오류. 문구는 그 입력란 아래에 뜨고(FieldError), 서버 오류처럼 특정 입력란에
  // 속하지 않는 것만 제출 버튼 위(formError)에 뜬다 — tech/signup 과 같은 문법.
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmedLoginId = loginId.trim();
  // 지금 입력된 아이디에 대한 확인 결과만 유효하다.
  const idStatus = idCheck?.value === trimmedLoginId ? idCheck : null;

  /** 오류를 전부 표시하고, 포커스는 화면 순서상 첫 오류 입력란으로만 보낸다. */
  function showErrors(next: FieldErrors) {
    setErrors(next);
    const first = FIELD_ORDER.find((id) => next[id]);
    if (!first) return;
    const el = document.getElementById(first);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
  }

  /** 고친 입력란의 오류는 바로 지운다 — 다른 입력란의 오류는 남겨 둔다. */
  function clearError(id: string) {
    setErrors((prev) => {
      if (!prev[id]) return prev;
      const rest = { ...prev };
      delete rest[id];
      return rest;
    });
  }

  /** 비밀번호·확인 칸 중 하나를 고치면 "서로 달라요" 오류는 지운다(비어 있음 오류는 확인 칸에서만 지운다). */
  function clearMismatch() {
    setErrors((prev) => {
      if (prev['ins-passwordConfirm'] !== PASSWORD_MISMATCH) return prev;
      const rest = { ...prev };
      delete rest['ins-passwordConfirm'];
      return rest;
    });
  }

  /** 입력란에 붙이는 오류 연결 속성. */
  const errorProps = (id: string) => ({
    'aria-invalid': errors[id] ? true : undefined,
    'aria-describedby': errors[id] ? `${id}-error` : undefined,
  });

  // ── 아이디 확인 ── 입력을 멈추고 500ms 뒤, 입력란을 벗어날 때, "중복 확인" 버튼을 누를 때
  // 확인한다. 제출할 때 아직 'available' 이 아니면 submit 이 한 번 더 확인한 뒤에 진행한다.
  // 결과를 돌려주므로 제출 게이트가 await 로 판정을 받는다(확인 자체는 throw 하지 않는다).
  async function checkLoginId(
    target: string,
    { force = false }: { force?: boolean } = {},
  ): Promise<IdCheckResult | null> {
    if (renewal || target.length < 3) return null;
    // 같은 아이디를 확인하는 중이면 새로 묻지 않고 그 결과를 함께 기다린다.
    const inflight = idInflight.current;
    if (inflight?.value === target) return inflight.promise;
    // 같은 아이디를 이미 확인했으면 다시 묻지 않는다(실패했거나 버튼으로 강제할 때만 재확인).
    if (
      !force &&
      idCheck?.value === target &&
      (idCheck.state === 'available' || idCheck.state === 'taken')
    )
      return idCheck.state;
    setIdCheck({ value: target, state: 'checking' });
    const promise = (async (): Promise<IdCheckResult> => {
      try {
        const res = await fetch(
          `/api/auth/check-login-id?loginId=${encodeURIComponent(target)}`,
          { signal: AbortSignal.timeout(15_000) },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'check failed');
        const state: IdCheckResult = data.available ? 'available' : 'taken';
        // 응답을 기다리는 사이 다른 아이디로 바꿨다면 화면 표시는 건드리지 않는다.
        setIdCheck((prev) => (prev?.value === target ? { value: target, state } : prev));
        return state;
      } catch {
        setIdCheck((prev) =>
          prev?.value === target
            ? { value: target, state: 'error', message: '확인에 실패했어요. 다시 눌러 주세요.' }
            : prev,
        );
        return 'error';
      }
    })();
    idInflight.current = { value: target, promise };
    try {
      return await promise;
    } finally {
      if (idInflight.current?.promise === promise) idInflight.current = null;
    }
  }

  /** "중복 확인" 버튼 — 이미 확인한 아이디여도 즉시 다시 묻는다. */
  function onCheckLoginIdClick() {
    if (trimmedLoginId.length < 3) {
      setErrors((prev) => ({ ...prev, 'ins-loginId': '아이디를 3자 이상 입력해 주세요' }));
      return;
    }
    clearError('ins-loginId');
    void checkLoginId(trimmedLoginId, { force: true });
  }
  const onLoginIdSettled = useEffectEvent((target: string) => {
    void checkLoginId(target);
  });
  useEffect(() => {
    if (renewal || trimmedLoginId.length < 3) return;
    const timer = setTimeout(() => onLoginIdSettled(trimmedLoginId), 500);
    return () => clearTimeout(timer);
  }, [renewal, trimmedLoginId]);

  /** 제출 전 검사 — 첫 오류에서 멈추지 않고 모든 입력란을 본다. */
  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!name.trim()) next['ins-name'] = '이름을 입력해 주세요';
    if (!/^0\d{8,10}$/.test(phone.replace(/\D/g, '')))
      next['ins-phone'] = '전화번호를 확인해 주세요';
    if (!location.address.trim()) next['ins-address'] = '점검받을 주소를 입력해 주세요';
    if (!isDateString(preferredDate)) next['ins-date'] = '1회차 희망 날짜를 선택해 주세요';
    else {
      const dateIssue = applyDateIssue(preferredDate, today);
      if (dateIssue) next['ins-date'] = dateIssue;
    }
    if (!renewal) {
      if (trimmedLoginId.length < 3) next['ins-loginId'] = '아이디를 3자 이상 입력해 주세요';
      else if (idStatus?.state === 'taken')
        next['ins-loginId'] = '이미 사용 중이에요. 다른 아이디를 입력해 주세요.';
      if (password.length < 8) next['ins-password'] = '비밀번호를 8자 이상 입력해 주세요';
      // 서버 스키마(api/inspection/apply)의 password 상한과 같다.
      else if (password.length > 72) next['ins-password'] = '비밀번호는 72자 이내로 입력해 주세요';
      if (!passwordConfirm) next['ins-passwordConfirm'] = '비밀번호를 한 번 더 입력해 주세요';
      else if (passwordConfirm !== password) next['ins-passwordConfirm'] = PASSWORD_MISMATCH;
    }
    if (!agreed) next['ins-agree'] = '개인정보 수집·이용에 동의해 주세요';
    return next;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setFormError(null);

    const found = validate();
    showErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    // ── 아이디 확인 게이트 ── 'available' 로 확인된 아이디만 보낸다. 확인 전·실패·확인 중이면
    // 여기서 한 번(확인 중이면 그 요청을) 기다려 판정한다. taken 은 validate 가 이미 막았다.
    if (!renewal && idStatus?.state !== 'available') {
      const target = trimmedLoginId;
      const result = await checkLoginId(target);
      if (latestLoginId.current.trim() !== target) {
        // 기다리는 사이 아이디를 바꿨다 — 바뀐 아이디로 다시 누르게 한다.
        setBusy(false);
        return;
      }
      if (result !== 'available') {
        setBusy(false);
        showErrors({
          'ins-loginId':
            result === 'taken'
              ? '이미 사용 중이에요. 다른 아이디를 입력해 주세요.'
              : '아이디 확인에 실패했어요. 다시 시도해 주세요.',
        });
        return;
      }
    }
    // 성공(또는 로그인 화면으로 보내는) 경로에서는 버튼을 다시 풀지 않는다 — 화면이 넘어가는
    // 동안 "신청 중…"이 유지돼야 두 번 누르지 않는다.
    let leaving = false;
    try {
      const res = await fetch('/api/inspection/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          // 갱신은 세션의 계정을 그대로 쓴다 — 서버가 CUSTOMER 세션을 보고 분기한다.
          ...(renewal ? {} : { loginId: loginId.trim(), password }),
          name: name.trim(),
          phone,
          address: location.address.trim(),
          addressDetail: addressDetail.trim() || null,
          preferredDate,
          timeSlot,
          memo: memo.trim() || null,
          depositorName: depositorName.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        // 갱신 신청 중 세션이 끊겼다 — 다시 로그인하게 한다.
        leaving = true;
        router.replace(`/my/login?returnTo=${encodeURIComponent('/inspection/apply')}`);
        return;
      }
      if (!res.ok) {
        const message: string = data.error ?? '신청하지 못했습니다. 잠시 후 다시 시도해 주세요.';
        const target =
          typeof data.field === 'string' && Object.hasOwn(SERVER_FIELD, data.field)
            ? SERVER_FIELD[data.field]
            : undefined;
        if (data.field === 'loginId' && res.status === 409) {
          // 확인 뒤에 다른 사람이 먼저 가져간 경우 — "사용할 수 있어요" 표시를 거둔다.
          setIdCheck({ value: trimmedLoginId, state: 'taken' });
        }
        // 갱신 신청처럼 해당 입력란이 화면에 없으면 공통 오류로 보여 준다.
        if (target && document.getElementById(target)) showErrors({ [target]: message });
        else setFormError(message);
        return;
      }
      // 신청 직후 자동 로그인된 상태(또는 재시도가 기존 신청으로 처리됨, resumed) —
      // 입금 안내가 있는 마이페이지로 보낸다.
      leaving = true;
      router.replace('/my');
    } catch (err) {
      setFormError(requestError(err));
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  const loginIdError = errors['ins-loginId'];
  const loginIdInvalid = !!loginIdError || idStatus?.state === 'taken' || idStatus?.state === 'error';
  const loginIdFeedback =
    loginIdError ??
    (idStatus?.state === 'checking'
      ? '확인 중…'
      : idStatus?.state === 'available'
        ? '사용할 수 있는 아이디예요 ✓'
        : idStatus?.state === 'taken'
          ? '이미 사용 중이에요'
          : idStatus?.state === 'error'
            ? (idStatus.message ?? '확인에 실패했어요. 다시 눌러 주세요.')
            : '3자 이상 입력하면 바로 확인해 드려요. 중복 확인을 눌러도 돼요.');
  const idChecking = idStatus?.state === 'checking';

  return (
    <main className="min-h-screen pb-28 md:pb-12">
      <PageHeader title="정기 전기점검 신청" back="/inspection" />

      <form onSubmit={submit} className="mx-auto w-full max-w-2xl space-y-5 px-5 py-5">
        <section className="rounded-2xl bg-gradient-to-br from-brand-50 via-white to-brand-100/50 p-5">
          <p className="text-xs font-bold text-brand-600">신청 내용 확인</p>
          <p className="mt-1 text-lg font-extrabold text-fg">
            연 {formatWon(INSPECTION_PRICE_WON)} · 분기마다 1회 · 1년 {INSPECTION_VISITS_PER_TERM}회
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            아래 내용을 남기시면 입금 계좌를 안내해 드립니다. 입금이 확인된 날부터 1년이
            시작되고, 그날을 기준으로 분기가 나뉩니다.
          </p>
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-white p-5">
          <h2 className="font-bold text-fg">1. 점검받을 곳</h2>
          <div>
            <label htmlFor="ins-name" className="mb-1 block text-sm font-medium">
              이름
            </label>
            <input
              id="ins-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearError('ins-name');
              }}
              maxLength={50}
              autoComplete="name"
              className={inputClass}
              placeholder="예) 홍길동"
              {...errorProps('ins-name')}
            />
            <FieldError id="ins-name">{errors['ins-name']}</FieldError>
          </div>
          <div>
            <label htmlFor="ins-phone" className="mb-1 block text-sm font-medium">
              전화번호
            </label>
            <input
              id="ins-phone"
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                clearError('ins-phone');
              }}
              // 입력을 마치면 하이픈 표기로 정리한다 — 번호를 눈으로 다시 확인하기 쉽게.
              onBlur={() => setPhone((v) => formatPhone(v.replace(/\D/g, '')) || v)}
              inputMode="tel"
              autoComplete="tel"
              className={inputClass}
              placeholder="예) 010-1234-5678"
              {...errorProps('ins-phone')}
            />
            <FieldError id="ins-phone">{errors['ins-phone']}</FieldError>
            <p className="mt-1 text-xs text-muted">
              방문 전 연락과 입금 확인 안내를 이 번호로 보내드립니다.
            </p>
          </div>
          <div>
            <label htmlFor="ins-address" className="mb-1 block text-sm font-medium">
              주소
            </label>
            <LocationPicker
              value={location}
              onChange={(next) => {
                setLocation(next);
                clearError('ins-address');
              }}
              inputId="ins-address"
              // 서버 스키마(api/inspection/apply)의 address 상한과 같다.
              maxLength={200}
              invalid={!!errors['ins-address']}
              describedBy={errors['ins-address'] ? 'ins-address-error' : undefined}
            />
            <FieldError id="ins-address">{errors['ins-address']}</FieldError>
          </div>
          <div>
            <label htmlFor="ins-address-detail" className="mb-1 block text-sm font-medium">
              상세 주소 <span className="font-normal text-muted">(선택)</span>
            </label>
            <input
              id="ins-address-detail"
              value={addressDetail}
              onChange={(e) => setAddressDetail(e.target.value)}
              maxLength={100}
              className={inputClass}
              placeholder="예) 101동 1203호"
            />
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-white p-5">
          <h2 className="font-bold text-fg">2. 1회차 방문 희망일</h2>
          <div>
            {/* 달력에는 라벨을 <label htmlFor> 로 걸지 않는다 — 대상이 입력란이 아니라 격자라,
                격자 자체의 aria-label(label prop)이 이름을 맡는다. */}
            <p className="mb-1 text-sm font-medium">희망 날짜</p>
            <p className="mb-2 text-xs text-muted">
              {formatDate(minDate)}부터 {formatDate(maxDate)} 사이에서 고를 수 있어요. 날짜별 예약
              인원 제한은 없습니다.
            </p>
            {/* 변경 잠금 규칙(bookingBlock 의 VISIT_IMMINENT)과 같은 상수를 쓴다. */}
            <p className="mb-2 text-xs text-muted">
              정한 날짜는 방문 {INSPECTION_MIN_LEAD_DAYS}일 전까지 마이페이지에서 직접 바꿀 수 있어요.
            </p>
            {/* 모바일에서 날짜 칸이 44px 이상 되도록 달력을 카드 안쪽 여백까지 넓힌다. */}
            <div className="-mx-3 sm:mx-0">
              <InspectionCalendar
                id="ins-date"
                label="1회차 방문 희망일"
                value={preferredDate}
                onChange={(date) => {
                  setPreferredDate(date);
                  clearError('ins-date');
                }}
                min={minDate}
                max={maxDate}
                invalid={!!errors['ins-date']}
                describedBy={errors['ins-date'] ? 'ins-date-error' : undefined}
              />
            </div>
            <FieldError id="ins-date">{errors['ins-date']}</FieldError>
            <SelectedDateLine
              date={preferredDate}
              earliest={minDate}
              onPickEarliest={() => {
                setPreferredDate(minDate);
                clearError('ins-date');
              }}
            />
          </div>
          <InspectionTimeSlotPicker name="ins-slot" value={timeSlot} onChange={setTimeSlot} />
          <div>
            <label htmlFor="ins-memo" className="mb-1 block text-sm font-medium">
              요청사항 <span className="font-normal text-muted">(선택)</span>
            </label>
            <textarea
              id="ins-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={500}
              rows={3}
              className={inputClass}
              placeholder="예) 평일 오전만 가능해요 / 주차 공간이 없어요"
            />
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-white p-5">
          <h2 className="font-bold text-fg">3. 입금 정보</h2>
          <BankAccountCard account={account} amountWon={INSPECTION_PRICE_WON} />
          <div>
            <label htmlFor="ins-depositor" className="mb-1 block text-sm font-medium">
              입금자명 <span className="font-normal text-muted">(이름과 다를 때만)</span>
            </label>
            <input
              id="ins-depositor"
              value={depositorName}
              onChange={(e) => setDepositorName(e.target.value)}
              maxLength={50}
              className={inputClass}
              placeholder={name.trim() || '입금하실 분의 이름'}
            />
            <p className="mt-1 text-xs text-muted">
              비워 두면 위에 적은 이름으로 입금된 것을 찾습니다.
            </p>
          </div>
        </section>

        {renewal ? (
          <section className="rounded-2xl border border-border bg-white p-5">
            <h2 className="font-bold text-fg">4. 로그인 정보</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              로그인된 계정으로 갱신 신청합니다. 아이디·비밀번호를 다시 입력하지 않아도 돼요.
            </p>
          </section>
        ) : (
          <section className="space-y-4 rounded-2xl border border-border bg-white p-5">
            <h2 className="font-bold text-fg">4. 로그인 정보</h2>
            <p className="text-sm leading-relaxed text-muted">
              2·3·4회차 방문 날짜를 직접 고르시려면 계정이 필요합니다. 신청하면 바로 로그인됩니다.
            </p>
            {/* 이미 계정이 있는 고객이 같은 전화번호로 계정을 하나 더 만들지 않도록 길을 낸다.
                로그인하면 /my 가 상태에 맞는 다음 행동(다시 신청하기 등)을 보여 준다. */}
            <p className="text-sm text-muted">
              이미 계정이 있으신가요?{' '}
              <Link href="/my/login" className="font-semibold text-brand-700 underline">
                로그인하기
              </Link>
            </p>
            {/* 아이디는 입력을 멈추면 저절로 확인하고, "중복 확인" 버튼으로 바로 확인할 수도 있다.
                피드백 문구 한 줄이 안내·확인 결과·오류를 모두 맡아, FieldError 를 따로 달지 않는다.
                공용 LoginIdCheckField 는 자동 확인·제출 게이트가 없어 쓰지 않는다. */}
            <div className="space-y-1">
              <label htmlFor="ins-loginId" className="block text-sm font-medium">
                로그인 아이디
              </label>
              <div className="flex gap-2">
                <input
                  id="ins-loginId"
                  type="text"
                  value={loginId}
                  onChange={(e) => {
                    latestLoginId.current = e.target.value;
                    setLoginId(e.target.value);
                    // 값을 바꾸면 이전 확인 결과를 버린다.
                    setIdCheck(null);
                    clearError('ins-loginId');
                  }}
                  onBlur={() => void checkLoginId(trimmedLoginId)}
                  aria-invalid={loginIdInvalid || undefined}
                  aria-describedby="ins-loginId-error"
                  placeholder="3자 이상"
                  autoComplete="username"
                  // 서버 스키마의 loginId 상한과 같다.
                  maxLength={30}
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <button
                  type="button"
                  onClick={onCheckLoginIdClick}
                  disabled={idChecking || busy}
                  aria-describedby="ins-loginId-error"
                  className={buttonClasses('secondary', 'md', 'min-h-11 shrink-0 rounded-xl text-sm')}
                >
                  {idChecking ? '확인 중…' : '중복 확인'}
                </button>
              </div>
              <p
                id="ins-loginId-error"
                role={loginIdInvalid ? 'alert' : 'status'}
                className={`text-sm ${
                  loginIdInvalid
                    ? 'text-red-700'
                    : idStatus?.state === 'available'
                      ? 'text-emerald-800'
                      : 'text-muted'
                }`}
              >
                {loginIdFeedback}
              </p>
            </div>
            <div>
              <PasswordInput
                id="ins-password"
                value={password}
                onChange={(v) => {
                  setPassword(v);
                  clearError('ins-password');
                  clearMismatch();
                }}
                className={inputClass}
                placeholder="8자 이상"
                autoComplete="new-password"
                error={errors['ins-password']}
              />
              {/* 서버 규칙(8~72자)만 안내한다 — 그 이상의 조합 규칙은 요구하지 않는다.
                  오류가 뜨면 오류 문구가 같은 자리를 맡는다. */}
              {!errors['ins-password'] && (
                <p className="mt-1 text-xs text-muted">8자 이상이면 돼요.</p>
              )}
            </div>
            <PasswordInput
              id="ins-passwordConfirm"
              ariaLabel="비밀번호 확인"
              value={passwordConfirm}
              onChange={(v) => {
                setPasswordConfirm(v);
                clearError('ins-passwordConfirm');
              }}
              className={inputClass}
              placeholder="비밀번호를 한 번 더 입력해 주세요"
              autoComplete="new-password"
              error={errors['ins-passwordConfirm']}
            />
          </section>
        )}

        <label className="flex items-start gap-3 rounded-2xl border border-border bg-white p-4 text-sm">
          <input
            id="ins-agree"
            type="checkbox"
            {...errorProps('ins-agree')}
            checked={agreed}
            onChange={(e) => {
              setAgreed(e.target.checked);
              clearError('ins-agree');
            }}
            className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600"
          />
          <span className="leading-relaxed text-muted">
            점검 방문과 입금 확인을 위해 이름·연락처·주소를 수집·이용하는 데 동의합니다.{' '}
            <Link href="/privacy" className="font-semibold text-brand-700 underline">
              개인정보처리방침
            </Link>
          </span>
        </label>

        <FieldError id="ins-agree">{errors['ins-agree']}</FieldError>

        {formError && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className={buttonClasses('primary', 'lg', 'w-full')}
        >
          {busy ? '신청 중…' : `${formatWon(INSPECTION_PRICE_WON)} 전기점검 신청하기`}
        </button>
        <p className="text-center text-xs text-muted">
          신청 후 입금해 주시면 관리자가 확인한 뒤 점검이 시작됩니다.
        </p>
      </form>
    </main>
  );
}
