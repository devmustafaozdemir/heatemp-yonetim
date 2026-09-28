import { TableWrap } from "@/components/ui";
import { fmtInt, fmtMoney } from "@/lib/format";

export interface ShelfFigures {
  label: string;
  qty: number;
  value: number;
  /** Rafta stoğu olan varyant sayısı; varyant listesi yüklenemediyse null */
  variants: number | null;
}

/** Raf değeri halka grafiğinin sayısal özeti: adet, varyant, ortalama birim maliyet ve değer. */
export function ShelfSummary({ shelves }: { shelves: ShelfFigures[] }) {
  const qty = shelves.reduce((a, s) => a + s.qty, 0);
  const value = shelves.reduce((a, s) => a + s.value, 0);
  return (
    <div className="@container mt-4">
      <TableWrap className="rounded-md border border-line">
        <table className="table-base table-compact">
          <thead>
            <tr>
              <th>Raf</th>
              <th className="num">Adet</th>
              <th className="num hidden @min-[400px]:table-cell" title="Rafta stoğu olan varyant sayısı">
                Varyant
              </th>
              <th className="num hidden @min-[400px]:table-cell" title="Ortalama birim maliyet (TL) = değer / adet">
                Ort. birim
              </th>
              <th className="num">Değer (TL)</th>
            </tr>
          </thead>
          <tbody>
            {shelves.map((s) => (
              <tr key={s.label}>
                <td className="whitespace-nowrap">{s.label}</td>
                <td className="num">{fmtInt(s.qty)}</td>
                <td className="num hidden @min-[400px]:table-cell">{s.variants === null ? "—" : fmtInt(s.variants)}</td>
                <td className="num hidden @min-[400px]:table-cell">{s.qty > 0 ? fmtMoney(s.value / s.qty, "TRY") : "—"}</td>
                <td className="num">{fmtMoney(s.value, "TRY")}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Toplam</td>
              <td className="num">{fmtInt(qty)}</td>
              <td className="hidden @min-[400px]:table-cell" />
              <td className="num hidden @min-[400px]:table-cell">{qty > 0 ? fmtMoney(value / qty, "TRY") : "—"}</td>
              <td className="num">{fmtMoney(value, "TRY")}</td>
            </tr>
          </tfoot>
        </table>
      </TableWrap>
    </div>
  );
}
