'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Surface from '@/components/Surface';
import { StatusPill, UrgencyPill, statusVisual } from '@/components/StatusPill';
import { MapPinIcon, PhoneIcon } from '@/components/icons';

export type PortalJob = {
  id: string;
  status: string;
  distanceKm: number | null;
  createdAt: string;
  request: {
    id: string;
    status: string;
    urgency: string;
    description: string;
    address: string | null;
    customerPhone?: string | null;
    createdAt: string;
  };
};

type JobDetail = {
  request: {
    customerPhone: string | null;
    lat: number | null;
    lng: number | null;
  };
};

const detailRequests = new Map<string, Promise<JobDetail | null>>();

function loadDetail(scope: 'partner' | 'tech', id: string) {
  const key = `${scope}:${id}`;
  const existing = detailRequests.get(key);
  if (existing) return existing;

  const request = fetch(`/api/${scope}/jobs/${id}`)
    .then(async (response) => (response.ok ? (response.json() as Promise<JobDetail>) : null))
    .catch(() => null);
  detailRequests.set(key, request);
  return request;
}

function assignedAt(value: string) {
  return new Date(value).toLocaleString('ko-KR');
}

export default function PortalJobCard({
  job,
  scope,
  highlight = false,
  activeQueue = false,
  priorHistory = [],
  timeline = false,
}: {
  job: PortalJob;
  scope: 'partner' | 'tech';
  highlight?: boolean;
  activeQueue?: boolean;
  priorHistory?: PortalJob[];
  timeline?: boolean;
}) {
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const requested = useRef(false);
  const visual = statusVisual(job.request.status);
  const href = `/${scope}/jobs/${job.id}`;

  useEffect(() => {
    if (!activeQueue || requested.current) return;
    requested.current = true;
    void loadDetail(scope, job.id).then(setDetail);
  }, [activeQueue, job.id, scope]);

  const phone = detail?.request.customerPhone;
  const { lat, lng } = detail?.request ?? {};
  const directionsHref = lat != null && lng != null
    ? `https://map.kakao.com/link/to/${encodeURIComponent(job.request.address ?? '고객 위치')},${lat},${lng}`
    : null;

  return (
    <div className={timeline ? 'relative pl-6 before:absolute before:bottom-0 before:left-2 before:top-5 before:w-px before:bg-border' : ''}>
      {timeline && <span className={`absolute left-0 top-4 h-4 w-4 rounded-full ${visual.dot}`} />}
      <Surface
        as="section"
        tint={highlight}
        className={`rounded-2xl border-l-4 ${visual.border} transition-transform hover:-translate-y-0.5 active:translate-y-0`}
      >
        <div className="flex items-stretch">
          <Link href={href} className="min-w-0 flex-1 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <UrgencyPill urgency={job.request.urgency} />
                <StatusPill status={job.request.status} />
              </div>
              {job.distanceKm != null && (
                <span className="shrink-0 text-sm font-medium text-muted">{job.distanceKm.toFixed(1)}km</span>
              )}
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-fg">{job.request.description}</p>
            {job.request.address && (
              <p className="mt-1 flex items-center gap-1 text-sm text-muted">
                <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
                {job.request.address}
              </p>
            )}
            <p className="mt-1 text-xs text-muted">배정 {assignedAt(job.createdAt)}</p>
          </Link>
          {(phone || directionsHref) && (
            <div className="flex shrink-0 flex-col border-l border-border">
              {phone && (
                <a href={`tel:${phone}`} aria-label="고객에게 전화" className="grid min-h-11 min-w-11 place-items-center text-brand-700">
                  <PhoneIcon className="h-5 w-5" />
                </a>
              )}
              {directionsHref && (
                <a href={directionsHref} target="_blank" rel="noreferrer" aria-label="길찾기" className="grid min-h-11 min-w-11 place-items-center text-amber-700">
                  <MapPinIcon className="h-5 w-5" />
                </a>
              )}
            </div>
          )}
        </div>
        {priorHistory.length > 0 && (
          <div className="border-t border-border px-4 py-2">
            <button
              type="button"
              aria-expanded={historyOpen}
              onClick={() => setHistoryOpen((open) => !open)}
              className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-muted"
            >
              최근 이력 {priorHistory.length}건
            </button>
            {historyOpen && (
              <ul className="mt-2 space-y-2 border-l border-border pl-3">
                {priorHistory.map((entry) => (
                  <li key={entry.id} className="text-xs text-muted">
                    <div className="flex items-center justify-between gap-2">
                      <StatusPill status={entry.request.status} />
                      <time>{assignedAt(entry.createdAt)}</time>
                    </div>
                    <p className="mt-1 line-clamp-1">{entry.request.description}</p>
                    <Link href={`/${scope}/jobs/${entry.id}`} className="mt-1 inline-block font-semibold text-brand-700">
                      상세 보기
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Surface>
    </div>
  );
}
