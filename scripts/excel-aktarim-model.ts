// Mekonsis/Heatemp stok takip Excel'inin ERP modeline eşlenmesi — saf fonksiyonlar.
// Ürün kodu (SKU) ERP'de varyant kodu olarak AYNEN korunur; ürün (grup) kodu
// SKU'dan sensör elemanı çıkarılarak türetilir (ör. HT-NTC10K-K-50mm → HT-K-50mm).

export type Currency = "USD" | "TRY";

export interface VariantDef {
  sku: string;
  productCode: string;
  productName: string;
  variantName: string;
  notes: string[];
}

export interface ProductDef {
  code: string;
  name: string;
  variants: VariantDef[];
  derivedCode: boolean;
  notes: string[];
  defaultPrice: number | null;
  priceSource: string | null;
}

const ELEMENTS = ["NTC10K", "NTC20K", "PT1000"] as const;

const SENSOR_TYPES: Record<string, { name: string; note?: string }> = {
  K: { name: "Kablo Tipi Sıcaklık Sensörü" },
  KT: { name: "Kanal Tipi Sıcaklık Sensörü" },
  DT: { name: "Daldırma Tipi Sıcaklık Sensörü" },
  DO: { name: "Dış Ortam Tipi Sıcaklık Sensörü" },
  YT: { name: "Yüzey Tipi Sıcaklık Sensörü" },
  D: {
    name: "Sıcaklık Sensörü (D kodlu)",
    note: "Ürünler sayfasında Kablo Tipi sütununda yer alıyor; 'D' kısaltmasının anlamı dosyada yok, ürün adını doğrulayın.",
  },
};

export function normalizeCode(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Excel ürün kodunu ERP ürün/varyant tanımına çevirir. Tanınmayan kod tek varyantlı ürün olur. */
export function parseSku(rawSku: string): VariantDef {
  const sku = normalizeCode(rawSku);
  let m = sku.match(/^HT-(NTC10K|NTC20K|PT1000)-(K|D|KT|DT)-(\d+mm)$/);
  if (m) {
    const t = SENSOR_TYPES[m[2]];
    return {
      sku,
      productCode: `HT-${m[2]}-${m[3]}`,
      productName: `${t.name} - ${m[3]}`,
      variantName: m[1],
      notes: t.note ? [t.note] : [],
    };
  }
  m = sku.match(/^HT-(NTC10K|NTC20K|PT1000)-(DO|YT)$/);
  if (m) {
    return { sku, productCode: `HT-${m[2]}`, productName: SENSOR_TYPES[m[2]].name, variantName: m[1], notes: [] };
  }
  m = sku.match(/^HT-(NTC10K|NTC20K|PT1000)-MT-(M|P)$/);
  if (m) {
    const material = m[2] === "M" ? "Paslanmaz" : "Plastik";
    return {
      sku,
      productCode: `HT-MT-${m[2]}`,
      productName: `Mahal Tipi Sıcaklık Sensörü - ${material}`,
      variantName: m[1],
      notes: [],
    };
  }
  m = sku.match(/^HT-SKS-(S1|N1)$/);
  if (m) {
    return {
      sku,
      productCode: "HT-SKS",
      productName: "Su Kaçak Sensörü",
      variantName: m[1] === "S1" ? "Sesli (Buzzerlı)" : "Normal (Buzzersız)",
      notes: [],
    };
  }
  m = sku.match(/^HT-FCM(2|4)$/);
  if (m) {
    return {
      sku,
      productCode: "HT-FCM",
      productName: "Fan Coil Çoklama Kartı",
      variantName: `${m[1]} Fan Kontrol`,
      notes: [],
    };
  }
  m = sku.match(/^HT-KV(\d+)$/);
  if (m) {
    return {
      sku,
      productCode: "HT-KV",
      productName: "Sıcaklık Sensör Kovanı",
      variantName: `${Number(m[1]) * 10}mm`,
      notes: [],
    };
  }
  // HT kalıbına uymayan kod (ör. "1/4 x 1/2 Redüksiyon"): kendi kodlu, tek varyantlı ürün.
  return { sku, productCode: sku, productName: sku, variantName: "Standart", notes: [] };
}

export function isKnownElement(value: string): boolean {
  return (ELEMENTS as readonly string[]).includes(value);
}

/** Varyantları ürün gruplarına toplar; sıralama kararlıdır (ürün kodu, varyant kodu). */
export function groupProducts(skus: string[]): ProductDef[] {
  const map = new Map<string, ProductDef>();
  for (const raw of skus) {
    const v = parseSku(raw);
    let p = map.get(v.productCode);
    if (!p) {
      p = {
        code: v.productCode,
        name: v.productName,
        variants: [],
        derivedCode: v.productCode !== v.sku,
        notes: [...v.notes],
        defaultPrice: null,
        priceSource: null,
      };
      map.set(v.productCode, p);
    }
    if (!p.variants.some((x) => x.sku === v.sku)) p.variants.push(v);
  }
  const order = (s: string) => {
    const e = ELEMENTS.findIndex((x) => s.includes(x));
    return e < 0 ? 9 : e;
  };
  for (const p of map.values()) {
    p.variants.sort((a, b) => order(a.sku) - order(b.sku) || a.sku.localeCompare(b.sku, "tr"));
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code, "tr"));
}

export interface Movement {
  sheet: string;
  row: number;
  name: string;
  sku: string;
  date: string | null;
  qty: number;
  invoice?: string | null;
}

export interface StockLine {
  sku: string;
  delivered: number;
  sold: number;
  remaining: number;
  firstDelivery: string | null;
  lastDelivery: string | null;
  firstSale: string | null;
  issues: string[];
}

/** Mekonsis rafındaki kalan = teslim edilen − satılan (Excel'in Stok Özeti mantığı). */
export function computeStock(deliveries: Movement[], sales: Movement[]): StockLine[] {
  const skus = [...new Set([...deliveries, ...sales].map((m) => m.sku))];
  return skus
    .map((sku) => {
      const d = deliveries.filter((m) => m.sku === sku && m.qty > 0);
      const s = sales.filter((m) => m.sku === sku && m.qty > 0);
      const delivered = d.reduce((a, m) => a + m.qty, 0);
      const sold = s.reduce((a, m) => a + m.qty, 0);
      const dates = (ms: Movement[]) => ms.map((m) => m.date).filter((x): x is string => !!x).sort();
      const dd = dates(d);
      const sd = dates(s);
      const issues: string[] = [];
      if (sold > delivered) {
        issues.push(`Satılan (${sold}) teslim edilenden (${delivered}) fazla; kalan ${delivered - sold} çıkıyor.`);
      }
      if (sd.length && dd.length && sd[0] < dd[0]) {
        issues.push(`İlk satış (${sd[0]}) ilk teslimattan (${dd[0]}) önce.`);
      }
      if (sd.length && !dd.length) issues.push("Teslimatı olmayan satış var.");
      return {
        sku,
        delivered,
        sold,
        remaining: delivered - sold,
        firstDelivery: dd[0] ?? null,
        lastDelivery: dd.at(-1) ?? null,
        firstSale: sd[0] ?? null,
        issues,
      };
    })
    .sort((a, b) => a.sku.localeCompare(b.sku, "tr"));
}

export function sqlString(value: string | null | undefined): string {
  if (value === null || value === undefined) return "null";
  return `'${value.replace(/'/g, "''")}'`;
}

export function sqlNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "null";
  return String(value);
}
