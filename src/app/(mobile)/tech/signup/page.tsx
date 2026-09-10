'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PortalSupportLink from '@/components/PortalSupportLink';
import { requestError } from '@/lib/clientApi';
import PageHeader from '@/components/PageHeader';
import LoginIdCheckField from '@/components/LoginIdCheckField';
import PasswordInput from '@/components/PasswordInput';
import { buttonClasses } from '@/components/Button';
import RegionSelect, { type RegionValue } from '@/components/RegionSelect';
import RegionMultiSelect from '@/components/RegionMultiSelect';
import { hasSigungu, regionKey } from '@/lib/regions';
import {
  startIdentityVerification,
  preloadIdentityVerification,
  REDIRECT_PARAM_ID,
  REDIRECT_PARAM_CODE,
  REDIRECT_PARAM_MESSAGE,
} from '@/lib/identity/client';
import { CheckIcon } from '@/components/icons';
import ReferrerField, {
  type ReferrerSelection,
} from '@/components/ReferrerField';

const inputClass =
  'min-w-0 w-full rounded-xl border border-neutral-300 bg-white p-3 text-base text-fg placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none';

type EmploymentType = 'DAILY' | 'PERMANENT';

const EMPLOYMENT_OPTIONS: {
  value: EmploymentType;
  label: string;
  desc: string;
}[] = [
  { value: 'DAILY', label: '일일 근로자', desc: '하루 8시간 단위 근로' },
  {
    value: 'PERMANENT',
    label: '상시 근로자',
    desc: '평일 09:00~18:00 (추후 협의 변동 가능)',
  },
];

// 모바일 본인인증은 페이지가 통째로 인증창(PASS)으로 갔다가 redirectUrl(이 페이지)로 돌아온다.
// 그 사이 React 상태가 전부 사라지므로, 인증 직전에 입력값을 sessionStorage 에 저장하고
// 복귀 시 되살린다. 비밀번호는 저장하지 않는다(탭 저장소라도 평문 비밀번호를 남기지 않는다) —
// 복귀 후 다시 입력받고 안내 문구로 알린다. sessionStorage 는 탭 단위·탭 종료 시 소멸.
const DRAFT_KEY = 'tech-signup-draft';

type Draft = {
  loginId: string;
  idAvailable: boolean;
  name: string;
  phone: string;
  employmentType: EmploymentType | null;
  region: RegionValue;
  addrDetail: string;
  regions: string[];
  referrer: ReferrerSelection | null;
  agreed: boolean;
};

function saveDraft(d: Draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    // 저장 실패(프라이빗 모드 등)는 치명적이지 않다 — 복귀 후 다시 입력하면 된다.
  }
}

function takeDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    sessionStorage.removeItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

// 리다이렉트 복귀 쿼리를 읽고 URL 에서 지운다(새로고침 시 재검증 요청이 반복되지 않도록).
function consumeRedirectParams(): {
  id?: string;
  code?: string;
  message?: string;
} | null {
  const params = new URLSearchParams(window.location.search);
  const id = params.get(REDIRECT_PARAM_ID) ?? undefined;
  const code = params.get(REDIRECT_PARAM_CODE) ?? undefined;
  const message = params.get(REDIRECT_PARAM_MESSAGE) ?? undefined;
  if (!id && !code) return null;
  window.history.replaceState(null, '', window.location.pathname);
  return { id, code, message };
}

