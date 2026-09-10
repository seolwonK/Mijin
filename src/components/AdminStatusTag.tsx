const STATUS: Record<string, string> = {
  RECEIVED: '배정대기', ASSIGNED: '배정됨', ACCEPTED: '수락됨', DISPATCHED: '출동중', COMPLETED: '완료', CANCELED: '취소',
};
export function adminStatusLabel(status: string): string { return STATUS[status] ?? status; }
export function AdminStatusTag({ status }: { status: string }) {
  return <span className={styles.status} data-status={status}>{adminStatusLabel(status)}</span>;
}
const URGENCY: Record<string, string> = { CRITICAL: '초긴급', URGENT: '긴급', NORMAL: '일반' };
export function AdminUrgencyTag({ urgency }: { urgency: string }) {
  return <span className={styles.urgency} data-urgency={urgency}>{URGENCY[urgency] ?? urgency}</span>;
}
import styles from '@/components/admin-queue.module.css';
