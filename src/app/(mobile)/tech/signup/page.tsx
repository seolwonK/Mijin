'use client';

import { useState } from 'react';
import Link from 'next/link';
import BackButton from '@/components/BackButton';
import RegionSelect, { type RegionValue } from '@/components/RegionSelect';
import { hasSigungu } from '@/lib/regions';

const inputClass =
  'w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-500 focus:outline-none';

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
    if (!employmentType) return setError('근로 형태를 선택해 주세요');
    if (!regionComplete) return setError('거주 지역을 선택해 주세요');
    if (!agreed) return setError('개인정보 수집·이용에 동의해 주세요');

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
        <div className="flex w-full flex-col items-center gap-5 text-center md:max-w-lg md:rounded-3xl md:bg-white md:p-12 md:shadow-sm">
          <div className="text-6xl">🎉</div>
          <h1 className="text-2xl font-bold">가입이 완료되었습니다</h1>
          <p className="text-gray-500">
            바로 로그인할 수 있습니다.
            <br />
            로그인 후 <b>근로계약서를 작성·서명</b>하면
            <br />
            배정(일)을 받을 수 있습니다.
          </p>
          <Link
            href="/tech/login"
            className="w-full rounded-2xl bg-blue-600 p-4 text-center font-bold text-white transition-colors hover:bg-blue-700"
          >
            로그인 하러 가기
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-2 md:py-3">
          <BackButton fallback="/tech/login" />
          <h1 className="text-lg font-bold">개인기술자 가입 신청</h1>
        </div>
      </header>

      <form
        onSubmit={submit}
        className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-10 md:py-8 md:pb-16"
      >
        <section className="space-y-2 md:rounded-2xl md:bg-white md:p-6 md:shadow-sm">
          <h2 className="text-sm font-semibold">계정 정보</h2>
          <input
            type="text"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            placeholder="로그인 아이디 (3자 이상)"
            autoComplete="username"
            className={inputClass}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호 (8자 이상)"
            autoComplete="new-password"
            className={inputClass}
          />
        </section>

        <section className="space-y-3 md:rounded-2xl md:bg-white md:p-6 md:shadow-sm">
          <h2 className="text-sm font-semibold">근로 형태</h2>
          <div className="grid grid-cols-2 gap-2">
            {EMPLOYMENT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setEmploymentType(opt.value)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  employmentType === opt.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 bg-white'
                }`}
              >
                <p className="font-bold">{opt.label}</p>
                <p className="mt-0.5 text-xs text-gray-500">{opt.desc}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2 md:rounded-2xl md:bg-white md:p-6 md:shadow-sm">
          <h2 className="text-sm font-semibold">기술자 정보</h2>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="성명"
            autoComplete="name"
            className={inputClass}
          />
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="전화번호 (배정 안내 문자 수신)"
            className={inputClass}
          />
          <RegionSelect value={region} onChange={setRegion} />
          <input
            type="text"
            value={addrDetail}
            onChange={(e) => setAddrDetail(e.target.value)}
            placeholder="상세 주소 (도로명, 건물명 등)"
            autoComplete="street-address"
            className={inputClass}
          />
        </section>

        <label className="flex items-start gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            가입 심사 및 근로계약을 위한 개인정보(성명, 연락처, 주소) 수집·이용에
            동의합니다.
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
            !employmentType ||
            !regionComplete ||
            !addrDetail.trim()
          }
          className="h-14 w-full rounded-2xl bg-blue-600 text-lg font-bold text-white transition-colors enabled:hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? '신청 중…' : '가입 신청하기'}
        </button>
      </form>
    </main>
  );
}
