import styles from '@/components/portal.module.css';
export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={styles.frame}>{children}</div>;
}
