'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { buttonClasses } from '@/components/Button';
import { surfaceClasses } from '@/components/Surface';
import SpeechInput, { type VoiceNote } from '@/components/SpeechInput';
import LocationPicker, { type LocationValue } from '@/components/LocationPicker';
import UrgencySelect, { type UrgencyValue } from '@/components/UrgencySelect';
import { SYMPTOM_PREFILLS } from '@/lib/symptoms';

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

  // 진행감(단계 위계) — 3개 스텝 카드가 뷰포트 중간선을 지날 때마다 상단 레일을 갱신한다.
  // 순수 시각 보조(aria-hidden)이므로 옵저버가 실패해도 폼 기능에는 영향이 없다.
  const [activeStep, setActiveStep] = useState(1);
  const step1Ref = useRef<HTMLElement>(null);
  const step2Ref = useRef<HTMLElement>(null);
  const step3Ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const targets: [React.RefObject<HTMLElement | null>, number][] = [
      [step1Ref, 1],
      [step2Ref, 2],
      [step3Ref, 3],
    ];
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleSteps = entries
          .filter((e) => e.isIntersecting)
          .map((e) => targets.find(([ref]) => ref.current === e.target)?.[1])
          .filter((n): n is number => n != null);
        if (visibleSteps.length > 0) setActiveStep(Math.max(...visibleSteps));
      },
      { rootMargin: '-15% 0px -60% 0px', threshold: 0 },
    );
    for (const [ref] of targets) if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  // 새로고침/뒤로가기로 작성분이 사라지지 않도록 텍스트 입력을 임시저장한다.
  // 메인의 증상 버튼(?symptom=키)으로 들어온 경우엔 설명란 프리필이 초안보다 우선한다 —
  // 방금 버튼을 눌렀다는 것이 더 최신 의도이기 때문. 나머지 필드(이름·전화·긴급도·위치)는
  // 초안에서 그대로 복원한다. 긴급도는 프리필하지 않는다(고객이 직접 선택).
  useEffect(() => {
    let symptomPrefill: string | null = null;
    try {
      const key = new URLSearchParams(window.location.search).get('symptom');
      if (key) symptomPrefill = SYMPTOM_PREFILLS[key] ?? null;
    } catch {
      /* 무시 */
    }
    try {
      const raw = sessionStorage.getItem('req_draft');
      const d = (raw ? JSON.parse(raw) : {}) as {
        description?: string;
        name?: string;
        phone?: string;
        urgency?: UrgencyValue;
        location?: LocationValue;
      };
      queueMicrotask(() => {
        if (symptomPrefill) setDescription(symptomPrefill);
        else if (d.description) setDescription(d.description);
        if (d.name) setName(d.name);
        if (d.phone) setPhone(d.phone);
        if (d.urgency) setUrgency(d.urgency);
        if (d.location && (d.location.address || d.location.lat != null))
          setLocation(d.location);
      });
    } catch {
      queueMicrotask(() => {
        if (symptomPrefill) setDescription(symptomPrefill);
      });
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
      <div className="mx-auto w-full max-w-2xl flex-1 p-4 pb-32 md:py-10 md:pb-8">
        <p className="sr-only">이 접수는 총 3단계로 진행됩니다.</p>
        {/* 진행 레일 — 스크롤 위치에 따라 채워지는 3단 스텝 표시 (장식용, 스크린리더는 위 sr-only 문장으로 대체) */}
        <div aria-hidden="true" className="mb-6 flex items-center gap-2 md:mb-10">
          {[1, 2, 3].map((n, i) => (
            <div key={n} className="flex flex-1 items-center gap-2 last:flex-none">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ease-brand duration-brand-base ${
                  activeStep >= n ? 'bg-brand-600 text-white' : 'bg-neutral-200 text-neutral-500'
                }`}
              >
                {n}
              </span>
              {i < 2 && (
                <span
                  className={`h-0.5 flex-1 rounded-full transition-colors ease-brand duration-brand-base ${
                    activeStep > n ? 'bg-brand-600' : 'bg-neutral-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* 1단계 — 이 화면의 핵심 행위(고장 설명+긴급도)를 하나의 무게감 있는 카드로 묶는다.
            브랜드 틴트는 여기서만 쓴다: "1차 액션 표면" 원칙(Surface.tsx)에 맞는 유일한 지점. */}
        <section
          ref={step1Ref}
          className={surfaceClasses('rounded-3xl p-6 md:p-8', true)}
        >
          <p className="mb-1 text-xs font-bold text-brand-600">1단계</p>
          <h2 className="text-2xl font-bold text-fg">
            어떤 고장인가요? <span className="text-red-500">*</span>
            <span className="sr-only"> 필수</span>
          </h2>
          <div id="req-desc" className="mt-4">
            <SpeechInput
              value={description}
              onChange={setDescription}
              voice={voice}
              onVoiceChange={setVoice}
            />
          </div>

          <div id="req-urgency" className="mt-6 border-t border-border/70 pt-6">
            <h2 className="text-base font-bold text-fg">
              얼마나 급한가요? <span className="text-red-500">*</span>
              <span className="sr-only"> 필수</span>
            </h2>
            <div className="mt-3">
              <UrgencySelect value={urgency} onChange={setUrgency} />
            </div>
          </div>
        </section>

        {/* 2단계 — 위치. 1단계보다 한 단 낮은 무게(틴트 없음)로 카드 자체의 존재감을 낮춘다. */}
        <section
          ref={step2Ref}
          id="req-loc"
          className={surfaceClasses('mt-6 rounded-2xl p-6 md:mt-8', false)}
        >
          <p className="mb-1 text-xs font-bold text-muted">2단계</p>
          <h2 className="text-xl font-bold text-fg">
            어디로 가야 하나요? <span className="text-red-500">*</span>
            <span className="sr-only"> 필수</span>
          </h2>
          <div className="mt-4">
            <LocationPicker value={location} onChange={setLocation} />
          </div>
        </section>

        {/* 3단계 — 연락처+동의. 카드 표면을 아예 걷어내 "마무리 절차"로서 가장 낮은 무게를 준다. */}
        <section ref={step3Ref} className="mt-6 border-t border-border pt-6 md:mt-8">
          <p className="mb-1 text-xs font-bold text-muted">3단계</p>
          <h2 className="text-lg font-bold text-fg">
            연락처 <span className="text-red-500">*</span>
            <span className="sr-only"> 필수</span>
          </h2>
          <div className="mt-3 space-y-2">
            <input
              type="text"
              autoComplete="name"
              id="req-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름"
              className="w-full rounded-xl border border-neutral-300 bg-white p-3 text-base text-fg transition-colors ease-brand duration-brand-base placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none"
            />
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              id="req-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="전화번호 (예: 01012345678)"
              className="w-full rounded-xl border border-neutral-300 bg-white p-3 text-base text-fg transition-colors ease-brand duration-brand-base placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none"
            />
          </div>

          <label className="mt-4 flex items-start gap-2 text-sm text-neutral-600">
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
        </section>

        {error && (
          <p role="alert" className="mt-6 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600">
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
