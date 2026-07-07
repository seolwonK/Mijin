'use client';

import { useEffect, useState } from 'react';
import BackButton from '@/components/BackButton';

type Settings = {
  autoAssignEnabled: boolean;
  waitMinutesCritical: number;
  waitMinutesUrgent: number;
  waitMinutesNormal: number;
};

const inputClass =
  'w-24 rounded-xl border border-gray-300 p-3 text-center text-base focus:border-blue-500 focus:outline-none';

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/admin/settings', { cache: 'no-store' });
      if (res.ok) setSettings(await res.json());
      else setError('설정을 불러오지 못했습니다');
    })();
  }, []);

  async function save() {
    if (!settings) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoAssignEnabled: settings.autoAssignEnabled,
          waitMinutesCritical: Number(settings.waitMinutesCritical),
          waitMinutesUrgent: Number(settings.waitMinutesUrgent),
          waitMinutesNormal: Number(settings.waitMinutesNormal),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '저장에 실패했습니다');
        return;
      }
      setSettings(data);
      setMessage('저장되었습니다');
    } catch {
      setError('네트워크 오류가 발생했습니다');
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return <main className="p-6 text-center text-gray-400">{error ?? '불러오는 중…'}</main>;
  }

  const rows: { key: keyof Settings; label: string; badge: string }[] = [
    { key: 'waitMinutesCritical', label: '초긴급 (1시간 내)', badge: 'bg-red-600' },
    { key: 'waitMinutesUrgent', label: '긴급 (2시간 내)', badge: 'bg-orange-500' },
    { key: 'waitMinutesNormal', label: '일반', badge: 'bg-gray-500' },
  ];

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-gray-200 bg-white/95 px-4 py-2 backdrop-blur">
        <BackButton fallback="/admin" />
        <h1 className="text-lg font-bold">자동배정 설정</h1>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <section className="rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold">자동배정 사용</p>
              <p className="mt-1 text-sm text-gray-500">
                수동 배정이 기본입니다. 켜면 아래 대기시간 안에 수동 배정이 없을 때
                가장 가까운 활성 업체에 자동 배정됩니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setSettings({ ...settings, autoAssignEnabled: !settings.autoAssignEnabled })
              }
              className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${
                settings.autoAssignEnabled ? 'bg-blue-600' : 'bg-gray-300'
              }`}
              aria-label="자동배정 토글"
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
                  settings.autoAssignEnabled ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 p-4">
          <p className="mb-3 font-bold">긴급도별 자동배정 대기시간 (분)</p>
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.key} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold text-white ${row.badge}`}
                  >
                    {row.label}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={settings[row.key] as number}
                    onChange={(e) =>
                      setSettings({ ...settings, [row.key]: Number(e.target.value) })
                    }
                    className={inputClass}
                  />
                  <span className="text-sm text-gray-500">분</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {error && (
          <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">{error}</p>
        )}
        {message && (
          <p className="rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">
            {message}
          </p>
        )}

        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="h-14 w-full rounded-2xl bg-blue-600 text-lg font-bold text-white disabled:opacity-60"
        >
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>
    </main>
  );
}
