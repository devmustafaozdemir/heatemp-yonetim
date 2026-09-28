// Excel sütun başlıklarını Heatemp ERP alanlarına sezgisel olarak eşleştirir.
// Saf fonksiyonlar; excel-incele.ts ve birim testleri kullanır.

export interface TargetField {
  key: string;
  label: string;
  patterns: RegExp[];
}

// Türkçe karakterler normalize edilerek aranır (ör. "Ürün Adı" → "urun adi").
export const TARGET_FIELDS: TargetField[] = [
  { key: "products.code", label: "Ürün kodu", patterns: [/\b(urun|stok|mal)?\s*kod/, /\bsku\b/, /\bcode\b/] },
  { key: "products.name", label: "Ürün adı", patterns: [/\burun\s*ad/, /\burun$/, /\bproduct\b/, /\bmal\s*ad/, /\bisim\b/] },
  { key: "product_variants.name", label: "Varyant / detay", patterns: [/varyant/, /\bmodel\b/, /detay/, /ozellik/, /\bwatt\b|\bw\b|\bvolt\b/] },
  { key: "sale_price", label: "Satış fiyatı", patterns: [/satis\s*fiyat/, /\bfiyat\b/, /\bprice\b/, /liste/] },
  { key: "currency", label: "Para birimi", patterns: [/para\s*birim/, /\bdoviz\b/, /\bcurrency\b/, /\b(usd|try|tl)\b/] },
  { key: "unit_cost", label: "Birim maliyet", patterns: [/maliyet/, /\bcost\b/, /alis\s*fiyat/] },
  { key: "stock.heatemp", label: "Heatemp stoğu", patterns: [/heatemp/, /depo/, /\braf\b/] },
  { key: "stock.mekonsis", label: "Mekonsis stoğu", patterns: [/mekonsis/] },
  { key: "sold_qty", label: "Satılan adet", patterns: [/satilan/, /satis\s*adet/, /\bsold\b/] },
  { key: "produced_qty", label: "Üretilen adet", patterns: [/uretilen/, /uretim/] },
  { key: "delivered_qty", label: "Teslim edilen", patterns: [/teslim/, /sevk/] },
  { key: "quantity", label: "Adet / miktar", patterns: [/\badet\b/, /miktar/, /\bstok\b/, /\bqty\b/, /kalan/] },
  { key: "raw_materials.name", label: "Hammadde / malzeme", patterns: [/hammadde/, /malzeme/, /komponent/, /parca/] },
  { key: "unit", label: "Birim", patterns: [/^birim$/, /\bolcu\b/, /\bunit\b/] },
  { key: "thresholds", label: "Stok eşiği", patterns: [/kritik/, /minimum|\bmin\b/, /hedef/, /esik/] },
  { key: "date", label: "Tarih", patterns: [/tarih/, /\bdate\b/] },
  { key: "customer", label: "Müşteri", patterns: [/musteri/, /firma/, /\bcari\b/] },
  { key: "note", label: "Not / açıklama", patterns: [/aciklama/, /\bnot\b/, /\bnote\b/] },
];

export function normalizeHeader(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Başlık için en olası hedef alan; bulunamazsa null. İlk eşleşen kural kazanır. */
export function suggestField(header: string): TargetField | null {
  const h = normalizeHeader(header);
  if (!h) return null;
  return TARGET_FIELDS.find((f) => f.patterns.some((p) => p.test(h))) ?? null;
}

export type ValueKind = "sayı" | "metin" | "tarih" | "boş" | "karışık";

export function inferKind(values: unknown[]): ValueKind {
  const kinds = new Set<string>();
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    if (v instanceof Date) kinds.add("tarih");
    else if (typeof v === "number") kinds.add("sayı");
    else kinds.add("metin");
  }
  if (kinds.size === 0) return "boş";
  if (kinds.size > 1) return "karışık";
  return [...kinds][0] as ValueKind;
}
