'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { buttonClasses } from '@/components/Button';
import SpeechInput, { type VoiceNote } from '@/components/SpeechInput';
import LocationPicker, { type LocationValue } from '@/components/LocationPicker';
import UrgencySelect, { type UrgencyValue } from '@/components/UrgencySelect';

export default function NewRequestPage() {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [voice, setVoice] = useState<VoiceNote | null>(null);
  const [urgency, setUrgency] = useState<UrgencyValue | null>(null);
  const [location, setLocation] = useState<LocationValue>({
    lat: null,
    lng: null,
    address: '',
  });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 새로고침/뒤로가기로 작성분이 사라지지 않도록 텍스트 입력을 임시저장한다.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('req_draft');
      if (!raw) return;
      const d = JSON.parse(raw) as {
        description?: string;
        name?: string;
        phone?: string;
        urgency?: UrgencyValue;
        location?: LocationValue;
      };
      queueMicrotask(() => {
        if (d.description) setDescription(d.description);
        if (d.name) setName(d.name);
        if (d.phone) setPhone(d.phone);
        if (d.urgency) setUrgency(d.urgency);
        if (d.location && (d.location.address || d.location.lat != null))
          setLocation(d.location);
      });
    } catch {
      /* 무시 */
    }
  }, []);
  useEffect(() => {
    try {
      // 음성 blob은 직렬화 대상이 아님 — 나머지 입력(긴급도·위치 포함)은 모두 복원한다.
      if (description || name || phone || urgency || location.address || location.lat != null)
        sessionStorage.setItem(
          'req_draft',
          JSON.stringify({ description, name, phone, urgency, location }),
        );
    } catch {
      /* 무시 */
    }
  }, [description, name, phone, urgency, location]);

  // 유효성 실패 시 안내 + 해당 위치로 스크롤·포커스
  function fail(msg: string, id?: string) {
    setError(msg);
    const el = id ? (document.getElementById(id) as HTMLElement | null) : null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus();
  }

  async function submit() {
    setError(null);
    if (!description.trim() && !voice)
      return fail('고장 내용을 입력하거나 음성으로 남겨 주세요', 'req-desc');
    if (!urgency) return fail('긴급도를 선택해 주세요', 'req-urgency');
    if (!location.lat && !location.address.trim())
      return fail('위치 확인 버튼을 누르거나 주소를 입력해 주세요', 'req-loc');
    if (!name.trim()) return fail('이름을 입력해 주세요', 'req-name');
    if (!/^0\d{8,10}$/.test(phone.replace(/\D/g, '')))
      return fail('전화번호를 확인해 주세요', 'req-phone');
    if (!agreed) return fail('개인정보 수집·이용에 동의해 주세요', 'req-agree');

    setBusy(true);
    try {
      let res: Response;
      if (voice) {
        // 녹음본이 있으면 multipart 로 파일까지 함께 전송
        const fd = new FormData();
        fd.append('customerName', name);
        fd.append('customerPhone', phone);
        fd.append('description', description);
        fd.append('urgency', urgency);
        if (location.lat != null) fd.append('lat', String(location.lat));
        if (location.lng != null) fd.append('lng', String(location.lng));
        if (location.address.trim()) fd.append('address', location.address.trim());
        fd.append('voice', voice.blob, 'voice');
        res = await fetch('/api/requests', { method: 'POST', body: fd });
      } else {
        res = await fetch('/api/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: name,
            customerPhone: phone,
            description,
            urgency,
            lat: location.lat,
            lng: location.lng,
            address: location.address.trim() || null,
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '접수에 실패했습니다');
        return;
      }
      sessionStorage.removeItem('req_draft');
      router.replace(`/request/complete/${data.id}`);
    } catch {
      setError('네트워크 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col">
      <PageHeader title="고장 접수" back="/" width="max-w-2xl" />

      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="contents">
      <div className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-4 pb-32 md:space-y-5 md:py-8 md:pb-6">
        <section id="req-desc" className="md:rounded-2xl md:bg-white md:p-6 md:shadow-surface-sm">
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-fg md:mb-4 md:text-lg">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">1</span>
            어떤 고장인가요? <span className="text-red-500">*</span>
            <span className="sr-only"> 필수</span>
          </h2>
          <SpeechInput
            value={description}
            onChange={setDescription}
            voice={voice}
            onVoiceChange={setVoice}
          />
        </section>

        <section id="req-urgency" className="md:rounded-2xl md:bg-white md:p-6 md:shadow-surface-sm">
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-fg md:mb-4 md:text-lg">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">2</span>
            얼마나 급한가요? <span className="text-red-500">*</span>
            <span className="sr-only"> 필수</span>
          </h2>
          <UrgencySelect value={urgency} onChange={setUrgency} />
        </section>

        <section id="req-loc" className="md:rounded-2xl md:bg-white md:p-6 md:shadow-surface-sm">
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-fg md:mb-4 md:text-lg">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">3</span>
            어디로 가야 하나요? <span className="text-red-500">*</span>
            <span className="sr-only"> 필수</span>
          </h2>
          <LocationPicker value={location} onChange={setLocation} />
        </section>

        <section className="md:rounded-2xl md:bg-white md:p-6 md:shadow-surface-sm">
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-fg md:mb-4 md:text-lg">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">4</span>
            연락처 <span className="text-red-500">*</span>
            <span className="sr-only"> 필수</span>
          </h2>
          <div className="space-y-2">
            <input
              type="text"
              autoComplete="name"
              id="req-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름"
              className="w-full rounded-xl border border-neutral-300 bg-white p-3 text-base text-fg placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none"
            />
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              id="req-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="전화번호 (예: 01012345678)"
              className="w-full rounded-xl border border-neutral-300 bg-white p-3 text-base text-fg placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none"
            />
          </div>
        </section>

        <label className="flex items-start gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            id="req-agree"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand-600"
          />
          <span>
            접수 처리 및 업체 연결을 위한 개인정보(이름, 연락처, 위치)의 수집·이용에
            동의합니다.
          </span>
        </label>

        {error && (
          <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600">
            {error}
          </p>
        )}
      </div>

      <div className="fixed bottom-0 left-1/2 w-full max-w-md -translate-x-1/2 border-t border-border bg-white px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:static md:left-auto md:mx-auto md:max-w-2xl md:translate-x-0 md:border-t-0 md:bg-transparent md:px-4 md:pt-0 md:pb-12">
        <button
          type="submit"
          disabled={busy}
          className={buttonClasses('primary', 'lg', 'w-full')}
        >
          {busy ? '접수 중…' : '접수하기'}
        </button>
      </div>
      </form>
    </main>
  );
}
