import { OrderTime, RecordType } from '../ordertime/client';
import type { RawOrderTime } from './snapshot';

/** Read everything the portal needs from Order Time. Read-only. */
export async function fetchOrderTime(ot: OrderTime): Promise<RawOrderTime> {
  const [assemblies, parts, inventoryByLocation, priceLevels, levelItemPrices, salesReps, customers] = await Promise.all([
    ot.listAll<RawOrderTime['assemblies'][number]>(RecordType.AssemblyItem),
    ot.listAll<RawOrderTime['parts'][number]>(RecordType.PartItem),
    ot.listAll<RawOrderTime['inventoryByLocation'][number]>(RecordType.InventoryByLocation),
    ot.listAll<RawOrderTime['priceLevels'][number]>(RecordType.PriceLevel),
    ot.listAll<RawOrderTime['levelItemPrices'][number]>(RecordType.PriceLevelItemPrice),
    ot.listAll<RawOrderTime['salesReps'][number]>(RecordType.SalesRep),
    ot.listAll<RawOrderTime['customers'][number]>(RecordType.Customer),
  ]);
  return { assemblies, parts, inventoryByLocation, priceLevels, levelItemPrices, salesReps, customers };
}
