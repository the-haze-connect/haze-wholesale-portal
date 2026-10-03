import { db } from '@/lib/db';
import { AdminTabs } from './tabs';

/** Admin sub-navigation with counts of what needs attention. */
export async function AdminNav() {
  const [waiting, earnedReps] = await Promise.all([
    db.order.count({ where: { status: 'SUBMITTED' } }),
    db.commissionEntry.groupBy({ by: ['repId'], where: { state: 'EARNED' } }),
  ]);
  return <div className="wrap" style={{ paddingBottom: 0 }}><AdminTabs counts={{ waiting, earned: earnedReps.length }} /></div>;
}
