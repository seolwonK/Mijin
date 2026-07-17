'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { useConfirm } from '@/components/useConfirm';

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

// "관제탑"(B) B-라이트 — admin-md 라디우스 + 사이언 잉크 액센트. 설정 저장 로직은 불변.
const inputClass =
  'w-24 rounded-admin-md border border-border p-3 text-center text-base focus:border-admin-cyan-ink focus:outline-none';
const fieldClass =
  'w-full rounded-admin-md border border-border p-3 text-base focus:border-admin-cyan-ink focus:outline-none';

// PUT 페이로드 직렬화 — 전체 저장(save)과 토글 즉시 저장(toggleAutoAssign)이 공유한다.
function toPayload(s: Settings) {
  return {
    autoAssignEnabled: s.autoAssignEnabled,
    waitMinutesCritical: Number(s.waitMinutesCritical),
    waitMinutesUrgent: Number(s.waitMinutesUrgent),
    waitMinutesNormal: Number(s.waitMinutesNormal),
    employerName: s.employerName?.trim() || '미진전기',
    employerCeo: s.employerCeo?.trim() || null,
    employerAddress: s.employerAddress?.trim() || null,
    employerPhone: s.employerPhone?.trim() || null,
    employerBizRegNo: s.employerBizRegNo?.trim() || null,
    employerSignatureDataUrl: s.employerSignatureDataUrl || null,
    defaultDailyWage: s.defaultDailyWage ?? null,
    defaultMonthlyWage: s.defaultMonthlyWage ?? null,
    defaultPayDate: s.defaultPayDate?.trim() || null,
    defaultPayMethod: s.defaultPayMethod || null,
  };
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  // 마지막으로 서버에 저장된 값 — 토글 즉시 저장이 편집 중인 다른 필드를 함께 커밋하지 않도록
  // 토글 PUT은 이 스냅샷 + 새 토글 값으로만 구성한다.
  const [saved, setSaved] = useState<Settings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [confirm, confirmUI] = useConfirm();

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/admin/settings', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as Settings;
        setSettings(data);
        setSaved(data);
      } else setError('설정을 불러오지 못했습니다');
    })();
  }, []);

  // 토글 변경은 확인 후 즉시 저장하고, 실패 시 토글을 되돌린다.
  async function toggleAutoAssign() {
    if (!settings || !saved || toggleBusy) return;
    const next = !settings.autoAssignEnabled;
    if (
      !(await confirm({
        title: '자동배정 설정 변경',
        message: `자동배정을 ${next ? '켜기' : '끄기'}로 변경하시겠습니까?\n변경 후 즉시 적용됩니다.`,
        confirmText: '변경',
      }))
    )
      return;
    setSettings({ ...settings, autoAssignEnabled: next });
    setToggleBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...toPayload(saved), autoAssignEnabled: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSettings((s) => (s ? { ...s, autoAssignEnabled: !next } : s));
        setError(data.error ?? '자동배정 설정 변경에 실패했습니다');
        return;
      }
      setSaved(data);
      setSettings((s) => (s ? { ...s, autoAssignEnabled: data.autoAssignEnabled } : s));
    } catch {
      setSettings((s) => (s ? { ...s, autoAssignEnabled: !next } : s));
      setError('네트워크 오류가 발생했습니다');
    } finally {
      setToggleBusy(false);
    }
  }

  async function save() {
    if (!settings) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(settings)),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '저장에 실패했습니다');
        return;
      }
      setSettings(data);
      setSaved(data);
      setMessage('저장되었습니다');
    } catch {
      setError('네트워크 오류가 발생했습니다');
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return <main className="p-6 text-center text-muted">{error ?? '불러오는 중…'}</main>;
  }

  const rows: { key: keyof Settings; label: string; badge: string }[] = [
    { key: 'waitMinutesCritical', label: '초긴급 (1시간 내)', badge: 'bg-red-600' },
    { key: 'waitMinutesUrgent', label: '긴급 (2시간 내)', badge: 'bg-orange-500' },
    { key: 'waitMinutesNormal', label: '일반', badge: 'bg-neutral-500' },
  ];

  return (
    <main className="min-h-screen">
      <PageHeader title="설정" back="/admin" />

      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <section className="rounded-admin-md border border-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold">자동배정 사용</p>
              <p className="mt-1 text-sm text-muted">
                수동 배정이 기본입니다. 켜면 아래 대기시간 안에 수동 배정이 없을 때
                가장 가까운 활성 업체에 자동 배정됩니다.
              </p>
              <p className="mt-1 text-xs text-muted">
                {toggleBusy ? '적용 중…' : '변경 시 확인 후 즉시 적용됩니다.'}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleAutoAssign}
              disabled={toggleBusy}
              aria-pressed={settings.autoAssignEnabled}
              className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${
                settings.autoAssignEnabled ? 'bg-admin-cyan-ink' : 'bg-neutral-300'
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

        <section className="rounded-admin-md border border-border p-4">
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
                    aria-label={`${row.label} 자동배정 대기시간(분)`}
                    className={inputClass}
                  />
                  <span className="text-sm text-muted">분</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-admin-md border border-border p-4">
          <p className="mb-1 font-bold">근로계약서 사업주(고용주) 정보</p>
          <p className="mb-3 text-sm text-muted">
            개인기술자 근로계약서에 자동 기입됩니다.
          </p>
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-xs md:text-sm text-muted">사업체명</label>
              <input
                type="text"
                value={settings.employerName ?? ''}
                onChange={(e) => setSettings({ ...settings, employerName: e.target.value })}
                placeholder="미진전기"
                aria-label="사업체명"
                className={fieldClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs md:text-sm text-muted">대표자</label>
              <input
                type="text"
                value={settings.employerCeo ?? ''}
                onChange={(e) => setSettings({ ...settings, employerCeo: e.target.value })}
                aria-label="대표자"
                className={fieldClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs md:text-sm text-muted">주소</label>
              <input
                type="text"
                value={settings.employerAddress ?? ''}
                onChange={(e) =>
                  setSettings({ ...settings, employerAddress: e.target.value })
                }
                aria-label="주소"
                className={fieldClass}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs md:text-sm text-muted">전화</label>
                <input
                  type="tel"
                  value={settings.employerPhone ?? ''}
                  onChange={(e) =>
                    setSettings({ ...settings, employerPhone: e.target.value })
                  }
                  aria-label="전화"
                  className={fieldClass}
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs md:text-sm text-muted">사업자등록번호</label>
                <input
                  type="text"
                  value={settings.employerBizRegNo ?? ''}
                  onChange={(e) =>
                    setSettings({ ...settings, employerBizRegNo: e.target.value })
                  }
                  aria-label="사업자등록번호"
                  className={fieldClass}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-admin-md border border-border p-4">
          <p className="mb-1 font-bold">근로계약서 기본값</p>
          <p className="mb-3 text-sm text-muted">
            계약서 생성 시 자동 기입됩니다. 비워두면 계약서에 &ldquo;추후 협의&rdquo;로
            표기됩니다.
          </p>
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs md:text-sm text-muted">
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
                  aria-label="일용 기본 일급 (원)"
                  className={fieldClass}
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs md:text-sm text-muted">
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
                  aria-label="상시 기본 월급 (원)"
                  className={fieldClass}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs md:text-sm text-muted">임금지급일</label>
              <input
                type="text"
                value={settings.defaultPayDate ?? ''}
                onChange={(e) =>
                  setSettings({ ...settings, defaultPayDate: e.target.value })
                }
                placeholder="예: 매월 25일"
                aria-label="임금지급일"
                className={fieldClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs md:text-sm text-muted">지급방법</label>
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
                    className={`rounded-admin-md border p-3 text-sm font-medium ${
                      settings.defaultPayMethod === m.value
                        ? 'border-admin-cyan-ink bg-admin-cyan-ink/5 text-admin-cyan-ink'
                        : 'border-border bg-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs md:text-sm text-muted">
                회사 서명/직인 이미지
              </label>
              <p className="mb-2 text-xs md:text-sm text-muted">
                한 번 등록하면 모든 계약서 사업주 서명란에 자동 삽입됩니다.
              </p>
              {settings.employerSignatureDataUrl ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={settings.employerSignatureDataUrl}
                    alt="회사 서명"
                    className="h-20 rounded-admin-sm border border-border bg-white object-contain p-1"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({ ...settings, employerSignatureDataUrl: null })
                    }
                    className="rounded-admin-sm border border-border px-3 py-2 text-sm font-medium text-muted"
                  >
                    삭제
                  </button>
                </div>
              ) : (
                <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-admin-md border border-admin-cyan-ink/30 bg-admin-cyan-ink/5 p-3 text-sm font-medium text-admin-cyan-ink">
                  서명/직인 이미지 첨부 (PNG 권장)
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
          <p className="rounded-admin-md bg-red-50 p-3 text-sm font-medium text-red-600">{error}</p>
        )}
        {message && (
          <p className="rounded-admin-md bg-green-50 p-3 text-sm font-medium text-green-700">
            {message}
          </p>
        )}

        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="flex h-14 w-full items-center justify-center rounded-admin-md bg-admin-cyan-ink text-lg font-bold text-white transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>
      {confirmUI}
    </main>
  );
}
