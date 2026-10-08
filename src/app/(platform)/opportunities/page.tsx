import OpportunitiesScreen from '@/components/reconciliation/OpportunitiesScreen';
import { previousCompleteMonth } from '@/lib/laravelApi';

export const dynamic = 'force-dynamic';

export default function OpportunitiesPage() {
  return <OpportunitiesScreen initialMonth={previousCompleteMonth()} />;
}
