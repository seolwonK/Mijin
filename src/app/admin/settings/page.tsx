'use client';

import { useEffect, useState } from 'react';
import BackButton from '@/components/BackButton';

type Settings = {
  autoAssignEnabled: boolean;
  waitMinutesCritical: number;
  waitMinutesUrgent: number;
  waitMinutesNormal: number;
  employerName: string;
  employerCeo: string | null;
  employerAddress: string | null;
  employerPhone: string | null;
  employerBizRegNo: string | null;
  employerSignatureDataUrl: string | null;
  defaultDailyWage: number | null;
  defaultMonthlyWage: number | null;
  defaultPayDate: string | null;
  defaultPayMethod: 'BANK_TRANSFER' | 'DIRECT' | null;
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
          employerName: settings.employerName?.trim() || '미진전기',
          employerCeo: settings.employerCeo?.trim() || null,
          employerAddress: settings.employerAddress?.trim() || null,
          employerPhone: settings.employerPhone?.trim() || null,
          employerBizRegNo: settings.employerBizRegNo?.trim() || null,
          employerSignatureDataUrl: settings.employerSignatureDataUrl || null,
          defaultDailyWage: settings.defaultDailyWage ?? null,
          defaultMonthlyWage: settings.defaultMonthlyWage ?? null,
          defaultPayDate: settings.defaultPayDate?.trim() || null,
          defaultPayMethod: settings.defaultPayMethod || null,
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
        <h1 className="text-lg font-bold">설정</h1>
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

        <section className="rounded-2xl border border-gray-200 p-4">
          <p className="mb-1 font-bold">근로계약서 사업주(고용주) 정보</p>
          <p className="mb-3 text-sm text-gray-500">
            개인기술자 근로계약서에 자동 기입됩니다.
          </p>
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-xs text-gray-500">사업체명</label>
              <input
                type="text"
                value={settings.employerName ?? ''}
                onChange={(e) => setSettings({ ...settings, employerName: e.target.value })}
                placeholder="미진전기"
                className="w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">대표자</label>
              <input
                type="text"
                value={settings.employerCeo ?? ''}
                onChange={(e) => setSettings({ ...settings, employerCeo: e.target.value })}
                className="w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">주소</label>
              <input
                type="text"
                value={settings.employerAddress ?? ''}
                onChange={(e) =>
                  setSettings({ ...settings, employerAddress: e.target.value })
                }
                className="w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-gray-500">전화</label>
                <input
                  type="tel"
                  value={settings.employerPhone ?? ''}
                  onChange={(e) =>
                    setSettings({ ...settings, employerPhone: e.target.value })
                  }
                  className="w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-gray-500">사업자등록번호</label>
                <input
                  type="text"
                  value={settings.employerBizRegNo ?? ''}
                  onChange={(e) =>
                    setSettings({ ...settings, employerBizRegNo: e.target.value })
                  }
                  className="w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 p-4">
          <p className="mb-1 font-bold">근로계약서 기본값</p>
          <p className="mb-3 text-sm text-gray-500">
            계약서 생성 시 자동 기입됩니다. 비워두면 계약서에 &ldquo;추후 협의&rdquo;로
            표기됩니다.
          </p>
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-gray-500">
                  일용 기본 일급 (원)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={settings.defaultDailyWage ?? ''}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultDailyWage: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-gray-500">
                  상시 기본 월급 (원)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={settings.defaultMonthlyWage ?? ''}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultMonthlyWage: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">임금지급일</label>
              <input
                type="text"
                value={settings.defaultPayDate ?? ''}
                onChange={(e) =>
                  setSettings({ ...settings, defaultPayDate: e.target.value })
                }
                placeholder="예: 매월 25일"
                className="w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">지급방법</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'BANK_TRANSFER', label: '예금통장 입금' },
                  { value: 'DIRECT', label: '직접 지급' },
                ].map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() =>
                      setSettings({
                        ...settings,
                        defaultPayMethod:
                          settings.defaultPayMethod === m.value
                            ? null
                            : (m.value as 'BANK_TRANSFER' | 'DIRECT'),
                      })
                    }
                    className={`rounded-xl border p-3 text-sm font-medium ${
                      settings.defaultPayMethod === m.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 bg-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-500">
                회사 서명/직인 이미지
              </label>
              <p className="mb-2 text-xs text-gray-400">
                한 번 등록하면 모든 계약서 사업주 서명란에 자동 삽입됩니다.
              </p>
              {settings.employerSignatureDataUrl ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={settings.employerSignatureDataUrl}
                    alt="회사 서명"
                    className="h-20 rounded-lg border border-gray-200 bg-white object-contain p-1"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({ ...settings, employerSignatureDataUrl: null })
                    }
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600"
                  >
                    삭제
                  </button>
                </div>
              ) : (
                <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-blue-300 bg-blue-50 p-3 text-sm font-medium text-blue-700">
                  📎 서명/직인 이미지 첨부 (PNG 권장)
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = () =>
                        setSettings((s) =>
                          s
                            ? { ...s, employerSignatureDataUrl: String(reader.result) }
                            : s,
                        );
                      reader.readAsDataURL(f);
                    }}
                  />
                </label>
              )}
            </div>
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
