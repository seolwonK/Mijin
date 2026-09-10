'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import RegionMultiSelect from '@/components/RegionMultiSelect';
import PortalLoadState from '@/components/PortalLoadState';
import PortalSupportLink from '@/components/PortalSupportLink';
import { readApiJson, requestError } from '@/lib/clientApi';
const inputClass =
  'min-h-12 w-full rounded-lg border border-border bg-white px-3 text-base';
type Profile = {
  loginId: string;
  name: string;
  phone: string;
  address: string;
  regions: string[];
  isActive: boolean;
  approvalStatus: string;
  bizRegNo?: string | null;
  employmentType?: string;
};
type Draft = Pick<Profile, 'phone' | 'address' | 'regions' | 'isActive'>;
const draftOf = (p: Profile): Draft => ({
  phone: p.phone,
  address: p.address,
  regions: p.regions,
  isActive: p.isActive,
});
export default function PortalProfile({
  scope,
}: {
  scope: 'partner' | 'tech';
}) {
  const loadSequence = useRef(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty =
    !!profile &&
    !!draft &&
    JSON.stringify(draftOf(profile)) !== JSON.stringify(draft);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const p = await readApiJson<Profile>(
        await fetch(`/api/${scope}/profile`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(15_000),
        }),
      );
      if (sequence !== loadSequence.current) return;
      setLoadError(null);
      setProfile(p);
      setDraft(draftOf(p));
    } catch (e) {
      if (sequence === loadSequence.current) setLoadError(requestError(e));
    }
  }, [scope]);
  useEffect(() => {
    // Fetching initial form values is intentional; subsequent refreshes must not clobber edits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const leave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  function edit(value: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...value } : d));
    setSaved(false);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const next: Record<string, string> = {};
    const normalized = {
      ...draft,
      phone: draft.phone.replace(/\D/g, ''),
      address: draft.address.trim(),
    };
    if (!/^0\d{8,10}$/.test(normalized.phone))
      next.phone = '전화번호를 확인해 주세요. 예: 01012345678';
    if (!normalized.address) next.address = '주소를 입력해 주세요.';
    setFields(next);
    setError('');
    setSaved(false);
    if (Object.keys(next).length) {
      document.getElementById(Object.keys(next)[0])?.focus();
      return;
    }
    setBusy(true);
    try {
      await readApiJson(
        await fetch(`/api/${scope}/profile`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalized),
          signal: AbortSignal.timeout(15_000),
        }),
      );
      setProfile((p) => p && { ...p, ...normalized });
      setDraft(normalized);
      setSaved(true);
    } catch (e) {
      setError(requestError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-surface">
      <PageHeader title="내 정보" back={`/${scope}`} />
      <div className="mx-auto max-w-2xl p-4">
        <PortalLoadState
          label="내 정보"
          error={loadError}
          loading={!profile && !loadError}
          retry={load}
        />
        {profile && draft && (
          <form noValidate onSubmit={save} className="space-y-5 pb-8">
            <section className="rounded-xl border border-border bg-white p-4">
              <h2 className="font-bold">
                {scope === 'partner' ? '업체' : '기사'} 정보
              </h2>
              <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted">이름</dt>
                <dd>{profile.name}</dd>
                <dt className="text-muted">아이디</dt>
                <dd>{profile.loginId}</dd>
                <dt className="text-muted">승인 상태</dt>
                <dd>
                  {{
                    APPROVED: '승인 완료',
                    PENDING: '승인 대기',
                    REJECTED: '승인 거절',
                  }[profile.approvalStatus] ?? profile.approvalStatus}
                </dd>
                {profile.bizRegNo && (
                  <>
                    <dt className="text-muted">사업자등록번호</dt>
                    <dd>{profile.bizRegNo}</dd>
                  </>
                )}
                {profile.employmentType && (
                  <>
                    <dt className="text-muted">고용 형태</dt>
                    <dd>
                      {profile.employmentType === 'PERMANENT'
                        ? '정규직'
                        : '일용직'}
                    </dd>
                  </>
                )}
              </dl>
              <p className="mt-3 text-sm text-muted">
                이름·아이디 등 신원 정보 변경이나 승인 상태는 관리자에게 문의해
                주세요.
              </p>
              <PortalSupportLink />
            </section>
            <fieldset disabled={busy} className="space-y-5">
              <section className="space-y-4 rounded-xl border border-border bg-white p-4">
                <h2 className="font-bold">연락처 · 위치</h2>
                {[
                  ['phone', '배정 연락처'],
                  ['address', '주소'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label
                      htmlFor={key}
                      className="mb-1 block text-sm font-semibold"
                    >
                      {label}
                    </label>
                    <input
                      id={key}
                      type={key === 'phone' ? 'tel' : 'text'}
                      autoComplete={key === 'phone' ? 'tel' : 'street-address'}
                      value={draft[key as 'phone' | 'address']}
                      maxLength={key === 'phone' ? 20 : 200}
                      onChange={(e) => edit({ [key]: e.target.value })}
                      aria-invalid={!!fields[key]}
                      aria-describedby={`${key}-help${fields[key] ? ` ${key}-error` : ''}`}
                      className={inputClass}
                    />
                    <p id={`${key}-help`} className="mt-1 text-sm text-muted">
                      {key === 'phone'
                        ? '배정과 고객 연락에 사용하는 전화번호입니다.'
                        : '주소를 변경하면 배정 거리 계산에 사용하는 위치를 다시 확인합니다.'}
                    </p>
                    {fields[key] && (
                      <p
                        id={`${key}-error`}
                        role="alert"
                        className="mt-1 text-sm text-red-700"
                      >
                        {fields[key]}
                      </p>
                    )}
                  </div>
                ))}
              </section>
              <section className="space-y-3 rounded-xl border border-border bg-white p-4">
                <h2 className="font-bold">서비스 가능 지역</h2>
                <p className="text-sm text-muted">
                  선택한 지역의 요청을 받습니다. 비워두면 전 지역의 요청을
                  받습니다.
                </p>
                <RegionMultiSelect
                  value={draft.regions}
                  onChange={(regions) => edit({ regions })}
                />
              </section>
              <section className="rounded-xl border border-border bg-white p-4">
                <h2 id="availability-label" className="font-bold">
                  새 배정 받기
                </h2>
                <p id="availability-help" className="my-2 text-sm text-muted">
                  끄면 새 배정을 받지 않습니다. 진행 중인 건은 유지됩니다. 변경
                  후 저장하기를 눌러야 적용됩니다.
                </p>
                <button
                  type="button"
                  role="switch"
                  aria-labelledby="availability-label"
                  aria-describedby="availability-help"
                  aria-checked={draft.isActive}
                  onClick={() => edit({ isActive: !draft.isActive })}
                  className={`min-h-12 min-w-32 rounded-lg border px-4 font-semibold ${draft.isActive ? 'border-brand-700 bg-brand-50 text-brand-900' : 'border-border bg-neutral-100'}`}
                >
                  {draft.isActive ? '켜짐 · 배정 받기' : '꺼짐 · 배정 중지'}
                </button>
              </section>
            </fieldset>
            {dirty && (
              <p role="status" className="text-sm font-medium text-amber-900">
                아직 저장하지 않은 변경사항이 있습니다.
              </p>
            )}
            {saved && (
              <p
                role="status"
                className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
              >
                저장되었습니다. 배정 설정에 적용했습니다.
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </p>
            )}
            <button
              disabled={busy}
              className="min-h-14 w-full rounded-xl bg-brand-700 text-lg font-bold text-white disabled:opacity-50"
            >
              {busy ? '저장 중…' : '저장하기'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
