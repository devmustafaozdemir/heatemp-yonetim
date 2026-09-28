import { TableWrap } from "@/components/ui";
import { fmtInt, fmtMoney, fmtUnitMoney } from "@/lib/format";

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
    <TableWrap className="mt-4 rounded-md border border-line">
      <table className="table-base table-compact">
        <thead>
          <tr>
            <th>Raf</th>
            <th className="num">Adet</th>
            <th className="num hidden sm:table-cell" title="Rafta stoğu olan varyant sayısı">
              Varyant
            </th>
            <th className="num hidden sm:table-cell" title="Değer / adet (TL)">
              Ort. birim (TL)
            </th>
            <th className="num">Değer (TL)</th>
          </tr>
        </thead>
        <tbody>
          {shelves.map((s) => (
            <tr key={s.label}>
              <td className="whitespace-nowrap">{s.label}</td>
              <td className="num">{fmtInt(s.qty)}</td>
              <td className="num hidden sm:table-cell">{s.variants === null ? "—" : fmtInt(s.variants)}</td>
              <td className="num hidden sm:table-cell">{s.qty > 0 ? fmtUnitMoney(s.value / s.qty, "TRY") : "—"}</td>
              <td className="num">{fmtMoney(s.value, "TRY")}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Toplam</td>
            <td className="num">{fmtInt(qty)}</td>
            <td className="hidden sm:table-cell" />
            <td className="num hidden sm:table-cell">{qty > 0 ? fmtUnitMoney(value / qty, "TRY") : "—"}</td>
            <td className="num">{fmtMoney(value, "TRY")}</td>
          </tr>
        </tfoot>
      </table>
    </TableWrap>
  );
}
