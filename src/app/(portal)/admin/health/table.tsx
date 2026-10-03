import Link from 'next/link';
import type { HealthList } from '@/lib/health';

/** Rows of one data-health list; the first cell links to the shop or product in the portal. */
export function HealthTable({ list, rows, offset = 0 }: { list: HealthList; rows: (string | number)[][]; offset?: number }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{list.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const href = list.links?.[offset + i];
            return (
              <tr key={offset + i}>
                {r.map((v, j) => (
                  <td key={j}>{j === 0 && href ? <Link href={href}><b>{String(v)}</b></Link> : j === 0 ? <b>{String(v)}</b> : String(v)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
