'use client';

import { useState } from 'react';
import Link from 'next/link';
import { isValidBizRegNo } from '@/lib/bizRegNo';
import PortalSupportLink from '@/components/PortalSupportLink';
import { requestError } from '@/lib/clientApi';
import PageHeader from '@/components/PageHeader';
import LoginIdCheckField from '@/components/LoginIdCheckField';
import PasswordInput from '@/components/PasswordInput';
import Surface from '@/components/Surface';
import { buttonClasses } from '@/components/Button';
import RegionSelect, { type RegionValue } from '@/components/RegionSelect';
import RegionMultiSelect from '@/components/RegionMultiSelect';
import { hasSigungu } from '@/lib/regions';
import { CheckIcon, ClipboardIcon } from '@/components/icons';
import ReferrerField, {
  type ReferrerSelection,
} from '@/components/ReferrerField';

const inputClass =
  'min-w-0 w-full rounded-xl border border-border bg-white p-3 text-base text-fg placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none';

export default function PartnerSignupPage() {
  const [loginId, setLoginId] = useState('');
  const [idAvailable, setIdAvailable] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [region, setRegion] = useState<RegionValue>({ sido: '', sigungu: '' });
  const [addrDetail, setAddrDetail] = useState('');
  const [regions, setRegions] = useState<string[]>([]);
  const [bizRegNo, setBizRegNo] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [elecFile, setElecFile] = useState<File | null>(null);
  const [referrer, setReferrer] = useState<ReferrerSelection | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // 지역 선택 + 상세 주소를 합쳐 하나의 주소로 (지오코딩·거리계산에 사용)
  const regionComplete =
    !!region.sido && (!hasSigungu(region.sido) || !!region.sigungu);
  const fullAddress = [region.sido, region.sigungu, addrDetail.trim()]
    .filter(Boolean)
    .join(' ');

  function fail(message: string, id: string) {
    setError(message);
    setInvalid(id);
    const field = document.getElementById(id);
    field?.focus();
    field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInvalid(null);
    if (loginId.trim().length < 3)
      return fail('로그인 아이디를 3자 이상 입력해 주세요', 'partner-loginId');
    if (!idAvailable)
      return fail('아이디 중복 확인을 해 주세요', 'partner-loginId');
    if (password.length < 8)
      return fail('비밀번호를 8자 이상 입력해 주세요', 'partner-password');
    if (password !== passwordConfirm)
      return fail('비밀번호가 일치하지 않습니다', 'partner-password-confirm');
    if (!name.trim()) return fail('업체명을 입력해 주세요', 'partner-name');
    if (!/^0\d{8,10}$/.test(phone.replace(/\D/g, '')))
      return fail('전화번호를 확인해 주세요', 'partner-phone');
    if (!regionComplete)
      return fail(
        '사업장 지역을 선택해 주세요',
        !region.sido ? 'partner-region-sido' : 'partner-region-sigungu',
      );
    if (!addrDetail.trim())
      return fail('상세 주소를 입력해 주세요', 'partner-addr');
    if (!isValidBizRegNo(bizRegNo))
      return fail('사업자등록번호 10자리를 확인해 주세요', 'partner-biz');
    if (!file) return fail('사업자등록증 사진을 첨부해 주세요', 'partner-file');
    if (!elecFile)
      return fail('전기공사업 등록증 사진을 첨부해 주세요', 'partner-elecFile');
    for (const [upload, field] of [
      [file, 'partner-file'],
      [elecFile, 'partner-elecFile'],
    ] as const) {
      if (upload.size > 8 * 1024 * 1024)
        return fail('파일은 각 8MB 이하여야 합니다', field);
      if (
        ![
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/heic',
          'application/pdf',
        ].includes(upload.type)
      )
        return fail(
          'JPG, PNG, WEBP, HEIC 또는 PDF 파일을 첨부해 주세요',
          field,
        );
    }
    if (!agreed)
      return fail('개인정보 수집·이용에 동의해 주세요', 'partner-agreed');

    setBusy(true);
    try {
      const form = new FormData();
      form.set('loginId', loginId);
      form.set('password', password);
      form.set('name', name);
      form.set('phone', phone);
      form.set('address', fullAddress);
      form.set('regions', JSON.stringify(regions));
      form.set('bizRegNo', bizRegNo);
      form.set('bizCert', file);
      form.set('elecCert', elecFile);
      if (referrer) form.set('referrerUserId', referrer.userId);
      const res = await fetch('/api/partner/signup', {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(30_000),
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
        <Surface
          tint
          className="flex w-full flex-col items-center gap-5 rounded-3xl p-7 text-center md:max-w-lg md:p-12"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600">
            <CheckIcon className="h-8 w-8 text-white" />
          </div>
          <PortalSupportLink />
          <h1 className="text-2xl font-bold">가입 신청이 접수되었습니다</h1>
          <p className="text-muted">
            관리자가 사업자등록증·전기공사업 등록증을 확인한 뒤 승인합니다.
            <br />
            승인 후 로그인할 수 있으며, 승인 여부는
            <br />
            로그인 화면에서 확인해 주세요.
          </p>
          <Link
            href="/partner/login"
            className={buttonClasses('primary', 'lg', 'w-full')}
          >
            로그인 화면으로
          </Link>
        </Surface>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <PageHeader
        title="업체 가입 신청"
        back="/partner/login"
        width="max-w-2xl"
      />

      <form
        noValidate
        onSubmit={submit}
        className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-10 md:py-8 md:pb-16"
      >
        <Surface as="section" className="space-y-2 rounded-2xl p-4 md:p-6">
          <h2 className="text-sm font-semibold">계정 정보</h2>
          <LoginIdCheckField
            id="partner-loginId"
            error={
              invalid === 'partner-loginId' ? (error ?? undefined) : undefined
            }
            value={loginId}
            onChange={setLoginId}
            onAvailabilityChange={setIdAvailable}
            className={inputClass}
          />
          <PasswordInput
            id="partner-password"
            error={
              invalid === 'partner-password' ? (error ?? undefined) : undefined
            }
            value={password}
            onChange={setPassword}
            placeholder="비밀번호 (8자 이상)"
            className={inputClass}
          />
          <PasswordInput
            id="partner-password-confirm"
            error={
              invalid === 'partner-password-confirm'
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
        </Surface>

        <Surface as="section" className="space-y-2 rounded-2xl p-4 md:p-6">
          <h2 className="text-sm font-semibold">업체 정보</h2>
          <div className="min-w-0 flex-1">
            <label
              htmlFor="partner-name"
              className="mb-1 block text-sm font-medium"
            >
              업체명
            </label>
            <input
              id="partner-name"
              maxLength={50}
              aria-invalid={invalid === 'partner-name'}
              aria-describedby={
                invalid === 'partner-name' ? 'partner-name-error' : undefined
              }
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="업체명"
              placeholder="업체명"
              className={inputClass}
            />
            {invalid === 'partner-name' && (
              <p
                id="partner-name-error"
                role="alert"
                className="mt-1 text-sm text-red-700"
              >
                {error}
              </p>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <label
              htmlFor="partner-phone"
              className="mb-1 block text-sm font-medium"
            >
              전화번호
            </label>
            <input
              id="partner-phone"
              maxLength={20}
              aria-invalid={invalid === 'partner-phone'}
              aria-describedby={
                invalid === 'partner-phone' ? 'partner-phone-error' : undefined
              }
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-label="전화번호"
              placeholder="전화번호 (배정 안내 문자 수신)"
              className={inputClass}
            />
            {invalid === 'partner-phone' && (
              <p
                id="partner-phone-error"
                role="alert"
                className="mt-1 text-sm text-red-700"
              >
                {error}
              </p>
            )}
          </div>
          <RegionSelect
            idPrefix="partner-region"
            error={
              invalid === 'partner-region-sido' ||
              invalid === 'partner-region-sigungu'
                ? (error ?? undefined)
                : undefined
            }
            value={region}
            onChange={setRegion}
          />
          <div className="min-w-0 flex-1">
            <label
              htmlFor="partner-addr"
              className="mb-1 block text-sm font-medium"
            >
              상세 주소
            </label>
            <input
              id="partner-addr"
              maxLength={160}
              aria-invalid={invalid === 'partner-addr'}
              aria-describedby={
                invalid === 'partner-addr' ? 'partner-addr-error' : undefined
              }
              type="text"
              value={addrDetail}
              onChange={(e) => setAddrDetail(e.target.value)}
              aria-label="상세 주소"
              placeholder="상세 주소 (도로명, 건물명 등)"
              autoComplete="street-address"
              className={inputClass}
            />
            {invalid === 'partner-addr' && (
              <p
                id="partner-addr-error"
                role="alert"
                className="mt-1 text-sm text-red-700"
              >
                {error}
              </p>
            )}
          </div>
        </Surface>

        <Surface as="section" className="space-y-2 rounded-2xl p-4 md:p-6">
          <h2 className="text-sm font-semibold">서비스 가능 지역</h2>
          <p className="text-xs text-muted">
            출동 가능한 지역을 여러 곳 선택할 수 있습니다. 선택한 지역의 요청만
            받습니다. 그 안에서의 배정 순서는 알 보유량이 먼저이고, 같으면 최근
            배정이 적은 순, 평균 별점, 거리 순으로 정해집니다.
          </p>
          <RegionMultiSelect value={regions} onChange={setRegions} />
        </Surface>

        <Surface as="section" className="space-y-2 rounded-2xl p-4 md:p-6">
          <h2 className="text-sm font-semibold">사업자 인증</h2>
          <div className="min-w-0 flex-1">
            <label
              htmlFor="partner-biz"
              className="mb-1 block text-sm font-medium"
            >
              사업자등록번호
            </label>
            <input
              id="partner-biz"
              maxLength={20}
              aria-invalid={invalid === 'partner-biz'}
              aria-describedby={
                invalid === 'partner-biz' ? 'partner-biz-error' : undefined
              }
              type="text"
              inputMode="numeric"
              value={bizRegNo}
              onChange={(e) => setBizRegNo(e.target.value)}
              aria-label="사업자등록번호"
              placeholder="사업자등록번호 (예: 123-45-67890)"
              className={inputClass}
            />
            {invalid === 'partner-biz' && (
              <p
                id="partner-biz-error"
                role="alert"
                className="mt-1 text-sm text-red-700"
              >
                {error}
              </p>
            )}
          </div>
          <label
            className={`relative flex min-h-12 w-full cursor-pointer focus-within:ring-2 focus-within:ring-brand-700 items-center justify-center gap-2 rounded-xl border p-3 text-base font-medium ${
              file
                ? 'border-green-300 bg-green-50 text-green-700'
                : 'border-brand-300 bg-brand-50 text-brand-700'
            }`}
          >
            {file ? (
              <CheckIcon className="h-4 w-4 shrink-0" />
            ) : (
              <ClipboardIcon className="h-4 w-4 shrink-0" />
            )}
            {file ? file.name : '사업자등록증 사진 첨부'}
            <input
              type="file"
              id="partner-file"
              aria-invalid={invalid === 'partner-file'}
              aria-describedby={
                invalid === 'partner-file' ? 'partner-file-error' : undefined
              }
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              aria-label="사업자등록증 첨부"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {invalid === 'partner-file' && (
            <p
              id="partner-file-error"
              role="alert"
              className="text-sm text-red-700"
            >
              {error}
            </p>
          )}
          <label
            className={`relative flex min-h-12 w-full cursor-pointer focus-within:ring-2 focus-within:ring-brand-700 items-center justify-center gap-2 rounded-xl border p-3 text-base font-medium ${
              elecFile
                ? 'border-green-300 bg-green-50 text-green-700'
                : 'border-brand-300 bg-brand-50 text-brand-700'
            }`}
          >
            {elecFile ? (
              <CheckIcon className="h-4 w-4 shrink-0" />
            ) : (
              <ClipboardIcon className="h-4 w-4 shrink-0" />
            )}
            {elecFile ? elecFile.name : '전기공사업 등록증 사진 첨부'}
            <input
              type="file"
              id="partner-elecFile"
              aria-invalid={invalid === 'partner-elecFile'}
              aria-describedby={
                invalid === 'partner-elecFile'
                  ? 'partner-elecFile-error'
                  : undefined
              }
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              aria-label="전기공사업 등록증 첨부"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              onChange={(e) => setElecFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {invalid === 'partner-elecFile' && (
            <p
              id="partner-elecFile-error"
              role="alert"
              className="text-sm text-red-700"
            >
              {error}
            </p>
          )}
          <p className="text-xs text-muted">
            JPG/PNG/WEBP/HEIC/PDF, 각 8MB 이하. 전기공사업법상 등록업체만
            전기공사를 도급받을 수 있어 두 증빙 모두 필요하며, 관리자 확인
            용도로만 사용됩니다.
          </p>
        </Surface>

        <Surface as="section" className="space-y-2 rounded-2xl p-4 md:p-6">
          <h2 className="text-sm font-semibold">추천인 (선택)</h2>
          <p className="text-xs text-muted">
            추천인이 있다면 전화번호로 검색해 지정할 수 있습니다.
          </p>
          <ReferrerField
            selected={referrer}
            onSelectedChange={setReferrer}
            variant="mobile"
          />
        </Surface>

        <label className="flex min-h-11 items-start gap-2 py-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            id="partner-agreed"
            aria-invalid={invalid === 'partner-agreed'}
            aria-describedby={
              invalid === 'partner-agreed' ? 'signup-error' : undefined
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
            을 확인했으며, 가입 심사를 위한 개인정보(사업자등록증, 전기공사업
            등록증, 연락처) 수집·이용에 동의합니다. 수집된 증빙은 심사 목적 외에
            사용되지 않습니다.
          </span>
        </label>

        {error && (
          <p
            role="alert"
            id="signup-error"
            tabIndex={-1}
            className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600"
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
