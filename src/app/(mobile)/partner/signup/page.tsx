'use client';

import { useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import PasswordInput from '@/components/PasswordInput';
import Surface from '@/components/Surface';
import { buttonClasses } from '@/components/Button';
import RegionSelect, { type RegionValue } from '@/components/RegionSelect';
import RegionMultiSelect from '@/components/RegionMultiSelect';
import { hasSigungu } from '@/lib/regions';
import { CheckIcon, ClipboardIcon } from '@/components/icons';
import ReferrerField, { type ReferrerSelection } from '@/components/ReferrerField';

const inputClass =
  'w-full rounded-xl border border-border bg-white p-3 text-base text-fg placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none';

export default function PartnerSignupPage() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [region, setRegion] = useState<RegionValue>({ sido: '', sigungu: '' });
  const [addrDetail, setAddrDetail] = useState('');
  const [regions, setRegions] = useState<string[]>([]);
  const [bizRegNo, setBizRegNo] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [referrer, setReferrer] = useState<ReferrerSelection | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // 지역 선택 + 상세 주소를 합쳐 하나의 주소로 (지오코딩·거리계산에 사용)
  const regionComplete =
    !!region.sido && (!hasSigungu(region.sido) || !!region.sigungu);
  const fullAddress = [region.sido, region.sigungu, addrDetail.trim()]
    .filter(Boolean)
    .join(' ');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (loginId.trim().length < 3) return setError('로그인 아이디를 3자 이상 입력해 주세요');
    if (password.length < 8) return setError('비밀번호를 8자 이상 입력해 주세요');
    if (!regionComplete) return setError('사업장 지역을 선택해 주세요');
    if (!file) return setError('사업자등록증 사진을 첨부해 주세요');
    if (!agreed) return setError('개인정보 수집·이용에 동의해 주세요');

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
      if (referrer) form.set('referrerUserId', referrer.userId);
      const res = await fetch('/api/partner/signup', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '신청에 실패했습니다');
        return;
      }
      setDone(true);
    } catch {
      setError('네트워크 오류가 발생했습니다');
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
          <h1 className="text-2xl font-bold">가입 신청이 접수되었습니다</h1>
          <p className="text-muted">
            관리자가 사업자등록증을 확인한 뒤 승인합니다.
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
      <PageHeader title="업체 가입 신청" back="/partner/login" width="max-w-2xl" />

      <form
        onSubmit={submit}
        className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-10 md:py-8 md:pb-16"
      >
        <Surface as="section" className="space-y-2 rounded-2xl p-4 md:p-6">
          <h2 className="text-sm font-semibold">계정 정보</h2>
          <input
            type="text"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            aria-label="로그인 아이디"
            placeholder="로그인 아이디 (3자 이상)"
            autoComplete="username"
            className={inputClass}
          />
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder="비밀번호 (8자 이상)"
            className={inputClass}
          />
        </Surface>

        <Surface as="section" className="space-y-2 rounded-2xl p-4 md:p-6">
          <h2 className="text-sm font-semibold">업체 정보</h2>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="업체명"
            placeholder="업체명"
            className={inputClass}
          />
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-label="전화번호"
            placeholder="전화번호 (배정 안내 문자 수신)"
            className={inputClass}
          />
          <RegionSelect value={region} onChange={setRegion} />
          <input
            type="text"
            value={addrDetail}
            onChange={(e) => setAddrDetail(e.target.value)}
            aria-label="상세 주소"
            placeholder="상세 주소 (도로명, 건물명 등)"
            autoComplete="street-address"
            className={inputClass}
          />
        </Surface>

        <Surface as="section" className="space-y-2 rounded-2xl p-4 md:p-6">
          <h2 className="text-sm font-semibold">서비스 가능 지역</h2>
          <p className="text-xs text-muted">
            출동 가능한 지역을 여러 곳 선택할 수 있습니다. 선택한 지역의 요청만
            받으며, 그 안에서 가까운 순으로 배정됩니다.
          </p>
          <RegionMultiSelect value={regions} onChange={setRegions} />
        </Surface>

        <Surface as="section" className="space-y-2 rounded-2xl p-4 md:p-6">
          <h2 className="text-sm font-semibold">사업자 인증</h2>
          <input
            type="text"
            inputMode="numeric"
            value={bizRegNo}
            onChange={(e) => setBizRegNo(e.target.value)}
            aria-label="사업자등록번호"
            placeholder="사업자등록번호 (예: 123-45-67890)"
            className={inputClass}
          />
          <label
            className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 text-base font-medium ${
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
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <p className="text-xs text-muted">
            JPG/PNG/PDF, 8MB 이하. 관리자 확인 용도로만 사용됩니다.
          </p>
        </Surface>

        <Surface as="section" className="space-y-2 rounded-2xl p-4 md:p-6">
          <h2 className="text-sm font-semibold">추천인 (선택)</h2>
          <p className="text-xs text-muted">
            추천인이 있다면 전화번호로 검색해 지정할 수 있습니다.
          </p>
          <ReferrerField selected={referrer} onSelectedChange={setReferrer} variant="mobile" />
        </Surface>

        <label className="flex items-start gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand-600"
          />
          <span>
            가입 심사를 위한 개인정보(사업자등록증, 연락처) 수집·이용에 동의합니다.
            수집된 증빙은 심사 목적 외에 사용되지 않습니다.
          </span>
        </label>

        {error && (
          <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={
            busy ||
            !loginId ||
            !password ||
            !name ||
            !phone ||
            !regionComplete ||
            !addrDetail.trim() ||
            !bizRegNo
          }
          className={buttonClasses('primary', 'lg', 'w-full')}
        >
          {busy ? '신청 중…' : '가입 신청하기'}
        </button>
      </form>
    </main>
  );
}
