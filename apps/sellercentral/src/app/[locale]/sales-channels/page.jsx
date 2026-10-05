import { Suspense } from 'react';
import PolarisLayout from '@/components/PolarisLayout';
import SalesChannelsPage from '@/components/pages/SalesChannelsPage';

export default function Page() {
  return <PolarisLayout><Suspense fallback={null}><SalesChannelsPage /></Suspense></PolarisLayout>;
}
