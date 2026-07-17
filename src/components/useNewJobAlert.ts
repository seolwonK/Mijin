'use client';

import { useEffect, useRef, useState } from 'react';

// 새 배정(응답 대기) 감지 알림 — 폴링만으로는 화면을 계속 봐야 하는 문제(#6)를 보완한다.
// - 탭 타이틀 배지: 대기 건수를 (n) 접두로 표시해 다른 탭에 있어도 보이게 한다.
// - 새 건 도착 시: 짧은 비프(WebAudio, 에셋 불필요) + 진동(지원 기기) + 브라우저 알림(권한
//   허용 + 탭이 백그라운드일 때만). 알림 권한은 절대 자동 요청하지 않고 버튼으로만 요청한다.

// 2음 비프 — 사용자 제스처 이전에 AudioContext가 막히면 조용히 실패한다(베스트 에포트).
function beep() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const play = (freq: number, at: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.3);
    };
    play(880, 0);
    play(1175, 0.3);
    setTimeout(() => void ctx.close(), 1_000);
  } catch {
    // 무시 — 알림은 부가 기능, 실패해도 포털 동작에 영향 없음
  }
}

export function useNewJobAlert({
  waitingIds,
  ready,
  baseTitle,
}: {
  waitingIds: string[];
  ready: boolean;
  baseTitle: string;
}) {
  // 탭 타이틀 배지
  useEffect(() => {
    document.title = waitingIds.length > 0 ? `(${waitingIds.length}) ${baseTitle}` : baseTitle;
    return () => {
      document.title = baseTitle;
    };
  }, [waitingIds.length, baseTitle]);

  // 새 건 도착 감지 — 최초 로드분은 알리지 않고(이미 화면에 보임) 이후 추가분만 알린다.
  const knownRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (knownRef.current === null) {
      knownRef.current = new Set(waitingIds);
      return;
    }
    const known = knownRef.current;
    const fresh = waitingIds.filter((id) => !known.has(id));
    waitingIds.forEach((id) => known.add(id));
    if (fresh.length === 0) return;

    beep();
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      /* 무시 */
    }
    try {
      if (
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted' &&
        document.hidden
      ) {
        new Notification('새 배정 요청', {
          body: `응답 대기 ${waitingIds.length}건 — 앱에서 확인해 주세요.`,
        });
      }
    } catch {
      /* 무시 */
    }
  }, [ready, waitingIds]);

  // 브라우저 알림 권한 — 'default'일 때만 버튼을 노출해 명시적으로 요청한다.
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(
    'unsupported',
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotifPermission(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  }, []);
  async function enableNotifications() {
    if (typeof Notification === 'undefined') return;
    try {
      setNotifPermission(await Notification.requestPermission());
    } catch {
      /* 무시 */
    }
  }

  return { notifPermission, enableNotifications };
}
