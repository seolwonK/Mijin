'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (!description.trim() && !voice)
      return setError('고장 내용을 입력하거나 음성으로 남겨 주세요');
    if (!urgency) return setError('긴급도를 선택해 주세요');
    if (!location.lat && !location.address.trim())
      return setError('위치 확인 버튼을 누르거나 주소를 입력해 주세요');
    if (!name.trim()) return setError('이름을 입력해 주세요');
    if (!/^0\d{8,10}$/.test(phone.replace(/\D/g, '')))
      return setError('전화번호를 확인해 주세요');

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
      router.replace(`/request/complete/${data.id}`);
    } catch {
      setError('네트워크 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-gray-200 p-4">
        <Link href="/" className="text-xl">
          ←
        </Link>
        <h1 className="text-lg font-bold">고장 접수</h1>
      </header>

      <div className="flex-1 space-y-6 p-4 pb-32">
        <section>
          <h2 className="mb-2 font-semibold">
            1. 어떤 고장인가요? <span className="text-red-500">*</span>
          </h2>
          <SpeechInput
            value={description}
            onChange={setDescription}
            voice={voice}
            onVoiceChange={setVoice}
          />
        </section>

        <section>
          <h2 className="mb-2 font-semibold">
            2. 얼마나 급한가요? <span className="text-red-500">*</span>
          </h2>
          <UrgencySelect value={urgency} onChange={setUrgency} />
        </section>

        <section>
          <h2 className="mb-2 font-semibold">
            3. 어디로 가야 하나요? <span className="text-red-500">*</span>
          </h2>
          <LocationPicker value={location} onChange={setLocation} />
        </section>

        <section>
          <h2 className="mb-2 font-semibold">
            4. 연락처 <span className="text-red-500">*</span>
          </h2>
          <div className="space-y-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름"
              className="w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-500 focus:outline-none"
            />
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="전화번호 (예: 01012345678)"
              className="w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-500 focus:outline-none"
            />
          </div>
        </section>

        {error && (
          <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">
            {error}
          </p>
        )}
      </div>

      <div className="fixed bottom-0 left-1/2 w-full max-w-md -translate-x-1/2 border-t border-gray-200 bg-white p-4">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="h-14 w-full rounded-2xl bg-blue-600 text-lg font-bold text-white active:bg-blue-700 disabled:opacity-60"
        >
          {busy ? '접수 중…' : '접수하기'}
        </button>
      </div>
    </main>
  );
}
