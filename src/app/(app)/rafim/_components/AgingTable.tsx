import { ProgressBar, TableWrap, type Tone } from "@/components/ui";
import { fmtInt, fmtMoney } from "@/lib/format";
import { daysSince, type ShelfLayer } from "./types";

const BUCKETS: { label: string; min: number; max: number; tone: Tone }[] = [
  { label: "0–30 gün", min: 0, max: 30, tone: "teal" },
  { label: "31–90 gün", min: 31, max: 90, tone: "sky" },
  { label: "91–180 gün", min: 91, max: 180, tone: "amber" },
  { label: "180 günden fazla", min: 181, max: Number.POSITIVE_INFINITY, tone: "red" },
];

/**
 * Rafta bekleme süresi (stok yaşı): katmanın rafa giriş / teslimat tarihinden bugüne.
 * Oran, raftaki toplam adede göredir.
 */
export function AgingTable({
  layers,
  today,
  dateLabel,
}: {
  layers: Pick<ShelfLayer, "date" | "remaining" | "value_try">[];
  today: string;
  dateLabel: string;
}) {
  const total = layers.reduce((s, l) => s + l.remaining, 0);
  const rows = BUCKETS.map((b) => {
    const ls = layers.filter((l) => {
      const d = daysSince(l.date, today);
      return d >= b.min && d <= b.max;
    });
    return { ...b, qty: ls.reduce((s, l) => s + l.remaining, 0), value: ls.reduce((s, l) => s + l.value_try, 0), count: ls.length };
  });
  const pct = (qty: number) => (total > 0 ? `%${((qty / total) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}` : "—");
  return (
    <div>
      <p className="mb-1.5 text-xs text-ink-muted">{dateLabel}</p>
      <TableWrap>
        <table className="table-base table-compact">
          <thead>
            <tr>
              <th>Bekleme</th>
              <th className="num">Adet · pay</th>
              <th className="num">Değer (TL)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                {/* Pay çubuğu satır etiketinin altında: dar kartta ve mobilde de okunur genişlikte kalır */}
                <td className="w-1/2 min-w-[7.5rem]">
                  <span className="whitespace-nowrap">{r.label}</span>{" "}
                  <span className="text-[11px] whitespace-nowrap text-ink-muted">({fmtInt(r.count)})</span>
                  <div className="mt-1.5">
                    <ProgressBar value={r.qty} max={total} tone={r.tone} label={`${r.label} bekleyen adet payı`} />
                  </div>
                </td>
                <td className="num">
                  {fmtInt(r.qty)}
                  <span className="block text-[11px] text-ink-muted">{pct(r.qty)}</span>
                </td>
                <td className="num">{fmtMoney(r.value, "TRY", 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </div>
  );
}
