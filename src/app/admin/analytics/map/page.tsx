import { Suspense } from 'react';
import AnalyticsMap from '@/components/AnalyticsMap';

export default function AdminAnalyticsMapPage() {
  return (
    <Suspense>
      <AnalyticsMap />
    </Suspense>
  );
}
