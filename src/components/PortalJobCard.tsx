'use client';

import { useState } from 'react';
import Link from 'next/link';
import ResponseDeadlineNote from '@/components/ResponseDeadlineNote';
import styles from '@/components/portal-dashboard.module.css';
import {
  statusVisual,
  portalJobStatus,
} from '@/components/StatusPill';
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
    lat?: number | null;
    lng?: number | null;
    createdAt: string;
  };
};

function assignedAt(value: string) {
  return new Date(value).toLocaleString('ko-KR');
}

export default function PortalJobCard({
  job,
  scope,
  activeQueue = false,
  priorHistory = [],
}: {
  job: PortalJob;
  scope: 'partner' | 'tech';
  activeQueue?: boolean;
  priorHistory?: PortalJob[];
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const status = portalJobStatus(job.status, job.request.status);
  const href = `/${scope}/jobs/${job.id}`;
  const { customerPhone: phone, lat, lng } = activeQueue
    ? job.request
    : { customerPhone: null, lat: null, lng: null };
  const directionsHref = lat != null && lng != null
    ? `https://map.kakao.com/link/to/${encodeURIComponent(job.request.address ?? '고객 위치')},${lat},${lng}`
    : null;
  const urgentLabel = job.request.urgency === 'CRITICAL'
    ? '초긴급' : job.request.urgency === 'URGENT' ? '긴급' : null;
  const waiting = job.status === 'REQUESTED';

  return (
    <article className={styles.job} data-past={!activeQueue} data-urgency={job.request.urgency}>
      <Link href={href} className={styles.jobLink} prefetch={false}>
        <div className={styles.jobMeta}>
          <span className={styles.jobState}>{statusVisual(status).label}</span>
          {urgentLabel && <span className={styles.urgency}>{urgentLabel}</span>}
          {job.distanceKm != null && (
            <span className={styles.distance}>{job.distanceKm.toFixed(1)}km</span>
          )}
        </div>
        <p className={styles.address}>{job.request.address || '주소 미등록'}</p>
        <p className={styles.description}>{job.request.description}</p>
        <time className={styles.jobDate} dateTime={job.createdAt} title={assignedAt(job.createdAt)}>
          배정 {new Date(job.createdAt).toLocaleString('ko-KR', {
            year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
          })}
        </time>
      </Link>
      {waiting && (
        <div className={styles.deadline}>
          <ResponseDeadlineNote assignedAt={job.createdAt} urgency={job.request.urgency} compact />
        </div>
      )}
      {activeQueue && (
        <div className={styles.jobFooter}>
          <div className={styles.jobActions}>
            {phone && (
              <a href={`tel:${phone}`} aria-label="고객에게 전화">
                <PhoneIcon className="h-3.5 w-3.5" /> 전화
              </a>
            )}
            {directionsHref && (
              <a href={directionsHref} target="_blank" rel="noreferrer" aria-label="길찾기">
                <MapPinIcon className="h-3.5 w-3.5" /> 길찾기
              </a>
            )}
            {job.request.address && (
              <Link href={`/${scope}/history?q=${encodeURIComponent(job.request.address)}`}>
                방문 이력
              </Link>
            )}
          </div>
          <Link href={href} prefetch={false} className={styles.jobAction} data-primary={waiting}>
            {waiting ? '배정 확인' : '작업 보기'} <span aria-hidden="true">→</span>
          </Link>
        </div>
      )}
      {priorHistory.length > 0 && (
        <div className={styles.historyToggle}>
          <button type="button" aria-expanded={historyOpen} onClick={() => setHistoryOpen(open => !open)}>
            최근 같은 장소 이력 {priorHistory.length}건 {historyOpen ? '−' : '+'}
          </button>
          {historyOpen && (
            <ul>
              {priorHistory.map(entry => (
                <li key={entry.id}>
                  <p>{statusVisual(portalJobStatus(entry.status, entry.request.status)).label} · {assignedAt(entry.createdAt)}</p>
                  <p className="line-clamp-1">{entry.request.description}</p>
                  <Link href={`/${scope}/jobs/${entry.id}`} prefetch={false}>상세 보기 →</Link>
                </li>
              ))}
              {job.request.address && (
                <li><Link href={`/${scope}/history?q=${encodeURIComponent(job.request.address)}`}>이 주소의 전체 내역 →</Link></li>
              )}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}
