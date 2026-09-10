'use client';

import { useCallback, useEffect, useState } from 'react';
import type { EggChargeAccountSettings } from '@/lib/eggChargeAccount';
import PortalLoadState from '@/components/PortalLoadState';

const empty = { eggBankName: '', eggBankAccountNumber: '', eggBankAccountHolder: '' };
const fields = [
  ['eggBankName', '은행명', 50],
  ['eggBankAccountNumber', '계좌번호', 50],
  ['eggBankAccountHolder', '예금주', 100],
] as const;

export default function AdminEggChargeSettings() {
  const [form, setForm] = useState(empty);
  const [saved, setSaved] = useState(empty);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/egg-charge-account', { cache: 'no-store' });
      if (!res.ok) throw new Error('입금 계좌를 불러오지 못했습니다.');
      const data = await res.json() as EggChargeAccountSettings;
      const values = {
        eggBankName: data.eggBankName ?? '',
        eggBankAccountNumber: data.eggBankAccountNumber ?? '',
        eggBankAccountHolder: data.eggBankAccountHolder ?? '',
      };
      setForm(values);
      setSaved(values);
      setLoaded(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결을 확인해 주세요.');
    }
  }, []);
  useEffect(() => {
    // 최초 조회의 상태 변경은 비동기 응답/오류를 받은 뒤에만 일어난다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/egg-charge-account', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '계좌 저장에 실패했습니다.');
      const values = {
        eggBankName: data.eggBankName ?? '',
        eggBankAccountNumber: data.eggBankAccountNumber ?? '',
        eggBankAccountHolder: data.eggBankAccountHolder ?? '',
      };
      setForm(values);
      setSaved(values);
      setMessage(data.eggBankName ? '입금 계좌가 저장되었습니다. 업체·기사 충전 화면에 적용됩니다.' : '입금 계좌를 해제했습니다. 충전 화면에는 계좌 준비 중으로 표시됩니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '네트워크 연결을 확인해 주세요.');
    } finally { setBusy(false); }
  }

  return (
    <section id="egg-charge-account" className="rounded-admin-md border border-border bg-white p-4">
      <h2 className="font-bold">알 충전 입금 계좌</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        업체·개인기술자에게 공통으로 안내할 계좌입니다. 1판 30알은 30,000원이며, 입금을 확인한 뒤 해당 회원의 알 크레딧에서 충전해 주세요.
      </p>
      {!loaded ? <div className="mt-4"><PortalLoadState label="입금 계좌 설정" error={error} loading={!error} retry={load} /></div> : (
        <form onSubmit={save} className="mt-4 space-y-3">
          <fieldset disabled={busy} className="space-y-3">
            {fields.map(([key, label, maxLength]) => (
              <div key={key}>
                <label htmlFor={key} className="mb-1 block text-sm font-medium">{label}</label>
                <input
                  id={key} value={form[key]} maxLength={maxLength} autoComplete="off"
                  onChange={e => { setForm({ ...form, [key]: e.target.value }); setMessage(null); }}
                  className="min-h-11 w-full rounded-admin-md border border-border px-3 text-base"
                />
              </div>
            ))}
          </fieldset>
          <p className="text-xs text-muted">계좌를 해제하려면 세 항목을 모두 비우고 계좌 저장을 눌러 주세요.</p>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {message && <p role="status" className="text-sm text-admin-cyan-ink">{message}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={busy || !dirty} className="min-h-11 rounded-admin-md bg-admin-cyan-ink px-4 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? '저장 중…' : '계좌 저장'}
            </button>
            {dirty && <p className="text-xs text-muted">아직 저장하지 않은 계좌 정보가 있습니다.</p>}
          </div>
        </form>
      )}
    </section>
  );
}