export default function TechSignupPage() {
  const [loginId, setLoginId] = useState('');
  const [idAvailable, setIdAvailable] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [employmentType, setEmploymentType] = useState<EmploymentType | null>(
    null,
  );
  const [region, setRegion] = useState<RegionValue>({ sido: '', sigungu: '' });
  const [addrDetail, setAddrDetail] = useState('');
  const [regions, setRegions] = useState<string[]>([]);
  const [referrer, setReferrer] = useState<ReferrerSelection | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // 휴대폰 본인인증 완료 시 발급받은 토큰. 이 값이 있어야 가입 가능하다.
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  // 모바일 리다이렉트 복귀 직후 한 번만 보여주는 안내(비밀번호 재입력)
  const [redirectNotice, setRedirectNotice] = useState<string | null>(null);

  // 지역 선택 + 상세 주소를 합쳐 하나의 주소로 (지오코딩·거리계산에 사용)
  const regionComplete =
    !!region.sido && (!hasSigungu(region.sido) || !!region.sigungu);
  const fullAddress = [region.sido, region.sigungu, addrDetail.trim()]
    .filter(Boolean)
    .join(' ');

  // 거주지역 시/도를 새로 고르고 서비스 가능 지역이 아직 비어 있으면 같은 시/도(전체)를
  // 1건 자동 추가한다 — 강제 아님(칩에서 바로 삭제 가능), 이미 값이 있으면 손대지 않는다.
  function handleRegionChange(next: RegionValue) {
    if (next.sido && next.sido !== region.sido && regions.length === 0) {
      setRegions([regionKey(next.sido, '')]);
    }
    setRegion(next);
  }

  // 대행사(또는 mock)가 돌려준 값을 서버가 재검증하고 가입용 verificationId 를 발급받는다.
  // 성공하면 대행사가 검증한 실명·번호로 확정하고 입력칸을 잠근다.
  async function confirmWithServer(raw: {
    identityVerificationId?: string;
    name?: string;
    phone?: string;
  }) {
    const res = await fetch('/api/identity/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(raw),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? '본인인증에 실패했습니다');
      return;
    }
    setName(data.name);
    setPhone(data.phone);
    setVerificationId(data.verificationId);
  }

  // 휴대폰 본인인증 시작 → 서버 검증 → verificationId 확보.
  // mock 환경에서는 입력한 이름/번호가 그대로 인증되고, portone 환경에서는 PC 는 PASS 팝업,
  // 모바일은 인증창으로 리다이렉트됐다가 이 페이지로 돌아온다(복귀 처리는 아래 useEffect).
  async function verifyPhone() {
    setError(null);
    if (!name.trim()) return fail('성명을 입력해 주세요', 'tech-name');
    if (!/^01[016789]\d{7,8}$/.test(phone.replace(/\D/g, '')))
      return fail('휴대폰 번호를 확인해 주세요', 'tech-phone');

    setVerifying(true);
    try {
      const raw = await startIdentityVerification({
        name,
        phone,
        redirectUrl: `${window.location.origin}/tech/signup`,
        onBeforeRedirect: () =>
          saveDraft({
            loginId,
            idAvailable,
            name,
            phone,
            employmentType,
            region,
            addrDetail,
            regions,
            referrer,
            agreed,
          }),
      });
      await confirmWithServer(raw);
    } catch (e) {
      setError(e instanceof Error ? e.message : '본인인증에 실패했습니다');
    } finally {
      setVerifying(false);
    }
  }

  // 모바일 리다이렉트 복귀: URL 쿼리에 인증 결과가 실려 오면 초안을 되살리고 서버 검증을 이어 간다.
  // 팝업(PC) 흐름이나 일반 진입에서는 쿼리가 없어 아무것도 하지 않는다.
  // 외부 시스템(URL 쿼리·sessionStorage)을 읽는 것은 effect 본문에서, 상태 복원은 하이드레이션이
  // 끝난 뒤 콜백에서 한다(React Compiler 규칙: effect 본문의 동기 setState 금지). 서버 렌더에는
  // window 가 없으므로 lazy initial state 로는 처리할 수 없다(하이드레이션 불일치).
  // 설정·SDK 프리로드 — 클릭 시 팝업이 사용자 활성화 안에서 바로 열리게(client.ts 주석 참조).
  useEffect(() => {
    preloadIdentityVerification();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const back = consumeRedirectParams();
    if (!back) return;
    const draft = takeDraft();
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      if (draft) {
        setLoginId(draft.loginId);
        setIdAvailable(false);
        setName(draft.name);
        setPhone(draft.phone);
        setEmploymentType(draft.employmentType);
        setRegion(draft.region);
        setAddrDetail(draft.addrDetail);
        setRegions(draft.regions);
        setReferrer(draft.referrer);
        setAgreed(draft.agreed);
      }
      if (back.code || !back.id) {
        setError(back.message ?? '본인인증이 취소되었거나 실패했습니다');
        return;
      }
      setRedirectNotice(
        '본인인증을 마치고 돌아왔습니다. 비밀번호를 다시 입력하고 아이디 중복 확인을 눌러 주세요.',
      );
      setVerifying(true);
      try {
        await confirmWithServer({ identityVerificationId: back.id });
      } catch (e) {
        setError(e instanceof Error ? e.message : '본인인증에 실패했습니다');
      } finally {
        setVerifying(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // 마운트 시 1회만 — back/draft 는 이 시점 값만 의미가 있고 setter 들은 안정적이다.
  }, []);

  // 본인인증을 다시 하려면 잠금을 풀고 토큰을 버린다.
  function resetVerification() {
    setVerificationId(null);
  }

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
    if (!verificationId)
      return fail(
        '휴대폰 본인인증을 완료해 주세요',
        !name.trim()
          ? 'tech-name'
          : !phone.trim()
            ? 'tech-phone'
            : 'tech-verify',
      );
    if (loginId.trim().length < 3)
      return fail('로그인 아이디를 3자 이상 입력해 주세요', 'tech-loginId');
    if (!idAvailable)
      return fail('아이디 중복 확인을 해 주세요', 'tech-loginId');
    if (password.length < 8)
      return fail('비밀번호를 8자 이상 입력해 주세요', 'tech-password');
    if (password !== passwordConfirm)
      return fail('비밀번호가 일치하지 않습니다', 'tech-password-confirm');
    if (!employmentType)
      return fail('근로 형태를 선택해 주세요', 'tech-employment');
    if (!regionComplete)
      return fail(
        '거주 지역을 선택해 주세요',
        !region.sido ? 'tech-region-sido' : 'tech-region-sigungu',
      );
    if (!addrDetail.trim())
      return fail('상세 주소를 입력해 주세요', 'tech-addr');
    if (!agreed)
      return fail('개인정보 수집·이용에 동의해 주세요', 'tech-agreed');

    setBusy(true);
    try {
      const res = await fetch('/api/tech/signup', {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loginId,
          password,
          name,
          phone,
          address: fullAddress,
          employmentType,
          regions,
          verificationId,
          ...(referrer ? { referrerUserId: referrer.userId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? '신청에 실패했습니다');
        return;
      }
      setDone(true);
    } catch (e) {
      setError(requestError(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6">
        <div className="flex w-full flex-col items-center gap-5 text-center md:max-w-lg md:rounded-3xl md:bg-white md:p-12 md:shadow-surface-lg">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600">
            <CheckIcon className="h-8 w-8 text-white" />
          </span>
          <PortalSupportLink />
          <h1 className="text-2xl font-bold text-fg">가입이 완료되었습니다</h1>
          <p className="text-muted">
            자동으로 로그인되었습니다.
            <br />
            이어서 <b>근로확인서에 서명</b>하면
            <br />
            바로 배정(일)을 받을 수 있습니다.
          </p>
          <Link
            href="/tech/contract"
            className={buttonClasses('primary', 'lg', 'w-full')}
          >
            근로확인서 작성하러 가기
          </Link>
          <Link
            href="/tech"
            className="text-sm font-medium text-neutral-400 hover:text-neutral-600"
          >
            나중에 하기 (전기기사 포털로)
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <PageHeader title="전기기사 가입 신청" back="/tech/login" />

      <form
        noValidate
        onSubmit={submit}
        className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-10 md:py-8 md:pb-16"
      >
        {redirectNotice && (
          <p
            role="status"
            className="rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm font-medium text-brand-700"
          >
            {redirectNotice}
          </p>
        )}

        <section className="space-y-2 md:rounded-2xl md:bg-white md:p-6 md:shadow-surface-sm">
          <h2 className="text-sm font-semibold">계정 정보</h2>
          <LoginIdCheckField
            id="tech-loginId"
            error={
              invalid === 'tech-loginId' ? (error ?? undefined) : undefined
            }
            value={loginId}
            onChange={setLoginId}
            onAvailabilityChange={setIdAvailable}
            className={inputClass}
          />
          <PasswordInput
            id="tech-password"
            error={
              invalid === 'tech-password' ? (error ?? undefined) : undefined
            }
            value={password}
            onChange={setPassword}
            placeholder="비밀번호 (8자 이상)"
            className={inputClass}
          />
          <PasswordInput
            id="tech-password-confirm"
            error={
              invalid === 'tech-password-confirm'
                ? (error ?? undefined)
                : undefined
            }
            value={passwordConfirm}
            onChange={setPasswordConfirm}
            placeholder="비밀번호 확인 (다시 입력)"
            ariaLabel="비밀번호 확인"
            className={inputClass}
          />
          {passwordConfirm && password !== passwordConfirm && (
            <p className="text-sm font-medium text-red-600">
              비밀번호가 일치하지 않습니다
            </p>
          )}
        </section>

        <section className="space-y-3 md:rounded-2xl md:bg-white md:p-6 md:shadow-surface-sm">
          <h2 className="text-sm font-semibold">근로 형태</h2>
          <div className="grid grid-cols-2 gap-2">
            {EMPLOYMENT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                id={opt.value === 'DAILY' ? 'tech-employment' : undefined}
                aria-pressed={employmentType === opt.value}
                aria-describedby={
                  invalid === 'tech-employment'
                    ? 'tech-employment-error'
                    : undefined
                }
                type="button"
                onClick={() => setEmploymentType(opt.value)}
                className={`rounded-xl border p-3 text-left transition-colors ease-portal ${
                  employmentType === opt.value
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-neutral-300 bg-white'
                }`}
              >
                <p className="font-bold text-fg">{opt.label}</p>
                <p className="mt-0.5 text-xs text-muted">{opt.desc}</p>
              </button>
            ))}
          </div>
          {invalid === 'tech-employment' && (
            <p
              id="tech-employment-error"
              role="alert"
              className="text-sm text-red-700"
            >
              {error}
            </p>
          )}
        </section>

        <section className="space-y-2 md:rounded-2xl md:bg-white md:p-6 md:shadow-surface-sm">
          <h2 className="text-sm font-semibold">전기기사 정보</h2>
          <div className="min-w-0 flex-1">
            <label
              htmlFor="tech-name"
              className="mb-1 block text-sm font-medium"
            >
              성명
            </label>
            <input
              id="tech-name"
              maxLength={50}
              aria-invalid={invalid === 'tech-name'}
              aria-describedby={
                invalid === 'tech-name' ? 'tech-name-error' : undefined
              }
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="성명"
              placeholder="성명"
              autoComplete="name"
              readOnly={!!verificationId}
              className={`${inputClass} ${verificationId ? 'bg-neutral-100 text-muted' : ''}`}
            />
            {invalid === 'tech-name' && (
              <p
                id="tech-name-error"
                role="alert"
                className="mt-1 text-sm text-red-700"
              >
                {error}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <label
                htmlFor="tech-phone"
                className="mb-1 block text-sm font-medium"
              >
                전화번호
              </label>
              <input
                id="tech-phone"
                maxLength={20}
                aria-invalid={invalid === 'tech-phone'}
                aria-describedby={
                  invalid === 'tech-phone' ? 'tech-phone-error' : undefined
                }
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                aria-label="전화번호"
                placeholder="전화번호 (본인인증 후 배정 안내 문자 수신)"
                readOnly={!!verificationId}
                className={`${inputClass} flex-1 ${verificationId ? 'bg-neutral-100 text-muted' : ''}`}
              />
              {invalid === 'tech-phone' && (
                <p
                  id="tech-phone-error"
                  role="alert"
                  className="mt-1 text-sm text-red-700"
                >
                  {error}
                </p>
              )}
            </div>
            {verificationId ? (
              <button
                type="button"
                onClick={resetVerification}
                className="min-h-12 shrink-0 self-end rounded-xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-600"
              >
                변경
              </button>
            ) : (
              <button
                type="button"
                id="tech-verify"
                aria-describedby={
                  invalid === 'tech-verify' ? 'signup-error' : undefined
                }
                onClick={verifyPhone}
                disabled={verifying}
                className="min-h-12 shrink-0 self-end rounded-xl bg-neutral-900 px-4 text-sm font-bold text-white transition-colors ease-portal enabled:hover:bg-neutral-950 disabled:opacity-50"
              >
                {verifying ? '인증 중…' : '본인인증'}
              </button>
            )}
          </div>
          {verificationId ? (
            <p className="flex items-center gap-1 text-sm font-medium text-green-600">
              <CheckIcon className="h-4 w-4" />
              휴대폰 본인인증 완료
            </p>
          ) : (
            <p className="text-xs text-neutral-400">
              성명·전화번호 입력 후 <b>본인인증</b>을 완료해야 가입할 수
              있습니다.
            </p>
          )}
          <RegionSelect
            idPrefix="tech-region"
            error={
              invalid === 'tech-region-sido' ||
              invalid === 'tech-region-sigungu'
                ? (error ?? undefined)
                : undefined
            }
            value={region}
            onChange={handleRegionChange}
          />
          <div className="min-w-0 flex-1">
            <label
              htmlFor="tech-addr"
              className="mb-1 block text-sm font-medium"
            >
              상세 주소
            </label>
            <input
              id="tech-addr"
              maxLength={160}
              aria-invalid={invalid === 'tech-addr'}
              aria-describedby={
                invalid === 'tech-addr' ? 'tech-addr-error' : undefined
              }
              type="text"
              value={addrDetail}
              onChange={(e) => setAddrDetail(e.target.value)}
              aria-label="상세 주소"
              placeholder="상세 주소 (도로명, 건물명 등)"
              autoComplete="street-address"
              className={inputClass}
            />
            {invalid === 'tech-addr' && (
              <p
                id="tech-addr-error"
                role="alert"
                className="mt-1 text-sm text-red-700"
              >
                {error}
              </p>
            )}
          </div>
        </section>

        <section className="space-y-2 md:rounded-2xl md:bg-white md:p-6 md:shadow-surface-sm">
          <h2 className="text-sm font-semibold">서비스 가능 지역</h2>
          <p className="text-xs text-muted">
            일(배정)을 받을 지역을 여러 곳 선택할 수 있습니다. 선택한 지역의
            요청만 받습니다. 그 안에서의 배정 순서는 알 보유량이 먼저이고,
            같으면 최근 배정이 적은 순, 평균 별점, 거리 순으로 정해집니다.
          </p>
          <RegionMultiSelect value={regions} onChange={setRegions} />
        </section>

        <section className="space-y-2 md:rounded-2xl md:bg-white md:p-6 md:shadow-surface-sm">
          <h2 className="text-sm font-semibold">추천인 (선택)</h2>
          <p className="text-xs text-muted">
            추천인이 있다면 전화번호로 검색해 지정할 수 있습니다.
          </p>
          <ReferrerField
            selected={referrer}
            onSelectedChange={setReferrer}
            variant="mobile"
          />
        </section>

        <label className="flex min-h-11 items-start gap-2 py-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            id="tech-agreed"
            aria-invalid={invalid === 'tech-agreed'}
            aria-describedby={
              invalid === 'tech-agreed' ? 'signup-error' : undefined
            }
            className="mt-0.5 h-5 w-5 accent-brand-600"
          />
          <span>
            <Link
              href="/terms"
              target="_blank"
              className="font-semibold text-brand-700 underline"
            >
              이용약관
            </Link>
            과{' '}
            <Link
              href="/privacy"
              target="_blank"
              className="font-semibold text-brand-700 underline"
            >
              개인정보처리방침
            </Link>
            을 확인했으며, 가입 심사 및 근로확인을 위한 개인정보(성명, 연락처,
            주소, 본인인증 결과) 수집·이용에 동의합니다.
          </span>
        </label>

        {error && (
          <p
            role="alert"
            id="signup-error"
            tabIndex={-1}
            className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className={buttonClasses('primary', 'lg', 'w-full')}
        >
          {busy ? '신청 중…' : '가입 신청하기'}
        </button>
        <PortalSupportLink />
      </form>
    </main>
  );
}
