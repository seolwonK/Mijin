'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import LocationPicker, { type LocationValue } from '@/components/LocationPicker';
import LoginIdCheckField from '@/components/LoginIdCheckField';
import PasswordInput from '@/components/PasswordInput';
import BankAccountCard from '@/components/BankAccountCard';
import { buttonClasses } from '@/components/Button';
import { requestError } from '@/lib/clientApi';
import type { PublicBankAccount } from '@/lib/inspectionAccount';
import {
  INSPECTION_APPLY_WINDOW_DAYS,
  INSPECTION_MIN_LEAD_DAYS,
  INSPECTION_PRICE_WON,
  INSPECTION_VISITS_PER_TERM,
  TIME_SLOTS,
  TIME_SLOT_LABEL,
  TIME_SLOT_RANGE,
  TIME_SLOT_SHORT,
  type TimeSlot,
  addDays,
  applyDateIssue,
  formatVisitDate,
  formatWon,
  isDateString,
  todayKst,
} from '@/lib/inspection';

const inputClass =
  'w-full rounded-xl border border-border p-3 text-base transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none';

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
  const maxDate = addDays(today, INSPECTION_APPLY_WINDOW_DAYS);

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
  const [loginIdAvailable, setLoginIdAvailable] = useState(false);
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function fail(message: string, id?: string) {
    setError(message);
    const el = id ? (document.getElementById(id) as HTMLElement | null) : null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (!name.trim()) return fail('이름을 입력해 주세요', 'ins-name');
    if (!/^0\d{8,10}$/.test(phone.replace(/\D/g, '')))
      return fail('전화번호를 확인해 주세요', 'ins-phone');
    if (!location.address.trim()) return fail('점검받을 주소를 입력해 주세요', 'ins-address');
    if (!isDateString(preferredDate)) return fail('1회차 희망 날짜를 선택해 주세요', 'ins-date');
    const dateIssue = applyDateIssue(preferredDate, today);
    if (dateIssue) return fail(dateIssue, 'ins-date');
    if (!renewal) {
      if (loginId.trim().length < 3) return fail('아이디를 3자 이상 입력해 주세요', 'ins-loginId');
      if (!loginIdAvailable) return fail('아이디 중복 확인을 해 주세요', 'ins-loginId');
      if (password.length < 8) return fail('비밀번호를 8자 이상 입력해 주세요', 'ins-password');
    }
    if (!agreed) return fail('개인정보 수집·이용에 동의해 주세요', 'ins-agree');

    setBusy(true);
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
      if (!res.ok) {
        setError(data.error ?? '신청하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      // 신청 직후 자동 로그인된 상태 — 입금 안내가 있는 마이페이지로 보낸다.
      router.replace('/my');
    } catch (err) {
      setError(requestError(err));
    } finally {
      setBusy(false);
    }
  }

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
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              autoComplete="name"
              className={inputClass}
              placeholder="예) 홍길동"
            />
          </div>
          <div>
            <label htmlFor="ins-phone" className="mb-1 block text-sm font-medium">
              전화번호
            </label>
            <input
              id="ins-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              className={inputClass}
              placeholder="예) 010-1234-5678"
            />
            <p className="mt-1 text-xs text-muted">
              방문 전 연락과 입금 확인 안내를 이 번호로 보내드립니다.
            </p>
          </div>
          <div>
            <span id="ins-address" className="mb-1 block text-sm font-medium">
              주소
            </span>
            <LocationPicker value={location} onChange={setLocation} />
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
            <label htmlFor="ins-date" className="mb-1 block text-sm font-medium">
              희망 날짜
            </label>
            <input
              id="ins-date"
              type="date"
              value={preferredDate}
              min={minDate}
              max={maxDate}
              onChange={(e) => setPreferredDate(e.target.value)}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-muted">
              {minDate}부터 {maxDate} 사이에서 선택할 수 있어요. 날짜별 예약 인원 제한은 없습니다.
            </p>
            {isDateString(preferredDate) && (
              <p className="mt-1 text-sm font-semibold text-brand-700">
                {formatVisitDate(preferredDate)}
              </p>
            )}
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium">희망 시간대</span>
            <div className="grid grid-cols-3 gap-2">
              {TIME_SLOTS.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  aria-pressed={timeSlot === slot}
                  aria-label={TIME_SLOT_LABEL[slot]}
                  onClick={() => setTimeSlot(slot)}
                  className={`min-h-14 rounded-xl border px-2 py-1.5 text-sm font-semibold transition ${
                    timeSlot === slot
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-border bg-white text-fg'
                  }`}
                >
                  <span className="block">{TIME_SLOT_SHORT[slot]}</span>
                  <span className="block text-xs font-normal opacity-75">
                    {TIME_SLOT_RANGE[slot]}
                  </span>
                </button>
              ))}
            </div>
          </div>
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
            {/* LoginIdCheckField 가 자체 라벨("로그인 아이디")과 피드백 문구를 렌더한다 —
                바깥에서 라벨을 또 붙이면 화면에 라벨이 두 줄로 겹친다. */}
            <LoginIdCheckField
              id="ins-loginId"
              value={loginId}
              onChange={setLoginId}
              onAvailabilityChange={setLoginIdAvailable}
              className={inputClass}
            />
            <PasswordInput
              id="ins-password"
              value={password}
              onChange={setPassword}
              className={inputClass}
              placeholder="8자 이상"
            />
          </section>
        )}

        <label
          id="ins-agree"
          className="flex items-start gap-3 rounded-2xl border border-border bg-white p-4 text-sm"
        >
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600"
          />
          <span className="leading-relaxed text-muted">
            점검 방문과 입금 확인을 위해 이름·연락처·주소를 수집·이용하는 데 동의합니다.{' '}
            <Link href="/privacy" className="font-semibold text-brand-700 underline">
              개인정보처리방침
            </Link>
          </span>
        </label>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className={buttonClasses('primary', 'lg', 'w-full')}
        >
          {busy ? '신청 중…' : `${formatWon(INSPECTION_PRICE_WON)} 정기 점검 신청하기`}
        </button>
        <p className="text-center text-xs text-muted">
          신청 후 입금해 주시면 관리자가 확인한 뒤 점검이 시작됩니다.
        </p>
      </form>
    </main>
  );
}
