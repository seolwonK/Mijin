'use client';

import { useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { buttonClasses } from '@/components/Button';
import RegionSelect, { type RegionValue } from '@/components/RegionSelect';
import RegionMultiSelect from '@/components/RegionMultiSelect';
import { hasSigungu } from '@/lib/regions';
import { startIdentityVerification } from '@/lib/identity/client';

const inputClass =
  'w-full rounded-xl border border-neutral-300 bg-white p-3 text-base text-fg placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none';

type EmploymentType = 'DAILY' | 'PERMANENT';

const EMPLOYMENT_OPTIONS: { value: EmploymentType; label: string; desc: string }[] = [
  { value: 'DAILY', label: '일일 근로자', desc: '하루 8시간 단위 근로' },
  { value: 'PERMANENT', label: '상시 근로자', desc: '평일 09:00~18:00 (추후 협의 변동 가능)' },
];

export default function TechSignupPage() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [employmentType, setEmploymentType] = useState<EmploymentType | null>(null);
  const [region, setRegion] = useState<RegionValue>({ sido: '', sigungu: '' });
  const [addrDetail, setAddrDetail] = useState('');
  const [regions, setRegions] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // 휴대폰 본인인증 완료 시 발급받은 토큰. 이 값이 있어야 가입 가능하다.
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // 지역 선택 + 상세 주소를 합쳐 하나의 주소로 (지오코딩·거리계산에 사용)
  const regionComplete =
    !!region.sido && (!hasSigungu(region.sido) || !!region.sigungu);
  const fullAddress = [region.sido, region.sigungu, addrDetail.trim()]
    .filter(Boolean)
    .join(' ');

  // 휴대폰 본인인증 시작 → 서버 검증 → verificationId 확보.
  // mock 환경에서는 입력한 이름/번호가 그대로 인증되고, portone 환경에서는 PASS 팝업이 뜬다.
  async function verifyPhone() {
    setError(null);
    if (!name.trim()) return setError('성명을 입력해 주세요');
    if (!phone.trim()) return setError('전화번호를 입력해 주세요');

    setVerifying(true);
    try {
      const raw = await startIdentityVerification({ name, phone });
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
      // 대행사가 검증한 실명·번호로 확정하고 입력칸을 잠근다.
      setName(data.name);
      setPhone(data.phone);
      setVerificationId(data.verificationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : '본인인증에 실패했습니다');
    } finally {
      setVerifying(false);
    }
  }

  // 본인인증을 다시 하려면 잠금을 풀고 토큰을 버린다.
  function resetVerification() {
    setVerificationId(null);
  }

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
    if (!verificationId) return fail('휴대폰 본인인증을 완료해 주세요');
    if (!loginId.trim()) return fail('로그인 아이디를 입력해 주세요', 'tech-loginId');
    if (!password) return fail('비밀번호를 입력해 주세요', 'tech-password');
    if (!employmentType) return fail('근로 형태를 선택해 주세요');
    if (!regionComplete) return fail('거주 지역을 선택해 주세요');
    if (!addrDetail.trim()) return fail('상세 주소를 입력해 주세요', 'tech-addr');
    if (!agreed) return fail('개인정보 수집·이용에 동의해 주세요');

    setBusy(true);
    try {
      const res = await fetch('/api/tech/signup', {
        method: 'POST',
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
        }),
      });
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
        <div className="flex w-full flex-col items-center gap-5 text-center md:max-w-lg md:rounded-3xl md:border md:border-border md:bg-white md:p-12 md:shadow-card">
          <div className="text-6xl">🎉</div>
          <h1 className="text-2xl font-bold text-fg">가입이 완료되었습니다</h1>
          <p className="text-muted">
            자동으로 로그인되었습니다.
            <br />
            이어서 <b>근로계약서에 서명</b>하면
            <br />
            바로 배정(일)을 받을 수 있습니다.
          </p>
          <Link href="/tech/contract" className={buttonClasses('primary', 'lg', 'w-full')}>
            근로계약서 작성하러 가기
          </Link>
          <Link href="/tech" className="text-sm font-medium text-neutral-400 hover:text-neutral-600">
            나중에 하기 (기술자 포털로)
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <PageHeader title="개인기술자 가입 신청" back="/tech/login" />

      <form
        onSubmit={submit}
        className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-10 md:py-8 md:pb-16"
      >
        <section className="space-y-2 md:rounded-2xl md:border md:border-border md:bg-white md:p-6 md:shadow-card">
          <h2 className="text-sm font-semibold">계정 정보</h2>
          <input
            type="text"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            id="tech-loginId"
            aria-label="로그인 아이디"
            placeholder="로그인 아이디 (3자 이상)"
            autoComplete="username"
            className={inputClass}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            id="tech-password"
            aria-label="비밀번호"
            placeholder="비밀번호 (8자 이상)"
            autoComplete="new-password"
            className={inputClass}
          />
        </section>

        <section className="space-y-3 md:rounded-2xl md:border md:border-border md:bg-white md:p-6 md:shadow-card">
          <h2 className="text-sm font-semibold">근로 형태</h2>
          <div className="grid grid-cols-2 gap-2">
            {EMPLOYMENT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setEmploymentType(opt.value)}
                className={`rounded-xl border p-3 text-left transition-colors ${
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
        </section>

        <section className="space-y-2 md:rounded-2xl md:border md:border-border md:bg-white md:p-6 md:shadow-card">
          <h2 className="text-sm font-semibold">기술자 정보</h2>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="성명"
            placeholder="성명"
            autoComplete="name"
            readOnly={!!verificationId}
            className={`${inputClass} ${verificationId ? 'bg-neutral-100 text-muted' : ''}`}
          />
          <div className="flex gap-2">
            <input
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
            {verificationId ? (
              <button
                type="button"
                onClick={resetVerification}
                className="shrink-0 rounded-xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-600"
              >
                변경
              </button>
            ) : (
              <button
                type="button"
                onClick={verifyPhone}
                disabled={verifying || !name.trim() || !phone.trim()}
                className="shrink-0 rounded-xl bg-neutral-900 px-4 text-sm font-bold text-white transition-colors enabled:hover:bg-neutral-950 disabled:opacity-50"
              >
                {verifying ? '인증 중…' : '본인인증'}
              </button>
            )}
          </div>
          {verificationId ? (
            <p className="flex items-center gap-1 text-sm font-medium text-green-600">
              ✅ 휴대폰 본인인증 완료
            </p>
          ) : (
            <p className="text-xs text-neutral-400">
              성명·전화번호 입력 후 <b>본인인증</b>을 완료해야 가입할 수 있습니다.
            </p>
          )}
          <RegionSelect value={region} onChange={setRegion} />
          <input
            type="text"
            value={addrDetail}
            onChange={(e) => setAddrDetail(e.target.value)}
            id="tech-addr"
            aria-label="상세 주소"
            placeholder="상세 주소 (도로명, 건물명 등)"
            autoComplete="street-address"
            className={inputClass}
          />
        </section>

        <section className="space-y-2 md:rounded-2xl md:border md:border-border md:bg-white md:p-6 md:shadow-card">
          <h2 className="text-sm font-semibold">서비스 가능 지역</h2>
          <p className="text-xs text-muted">
            일(배정)을 받을 지역을 여러 곳 선택할 수 있습니다. 선택한 지역의 요청만
            받으며, 그 안에서 가까운 순으로 배정됩니다.
          </p>
          <RegionMultiSelect value={regions} onChange={setRegions} />
        </section>

        <label className="flex items-start gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand-600"
          />
          <span>
            가입 심사 및 근로계약을 위한 개인정보(성명, 연락처, 주소) 수집·이용에
            동의합니다.
          </span>
        </label>

        {error && (
          <p className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600">
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
      </form>
    </main>
  );
}
