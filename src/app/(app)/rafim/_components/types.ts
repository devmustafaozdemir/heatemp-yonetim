// Raf ekranları (Heatemp / Mekonsis) ve teslimatlar için ortak veri biçimleri ve yardımcılar.
// Sunucu ve istemci bileşenlerinde kullanılabilir (yalnız düz veri).

export type ShelfKind = "heatemp" | "mekonsis";

/** Bir raftaki tek parti katmanı (Heatemp: parti payı; Mekonsis: teslimat × parti payı). */
export interface ShelfLayer {
  layer_id: string;
  batch_id: string;
  batch_no: string;
  /** Açılış stoğu partisi (sistem öncesi stok; üretim sayılmaz) */
  opening: boolean;
  /** Heatemp: rafa giriş (tamamlanma / açılış) tarihi; Mekonsis: teslimat tarihi */
  date: string;
  delivery_id: string | null;
  delivery_no: string | null;
  /** Heatemp: parti adedi (giriş); Mekonsis: teslim edilen */
  in_qty: number;
  /** Heatemp: teslim edilen; Mekonsis: satılan */
  out_qty: number;
  remaining: number;
  unit_cost_try: number;
  unit_cost_usd: number;
  value_try: number;
  value_usd: number;
}

export interface ShelfGroup {
  variant_id: string;
  product_id: string;
  display_name: string;
  product_code: string;
  variant_code: string;
  layers: ShelfLayer[];
  in_qty: number;
  out_qty: number;
  remaining: number;
  value_try: number;
  value_usd: number;
  /** En eski katmanın tarihi */
  oldest: string;
  opening_qty: number;
  /** Satış değeri: kalan adet × satış fiyatı (fiyat tanımsızsa null) */
  sale?: { amount: number; currency: "USD" | "TRY"; try: number | null } | null;
}

interface GroupSource {
  variant_id: string;
  product_id: string;
  display_name: string;
  product_code: string;
  variant_code: string;
  layer: ShelfLayer;
}

/**
 * Katmanları varyant bazında gruplar; varyantlar ada, katmanlar FIFO sırasına göre dizilir.
 * Veritabanı FIFO'su rafa giriş tarihi, sonra katman kayıt sırasıdır (fifo_seq). Sorgu bu sırayla
 * gelir (Heatemp: received_on, completed_at; Mekonsis: delivered_on, received_at); burada yalnız
 * tarihe göre dizilir — Array.sort kararlı olduğundan aynı gündeki katmanların sorgu sırası korunur.
 */
export function groupLayers(rows: GroupSource[]): ShelfGroup[] {
  const map = new Map<string, ShelfGroup>();
  for (const r of rows) {
    let g = map.get(r.variant_id);
    if (!g) {
      g = {
        variant_id: r.variant_id,
        product_id: r.product_id,
        display_name: r.display_name,
        product_code: r.product_code,
        variant_code: r.variant_code,
        layers: [],
        in_qty: 0,
        out_qty: 0,
        remaining: 0,
        value_try: 0,
        value_usd: 0,
        oldest: r.layer.date,
        opening_qty: 0,
      };
      map.set(r.variant_id, g);
    }
    const l = r.layer;
    g.layers.push(l);
    g.in_qty += l.in_qty;
    g.out_qty += l.out_qty;
    g.remaining += l.remaining;
    g.value_try += l.value_try;
    g.value_usd += l.value_usd;
    if (l.opening) g.opening_qty += l.remaining;
    if (l.date < g.oldest) g.oldest = l.date;
  }
  const groups = Array.from(map.values());
  for (const g of groups) g.layers.sort((a, b) => a.date.localeCompare(b.date));
  return groups.sort((a, b) => a.display_name.localeCompare(b.display_name, "tr"));
}

/** Teslimat formu için varyant seçenekleri (Heatemp rafındaki FIFO katmanları). */
export interface DeliverOption {
  variant_id: string;
  display_name: string;
  available: number;
  /** Mekonsis rafında şu an duran adet (işlem sonrası toplam için); yüklenemediyse null */
  mekonsis_qty: number | null;
  batches: { batch_id: string; batch_no: string; qty: number; received_on: string; opening: boolean; unit_cost_try: number }[];
}

/** Aylık raf hareketi (shelf_monthly_movements) */
export interface MovementRow {
  month_start: string;
  movement_type: string;
  batch_kind: "production" | "opening";
  movement_count: number;
  qty: number;
  value_try: number;
  value_usd: number;
}

/** Grafik noktası: pozitif adet / TL değerleri (çıkışlar mutlak değerle). */
export interface MovementPoint {
  month: string;
  /** Heatemp: üretim girişi · Mekonsis: teslimat girişi */
  inQty: number;
  inTry: number;
  /** Heatemp: açılış stoğu girişi · Mekonsis: satış iadesi (iptal) */
  in2Qty: number;
  in2Try: number;
  /** Heatemp: teslimat çıkışı · Mekonsis: satış çıkışı */
  outQty: number;
  outTry: number;
  /** Geri alınan teslimat (Heatemp'e dönüş / Mekonsis'ten çıkış) */
  revQty: number;
  revTry: number;
}

export function toMovementPoints(kind: ShelfKind, months: string[], rows: MovementRow[]): MovementPoint[] {
  return months.map((month) => {
    const p: MovementPoint = { month, inQty: 0, inTry: 0, in2Qty: 0, in2Try: 0, outQty: 0, outTry: 0, revQty: 0, revTry: 0 };
    for (const r of rows) {
      if (r.month_start.slice(0, 7) !== month) continue;
      const q = Math.abs(Number(r.qty));
      const v = Math.abs(Number(r.value_try));
      if (kind === "heatemp") {
        if (r.movement_type === "production_in" && r.batch_kind === "opening") {
          p.in2Qty += q;
          p.in2Try += v;
        } else if (r.movement_type === "production_in") {
          p.inQty += q;
          p.inTry += v;
        } else if (r.movement_type === "delivery_out") {
          p.outQty += q;
          p.outTry += v;
        } else if (r.movement_type === "delivery_reversal_in") {
          p.revQty += q;
          p.revTry += v;
        }
      } else {
        if (r.movement_type === "delivery_in") {
          p.inQty += q;
          p.inTry += v;
        } else if (r.movement_type === "sale_return") {
          p.in2Qty += q;
          p.in2Try += v;
        } else if (r.movement_type === "sale_out") {
          p.outQty += q;
          p.outTry += v;
        } else if (r.movement_type === "delivery_reversal_out") {
          p.revQty += q;
          p.revTry += v;
        }
      }
    }
    return p;
  });
}

/** İki tarih arasındaki gün sayısı (YYYY-AA-GG). */
export function daysSince(iso: string, today: string): number {
  return Math.max(0, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${iso}T12:00:00Z`)) / 86_400_000));
}

/** İçinde bulunulan ay dahil son 12 ayın ilk günü (YYYY-AA-01). */
export function last12MonthsFrom(today: string): string {
  const [y, m] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 12, 1, 12)).toISOString().slice(0, 10);
}
