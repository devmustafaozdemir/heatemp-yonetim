// Mekonsis/Heatemp stok takip Excel'inden ERP aktarım paketi üretir (SALT OKUNUR).
// Veritabanına bağlanmaz. Aktarım iki adımdır; çıktılar (varsayılan import/excel-aktarim/, git dışında):
//
//   1. adım — katalog (kur, maliyet veya yönetici onayı gerektirmez):
//      katalog-aktarim-kuru.sql — kuru çalıştırma: aynı işlemler, sonunda ROLLBACK
//      katalog-aktarim.sql      — ürün, varyant, kesin eşleşen satış fiyatları ve stok eşikleri
//   2. adım — stok (yalnızca --stok-tarihi verilince ve en az bir maliyet onaylanınca üretilir):
//      stok-aktarim-kuru.sql    — kuru çalıştırma
//      stok-aktarim.sql         — açılış stoğu + aynı gün Mekonsis teslimatı; stok tarihinin TCMB kuru gömülü
//   stok-onay.xlsx           — kontrol/onay tablosu: kalan adet, Excel'deki aday maliyetler yan yana,
//                              ONAYLANAN birim maliyet/para birimi (siz doldurursunuz; yeniden üretimde korunur)
//   RAPOR.md                 — sayfa bazında kararlar, sayılar, eksik/çelişkili alanlar
//   gecmis-hareketler.csv    — Excel'deki geçmiş teslimat ve satış satırları (arşiv; stok defterine girmez)
//
// Kullanım:
//   npm run excel:aktarim -- --excel "referans/Mekonsis_Heatamp_Stok_Takip (1).xlsx"
//   npm run excel:aktarim -- --excel "..." --stok-tarihi 2026-09-30 [--kur-turu ForexBuying|ForexSelling]
//   [--cikti import/excel-aktarim] [--admin-email yonetici@firma.com]
// Stok tarihi verildiğinde o günün TCMB bülteni (www.tcmb.gov.tr/kurlar arşivi) indirilir; hafta sonu veya
// tatilse önceki son yayımlanan bülten kaynak tarihiyle kullanılır. Bugünün kuru geçmiş tarihe uygulanmaz.
// Test için kaynak adresi TCMB_BASE_URL ortam değişkeniyle değiştirilebilir.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { fetchTcmb, TCMB_BASE_URL, tcmbUrl, type TcmbRateType } from "../src/lib/fx/sources";
import {
  computeStock,
  groupProducts,
  normalizeCode,
  parseSku,
  sqlNumber,
  sqlString,
  type Currency,
  type Movement,
  type ProductDef,
} from "./excel-aktarim-model";

// ---------------------------------------------------------------- argümanlar
function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}
const ROOT = path.resolve(__dirname, "..");
const EXCEL = arg("excel");
const OUT = path.resolve(ROOT, arg("cikti") ?? "import/excel-aktarim");
const ONAY_XLSX = path.join(OUT, "stok-onay.xlsx");
const STOK_TARIHI = arg("stok-tarihi");
const ADMIN_EMAIL = arg("admin-email");
const KUR_TURU = (arg("kur-turu") ?? "ForexBuying") as TcmbRateType;
const TCMB_BASE = process.env.TCMB_BASE_URL?.replace(/\/+$/, "") || TCMB_BASE_URL;
const SEED = "heatemp-excel-aktarim-v1";
const ONAY_SAYFASI = "Stok onayı";

// Satış fiyatı eşleşmesi belirsiz ürünler: siz netleştirene kadar maliyet onayı girilse bile stok aktarımına alınmaz.
const BELIRSIZ_FIYAT: Record<string, string> = {
  "HT-FCM":
    'Satış Fiyatları sayfasındaki "Çoklama Kartı (3 Role)" satırının HT-FCM2 mi HT-FCM4 mü olduğu belirsiz; netleşene kadar stok aktarımına alınmaz.',
};

// ---------------------------------------------------------------- hücre yardımcıları
function raw(cell: ExcelJS.Cell): unknown {
  const v = cell.value as unknown;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    if ("result" in o) return o.result ?? null;
    if ("richText" in o) return (o.richText as { text: string }[]).map((r) => r.text).join("");
    if ("text" in o) return o.text;
    if ("error" in o) return null;
  }
  return v ?? null;
}
function text(cell: ExcelJS.Cell): string {
  const v = raw(cell);
  return v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim();
}
function num(cell: ExcelJS.Cell): number | null {
  const v = raw(cell);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  // exceljs, önbellekteki sonucu 0 olan formül hücrelerinde "result" alanını hiç döndürmüyor
  // (dosyada <v>0</v> yazılı olduğu hâlde). Sayısal formül hücresinde sonuç yoksa 0 kabul edilir.
  const cv = cell.value as unknown;
  if (cv && typeof cv === "object" && ("formula" in cv || "sharedFormula" in cv) && !("result" in cv)) return 0;
  return null;
}
function isoDate(cell: ExcelJS.Cell): string | null {
  const v = raw(cell);
  return v instanceof Date ? v.toISOString().slice(0, 10) : null;
}
function formula(cell: ExcelJS.Cell): string | null {
  const v = cell.value as unknown;
  if (v && typeof v === "object" && "formula" in (v as object)) return String((v as { formula: string }).formula);
  return null;
}
function currencyOf(cell: ExcelJS.Cell): Currency | null {
  const f = cell.numFmt ?? "";
  if (f.includes("TRY")) return "TRY";
  if (f.includes("$")) return "USD";
  return null;
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const fmtN = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(n) ? "" : String(n).replace(".", ",");

// ---------------------------------------------------------------- tipler
interface Issue {
  seviye: "çelişki" | "eksik" | "uyarı";
  konu: string;
  aciklama: string;
}
interface PriceRow {
  row: number;
  product: string;
  cost: number | null;
  costCurrency: Currency | null;
  price: number | null;
  priceCurrency: Currency | null;
}
interface CostBlock {
  title: string;
  cell: string;
  lines: { label: string; value: number; currency: Currency | null; cell: string }[];
  total: number | null;
  totalCurrency: Currency | null;
  converted: number | null;
  convertedCurrency: Currency | null;
  rate: number | null;
  multiplier: number | null;
}
interface PrevApproval {
  qty: number | null;
  cost: number | null;
  currency: Currency | null;
  note: string | null;
}
interface OnayRow {
  sku: string;
  excelName: string;
  productCode: string;
  erpName: string;
  delivered: number;
  sold: number;
  remaining: number;
  aday1: { value: number; currency: Currency; source: string } | null;
  aday2: { value: number; currency: Currency; usd: number | null; rate: number | null; source: string } | null;
  approvedCost: number | null;
  approvedCurrency: Currency | null;
  approvedNote: string | null;
  status: "Onaylandı" | "Onay bekliyor" | "Stok yok" | "HARİÇ: negatif kalan" | "HARİÇ: belirsiz fiyat eşleşmesi";
  notes: string[];
}
interface KurBilgisi {
  stokTarihi: string;
  bultenTarihi: string;
  bultenNo: string | null;
  kurTuru: TcmbRateType;
  kur: number;
  url: string;
  raw: Record<string, unknown>;
}

// Satış Fiyatları sayfasındaki satır adı → ERP hedefi (ürün veya varyant). Belirsiz olanlar null.
const PRICE_TARGETS: Record<string, { level: "product" | "variant"; code: string } | { level: "none"; reason: string }> = {
  "Paslanmaz Mahal Tipi Sıcaklık Sensörü": { level: "product", code: "HT-MT-M" },
  "Plastik Mahal Tipi Sıcaklık Sensörü": { level: "product", code: "HT-MT-P" },
  "Çoklama Kartı (3 Role)": {
    level: "none",
    reason: "Hangi koda ait olduğu belirsiz (Ürünler sayfasında HT-FCM2 '2 Fan Kontrol' ve HT-FCM4 '4 Fan Kontrol' var).",
  },
  "Sıcaklık Sensör Kovanı (150mm)": { level: "variant", code: "HT-KV15" },
  "Kanal Tipi Sıcaklık Sensörü (150mm)": { level: "product", code: "HT-KT-150mm" },
  "Su Kaçak Sensörü": { level: "product", code: "HT-SKS" },
  "Kablo Tipi Sıcaklık Sensörü (150mm)": { level: "product", code: "HT-K-150mm" },
  "Sıva Üstü Termostat": { level: "none", reason: "Ürün kodu yok (Ürünler ve Stok Özeti sayfalarında geçmiyor)." },
};

// Ürün Maliyet blokları → karşılaştırılacak Satış Fiyatları satırı
const COST_BLOCK_TO_PRICE: Record<string, string> = {
  "1 Adet Paslanmaz Çelik Mahal Tipi Sıcaklık Sensörü": "Paslanmaz Mahal Tipi Sıcaklık Sensörü",
  "1 Adet Çoklama Kartı": "Çoklama Kartı (3 Role)",
  "150mm Sıcaklık Sensör Kovanı": "Sıcaklık Sensör Kovanı (150mm)",
  "Plastik Mahal Tipi": "Plastik Mahal Tipi Sıcaklık Sensörü",
  "150mm Kanal Tipi Sıcaklık Sensörü": "Kanal Tipi Sıcaklık Sensörü (150mm)",
  Termostat: "Sıva Üstü Termostat",
};

async function main() {
  if (!EXCEL) {
    console.error('Excel yolu gerekli: --excel "referans/....xlsx"');
    process.exit(1);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(ROOT, EXCEL));
  const sheet = (name: string) => {
    const ws = wb.getWorksheet(name);
    if (!ws) throw new Error(`Beklenen sayfa bulunamadı: ${name}`);
    return ws;
  };
  const issues: Issue[] = [];
  const sheetNames = wb.worksheets.map((w) => w.name);

  // ------------------------------------------------ Stok Özeti
  const so = sheet("Stok Özeti");
  const header = ["Ürün Adı", "Ürün Kodu", "Toplam Giren (Raf)", "Satış", "Kalan Stok", "Son Teslimat", "Durum"];
  const gotHeader = ["B", "C", "D", "E", "F", "G", "H"].map((c) => text(so.getCell(`${c}4`)));
  if (header.some((h, i) => gotHeader[i] !== h)) throw new Error(`Stok Özeti başlıkları beklenenden farklı: ${gotHeader.join(" | ")}`);
  const summary: { row: number; name: string; sku: string; delivered: number | null; sold: number | null; remaining: number | null }[] = [];
  let thresholds: { critical: number; watch: number } | null = null;
  for (let r = 5; r <= 44; r++) {
    const sku = text(so.getCell(`C${r}`));
    if (!sku) continue;
    summary.push({
      row: r,
      name: text(so.getCell(`B${r}`)),
      sku: normalizeCode(sku),
      delivered: num(so.getCell(`D${r}`)),
      sold: num(so.getCell(`E${r}`)),
      remaining: num(so.getCell(`F${r}`)),
    });
    const f = formula(so.getCell(`H${r}`));
    const m = f?.match(/<=0,"Stok Yok",IF\([A-Z]+\d+<=(\d+),"Kritik",IF\([A-Z]+\d+<=(\d+),"Dikkat"/);
    if (m && !thresholds) thresholds = { critical: Number(m[1]), watch: Number(m[2]) };
  }

  // ------------------------------------------------ Teslimat / Satış Detayı
  const readMovements = (name: string, withInvoice: boolean): Movement[] => {
    const ws = sheet(name);
    const out: Movement[] = [];
    for (let r = 5; r <= 154; r++) {
      const sku = text(ws.getCell(`C${r}`));
      const qty = num(ws.getCell(`E${r}`));
      if (!sku && qty === null) continue;
      const d = isoDate(ws.getCell(`D${r}`));
      const mv: Movement = {
        sheet: name,
        row: r,
        name: text(ws.getCell(`B${r}`)),
        sku: normalizeCode(sku),
        date: d,
        qty: qty ?? 0,
        invoice: withInvoice ? text(ws.getCell(`F${r}`)) || null : undefined,
      };
      if (!d) issues.push({ seviye: "eksik", konu: `${name} satır ${r}`, aciklama: `Tarih yok (${mv.sku}).` });
      if (qty === null) issues.push({ seviye: "eksik", konu: `${name} satır ${r}`, aciklama: `Adet yok (${mv.sku}).` });
      if (qty !== null && (!Number.isInteger(qty) || qty < 0)) {
        issues.push({ seviye: "çelişki", konu: `${name} satır ${r}`, aciklama: `Adet tam sayı/pozitif değil: ${qty}.` });
      }
      out.push(mv);
    }
    return out;
  };
  const deliveries = readMovements("Teslimat Detayı", false);
  const sales = readMovements("Satış Detayı", true);
  for (const d of deliveries.filter((x) => x.qty === 0)) {
    issues.push({
      seviye: "uyarı",
      konu: `Teslimat Detayı satır ${d.row}`,
      aciklama: `${d.sku} için ${d.date} tarihli 0 adetlik satır (sayfa notuna göre "üretilecek ama henüz teslim edilmemiş" yer tutucu); aktarılmaz.`,
    });
  }

  // ------------------------------------------------ Ürünler (katalog)
  const ur = sheet("Ürünler");
  const catalog: { sku: string; cell: string; context: string }[] = [];
  ur.eachRow((row) => {
    row.eachCell((cell) => {
      if (cell.isMerged && cell.master.address !== cell.address) return; // birleşik hücrenin kopyası
      const t = text(cell);
      if (/^HT-[A-Z0-9]/.test(t) && !catalog.some((c) => c.sku === normalizeCode(t))) {
        const labels: string[] = [];
        row.eachCell((c) => {
          const tt = text(c);
          if (tt && !/^HT-/.test(tt) && Number(c.col) < Number(cell.col)) labels.push(tt);
        });
        catalog.push({ sku: normalizeCode(t), cell: cell.address, context: labels.at(-1) ?? "" });
      }
    });
  });

  // ------------------------------------------------ Satış Fiyatları
  const sf = sheet("Satış Fiyatları");
  const priceRows: PriceRow[] = [];
  for (let r = 3; r <= 12; r++) {
    const product = text(sf.getCell(`B${r}`));
    if (!product) continue;
    priceRows.push({
      row: r,
      product,
      cost: num(sf.getCell(`C${r}`)),
      costCurrency: currencyOf(sf.getCell(`C${r}`)),
      price: num(sf.getCell(`D${r}`)),
      priceCurrency: currencyOf(sf.getCell(`D${r}`)),
    });
  }
  const references: { product: string; y2025: number | null; y2026: number | null }[] = [];
  for (let r = 35; r <= 45; r++) {
    const p = text(sf.getCell(`G${r}`));
    if (p) references.push({ product: p, y2025: num(sf.getCell(`H${r}`)), y2026: num(sf.getCell(`I${r}`)) });
  }

  // ------------------------------------------------ Ürün Maliyet (maliyet kalemleri)
  const um = sheet("Ürün Maliyet");
  const blocks: CostBlock[] = [];
  for (const [lc, vc] of [
    ["B", "C"],
    ["E", "F"],
  ]) {
    let current: CostBlock | null = null;
    for (let r = 1; r <= um.rowCount; r++) {
      const label = text(um.getCell(`${lc}${r}`));
      const valueCell = um.getCell(`${vc}${r}`);
      const value = num(valueCell);
      if (label && value === null) {
        current = {
          title: label,
          cell: `${lc}${r}`,
          lines: [],
          total: null,
          totalCurrency: null,
          converted: null,
          convertedCurrency: null,
          rate: null,
          multiplier: null,
        };
        blocks.push(current);
      } else if (label && value !== null && current) {
        current.lines.push({ label, value, currency: currencyOf(valueCell), cell: `${vc}${r}` });
      } else if (!label && value !== null && current) {
        const f = formula(valueCell) ?? "";
        const rate = f.match(/\/\s*([\d.]+)\s*$/);
        const mult = f.match(/\*\s*(\d+)\s*$/);
        if (current.total === null) {
          current.total = value;
          current.totalCurrency = currencyOf(valueCell);
        } else if (current.converted === null && current.multiplier === null) {
          if (rate) {
            current.converted = value;
            current.convertedCurrency = currencyOf(valueCell);
            current.rate = Number(rate[1]);
          } else if (mult) {
            current.multiplier = Number(mult[1]);
          }
        }
      }
    }
  }
  // Maliyet dökümüne ait notlar → stok-onay.xlsx açıklaması (Satış Fiyatları satır adına göre)
  const costNotes = new Map<string, string[]>();
  const addCostNote = (blockTitle: string, note: string) => {
    const key = COST_BLOCK_TO_PRICE[blockTitle];
    if (key) costNotes.set(key, [...(costNotes.get(key) ?? []), note]);
  };
  // Toplu (600 adet) blok ile birim blok tutarlılığı
  const batchBlock = blocks.find((b) => /^\d+\s*Ad\./.test(b.title));
  const unitBlock = blocks.find((b) => b.title.startsWith("1 Adet Paslanmaz"));
  if (batchBlock && unitBlock) {
    const n = Number(batchBlock.title.match(/^(\d+)/)![1]);
    for (const line of batchBlock.lines) {
      const u = unitBlock.lines.find((l) => l.label === line.label);
      if (u && Math.abs(u.value - line.value / n) > 0.05) {
        const implied = Math.round(line.value / u.value);
        addCostNote(
          unitBlock.title,
          `Aday 2 dökümünde "${line.label}" (${u.cell}) ${fmtN(u.value)} TL; ${n} adetlik toplamdan ${fmtN(r2(line.value / n))} TL olmalı (≈${implied} adede bölünmüş). Düzeltilmiş döküm toplamı ${fmtN(r2((unitBlock.total ?? 0) - u.value + line.value / n))} TL (≈${fmtN(r2(((unitBlock.total ?? 0) - u.value + line.value / n) / (unitBlock.rate ?? NaN)))} USD).`,
        );
        issues.push({
          seviye: "çelişki",
          konu: `Ürün Maliyet ${u.cell}`,
          aciklama: `"${line.label}": ${n} adetlik toplam ${line.value} TL ÷ ${n} = ${r2(line.value / n)} TL olmalı, birim sütununda ${u.value} TL (≈${implied} adete bölünmüş). Birim toplam ${unitBlock.total} TL yerine ${r2((unitBlock.total ?? 0) - u.value + line.value / n)} TL çıkar.`,
        });
      }
    }
  }
  for (const b of blocks) {
    const priceName = COST_BLOCK_TO_PRICE[b.title];
    const pr = priceRows.find((p) => p.product.trim() === priceName);
    const usd = b.totalCurrency === "USD" ? b.total : b.convertedCurrency === "USD" ? b.converted : null;
    if (pr?.cost !== null && pr?.cost !== undefined && usd !== null && Math.abs(pr.cost - usd) >= 0.1) {
      issues.push({
        seviye: "çelişki",
        konu: `Maliyet: ${priceName}`,
        aciklama: `Ürün Maliyet dökümü ${r2(usd)} USD${b.rate ? ` (${b.total} TL ÷ ${b.rate})` : ""}, Satış Fiyatları "Maliyet" ${pr.cost} USD.`,
      });
    }
  }
  const pvc = blocks.find((b) => b.title === "150mm Kanal Tipi Sıcaklık Sensörü");
  if (pvc?.lines.some((l) => /PT1000/.test(l.label))) {
    addCostNote(pvc.title, "Aday 2 dökümü PT1000 eleman içeriyor; stoktaki varyantlar NTC10K/NTC20K.");
    issues.push({
      seviye: "uyarı",
      konu: "Maliyet: Kanal Tipi 150mm",
      aciklama: "Maliyet dökümü PT1000 eleman içeriyor; stoktaki Kanal Tipi varyantları NTC10K ve NTC20K. Döküm bu varyantlara doğrudan uygulanamaz.",
    });
  }
  const pmt = blocks.find((b) => b.title === "Plastik Mahal Tipi");
  if (pmt?.lines.some((l) => /PT1000/.test(l.label))) {
    addCostNote(pmt.title, "Aday 2 dökümü PT1000 eleman içeriyor; stoktaki varyantlar NTC10K/NTC20K.");
    issues.push({
      seviye: "uyarı",
      konu: "Maliyet: Plastik Mahal Tipi",
      aciklama: "Maliyet dökümü PT1000 eleman içeriyor; stoktaki Plastik Mahal varyantları NTC10K ve NTC20K.",
    });
  }
  const rates = [...new Set(blocks.map((b) => b.rate).filter((x): x is number => !!x))];

  // ------------------------------------------------ Ürün/varyant modeli
  const allSkus = [...new Set([...catalog.map((c) => c.sku), ...summary.map((s) => s.sku)])];
  const products = groupProducts(allSkus);
  const productBy = new Map(products.map((p) => [p.code, p]));
  const variantPrice = new Map<string, { price: number; currency: Currency; source: string }>();
  const priceNotApplied: { row: PriceRow; reason: string }[] = [];
  for (const pr of priceRows) {
    const target = PRICE_TARGETS[pr.product.trim()];
    if (!target) {
      priceNotApplied.push({ row: pr, reason: "Eşleştirme kuralı yok." });
      continue;
    }
    if (target.level === "none") {
      priceNotApplied.push({ row: pr, reason: target.reason });
      continue;
    }
    if (pr.price === null || pr.priceCurrency === null) {
      priceNotApplied.push({ row: pr, reason: "Fiyat veya para birimi okunamadı." });
      continue;
    }
    const source = `Satış Fiyatları!D${pr.row}`;
    if (target.level === "product") {
      const p = productBy.get(target.code);
      if (!p) throw new Error(`Fiyat hedefi ürün bulunamadı: ${target.code}`);
      p.defaultPrice = pr.price;
      p.priceSource = source;
    } else {
      if (!allSkus.includes(target.code)) throw new Error(`Fiyat hedefi varyant bulunamadı: ${target.code}`);
      variantPrice.set(target.code, { price: pr.price, currency: pr.priceCurrency, source });
    }
  }
  const priceCurrency: Currency = priceRows.find((p) => p.priceCurrency)?.priceCurrency ?? "USD";

  // Stok Özeti adları ↔ türetilen adlar ve katalog kapsamı
  const catalogSet = new Set(catalog.map((c) => c.sku));
  for (const s of summary) {
    if (!catalogSet.has(s.sku)) {
      issues.push({ seviye: "uyarı", konu: `Stok Özeti satır ${s.row}`, aciklama: `${s.sku} Ürünler (katalog) sayfasında yok; ayrı ürün olarak aktarılır.` });
    }
  }
  const nameMismatch = [...deliveries, ...sales].filter((m) => {
    const s = summary.find((x) => x.sku === m.sku);
    return s && s.name !== m.name;
  });
  for (const m of nameMismatch) {
    issues.push({
      seviye: "uyarı",
      konu: `${m.sheet} satır ${m.row}`,
      aciklama: `Ürün adı "${m.name}" Stok Özeti'ndeki "${summary.find((x) => x.sku === m.sku)?.name}" ile farklı; kod (${m.sku}) esas alındı.`,
    });
  }
  for (const m of [...deliveries, ...sales]) {
    if (m.sku && !allSkus.includes(m.sku)) {
      issues.push({ seviye: "çelişki", konu: `${m.sheet} satır ${m.row}`, aciklama: `Kod ${m.sku} hiçbir ürün listesinde yok.` });
    }
  }

  // ------------------------------------------------ Stok
  const stock = computeStock(deliveries, sales);
  for (const s of stock) {
    const sum = summary.find((x) => x.sku === s.sku);
    if (sum && (sum.delivered !== s.delivered || sum.sold !== s.sold || sum.remaining !== s.remaining)) {
      issues.push({
        seviye: "çelişki",
        konu: `Stok Özeti ${s.sku}`,
        aciklama: `Özet (giren ${sum.delivered}, satış ${sum.sold}, kalan ${sum.remaining}) ≠ detay (${s.delivered}, ${s.sold}, ${s.remaining}).`,
      });
    }
    for (const i of s.issues) issues.push({ seviye: "çelişki", konu: `Stok ${s.sku}`, aciklama: i });
  }


  // ------------------------------------------------ Stok onay tablosu
  const stockNameBy = new Map(summary.map((s) => [s.sku, s.name]));
  const previous = existsSync(ONAY_XLSX) ? await readApprovals(ONAY_XLSX) : new Map<string, PrevApproval>();
  const approvalErrors: string[] = [];
  const rows: OnayRow[] = stock.map((s) => {
    const v = parseSku(s.sku);
    const pr = priceRows.find((p) => {
      const t = PRICE_TARGETS[p.product.trim()];
      return (
        t && t.level !== "none" && ((t.level === "product" && t.code === v.productCode) || (t.level === "variant" && t.code === s.sku))
      );
    });
    const block = pr ? blocks.find((b) => COST_BLOCK_TO_PRICE[b.title] === pr.product.trim()) : undefined;
    const aday1 =
      pr && pr.cost !== null && pr.costCurrency
        ? { value: pr.cost, currency: pr.costCurrency, source: `Satış Fiyatları!C${pr.row} (${pr.product.trim()})` }
        : null;
    const aday2 =
      block && block.total !== null && block.totalCurrency
        ? {
            value: r4(block.total),
            currency: block.totalCurrency,
            usd: block.totalCurrency === "USD" ? r4(block.total) : block.convertedCurrency === "USD" && block.converted !== null ? r4(block.converted) : null,
            rate: block.rate,
            source: `Ürün Maliyet "${block.title}" toplamı (${block.cell})`,
          }
        : null;

    const notes: string[] = [...s.issues];
    let status: OnayRow["status"];
    if (s.remaining < 0) {
      status = "HARİÇ: negatif kalan";
      notes.push("Siz netleştirene kadar stok aktarımına alınmaz.");
    } else if (s.remaining === 0) {
      status = "Stok yok";
    } else if (BELIRSIZ_FIYAT[v.productCode]) {
      status = "HARİÇ: belirsiz fiyat eşleşmesi";
      notes.push(BELIRSIZ_FIYAT[v.productCode]);
    } else {
      status = "Onay bekliyor";
    }
    if (pr) notes.push(...(costNotes.get(pr.product.trim()) ?? []));
    if (aday1 && aday2?.usd !== null && aday2?.usd !== undefined && aday1.currency === "USD" && Math.abs(aday1.value - aday2.usd) >= 0.1) {
      notes.unshift(
        `Adaylar çelişkili: ${fmtN(aday1.value)} USD ↔ ${fmtN(aday2.value)} ${aday2.currency}${aday2.currency !== "USD" ? ` (Excel'in sabit ${fmtN(aday2.rate)} kuruyla ${fmtN(r2(aday2.usd))} USD)` : ""}.`,
      );
    }
    if (!aday1 && !aday2) notes.push("Excel'de bu ürün için maliyet yok.");
    if (aday1 || aday2) {
      notes.push(`Kaynak: ${[aday1 ? `aday 1 ${aday1.source}` : null, aday2 ? `aday 2 ${aday2.source}` : null].filter(Boolean).join("; ")}.`);
    }

    const p = previous.get(s.sku);
    let approvedCost: number | null = null;
    let approvedCurrency: Currency | null = null;
    let approvedNote: string | null = null;
    if (p && (p.cost !== null || p.currency !== null)) {
      approvedCost = p.cost;
      approvedCurrency = p.currency;
      approvedNote = p.note;
      if (p.qty !== null && p.qty !== s.remaining) {
        approvalErrors.push(
          `${s.sku}: tablodaki kalan ${p.qty}, Excel'deki güncel kalan ${s.remaining}. Onayı gözden geçirip maliyet hücrelerini temizleyin veya yeniden girin.`,
        );
      }
      if (p.cost === null || !(p.cost > 0)) approvalErrors.push(`${s.sku}: ONAYLANAN birim maliyet sıfırdan büyük bir sayı olmalı.`);
      if (p.currency === null) approvalErrors.push(`${s.sku}: ONAYLANAN para birimi USD veya TRY olmalı.`);
      if (status === "Onay bekliyor") status = "Onaylandı";
      else if (status.startsWith("HARİÇ")) notes.push("Girilen maliyet onayı hariç tutulduğu için kullanılmaz.");
    } else if (p?.note) {
      approvedNote = p.note;
    }
    return {
      sku: s.sku,
      excelName: stockNameBy.get(s.sku) ?? "",
      productCode: v.productCode,
      erpName: `${v.productName} / ${v.variantName}`,
      delivered: s.delivered,
      sold: s.sold,
      remaining: s.remaining,
      aday1,
      aday2,
      approvedCost,
      approvedCurrency,
      approvedNote,
      status,
      notes,
    };
  });
  for (const sku of previous.keys()) {
    if (!rows.some((r) => r.sku === sku) && (previous.get(sku)!.cost !== null || previous.get(sku)!.currency !== null)) {
      approvalErrors.push(`${sku}: onay tablosunda var ama Excel'in stok hareketlerinde yok.`);
    }
  }
  if (approvalErrors.length) {
    throw new Error(`stok-onay.xlsx doğrulanamadı:\n  - ${approvalErrors.join("\n  - ")}`);
  }
  const approved = rows.filter((r) => r.status === "Onaylandı");

  // ------------------------------------------------ Stok tarihi ve TCMB kuru
  let kur: KurBilgisi | null = null;
  let stokDurum: string;
  let exitCode = 0;
  if (!["ForexBuying", "ForexSelling"].includes(KUR_TURU)) throw new Error("--kur-turu ForexBuying veya ForexSelling olmalı.");
  if (STOK_TARIHI !== null) {
    const bugun = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(STOK_TARIHI) || Number.isNaN(Date.parse(`${STOK_TARIHI}T00:00:00Z`))) {
      throw new Error("Stok tarihi YYYY-AA-GG biçiminde olmalı (ör. --stok-tarihi 2026-09-30).");
    }
    if (STOK_TARIHI > bugun) throw new Error(`Stok tarihi (${STOK_TARIHI}) gelecekte olamaz.`);
  }
  if (!STOK_TARIHI) {
    stokDurum = "Stok tarihi henüz verilmedi (--stok-tarihi YYYY-AA-GG); stok SQL'i üretilmedi.";
  } else if (!approved.length) {
    stokDurum = "stok-onay.xlsx'te onaylanmış (birim maliyet + para birimi girilmiş) satır yok; stok SQL'i üretilmedi.";
  } else {
    try {
      const r = await fetchTcmb(STOK_TARIHI, KUR_TURU, { baseUrl: TCMB_BASE, lookbackDays: 10, timeoutMs: 15000 });
      if (r.rateDate > STOK_TARIHI) {
        throw new Error(`TCMB bülten tarihi (${r.rateDate}) stok tarihinden (${STOK_TARIHI}) sonra.`);
      }
      kur = {
        stokTarihi: STOK_TARIHI,
        bultenTarihi: r.rateDate,
        bultenNo: (r.raw.bulletin as string | null) ?? null,
        kurTuru: KUR_TURU,
        kur: r.rate,
        url: tcmbUrl(r.rateDate, TCMB_BASE),
        raw: {
          ...r.raw,
          istenen_tarih: STOK_TARIHI,
          bulten_tarihi: r.rateDate,
          url: tcmbUrl(r.rateDate, TCMB_BASE),
          alinma_zamani: new Date().toISOString(),
          kaynak: "scripts/excel-aktarim.ts (Excel stok devri)",
        },
      };
      stokDurum = `Stok SQL'i üretildi: ${approved.length} kod, TCMB ${KUR_TURU} ${kur.kur} (bülten ${kur.bultenTarihi}).`;
    } catch (err) {
      exitCode = 2;
      stokDurum = `TCMB'den ${STOK_TARIHI} kuru alınamadı (${err instanceof Error ? err.message : String(err)}); stok SQL'i üretilmedi. www.tcmb.gov.tr erişimi olan bir makinede yeniden çalıştırın.`;
    }
  }

  // ------------------------------------------------ çıktılar
  mkdirSync(OUT, { recursive: true });
  const csvEsc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    ["tur", "excel_sayfasi", "excel_satiri", "urun_kodu", "urun_adi_excel", "tarih", "adet", "fatura"].join(","),
    ...deliveries.map((m) => ["teslimat", m.sheet, m.row, m.sku, m.name, m.date, m.qty, ""].map(csvEsc).join(",")),
    ...sales.map((m) => ["satis", m.sheet, m.row, m.sku, m.name, m.date, m.qty, m.invoice ?? ""].map(csvEsc).join(",")),
  ].join("\n");
  writeFileSync(path.join(OUT, "gecmis-hareketler.csv"), csv + "\n");

  const katalog = (commit: boolean) => buildCatalogSql({ products, variantPrice, thresholds, priceCurrency, commit });
  writeFileSync(path.join(OUT, "katalog-aktarim.sql"), katalog(true));
  writeFileSync(path.join(OUT, "katalog-aktarim-kuru.sql"), katalog(false));

  const stokDosyalari = ["stok-aktarim.sql", "stok-aktarim-kuru.sql"].map((f) => path.join(OUT, f));
  if (kur) {
    const stok = (commit: boolean) => buildStockSql({ rows, approved, kur: kur!, adminEmail: ADMIN_EMAIL, commit });
    writeFileSync(stokDosyalari[0], stok(true));
    writeFileSync(stokDosyalari[1], stok(false));
  } else {
    for (const f of stokDosyalari) rmSync(f, { force: true }); // eski/eskimiş stok SQL'i kalmasın
  }
  // Önceki sürümün birleşik paket dosyaları (artık kullanılmıyor)
  for (const f of ["aktarim.sql", "aktarim-kuru.sql"]) rmSync(path.join(OUT, f), { force: true });
  const eskiOnay = path.join(OUT, "onay.json");
  if (existsSync(eskiOnay)) {
    const o = JSON.parse(readFileSync(eskiOnay, "utf8")) as { acilis_maliyetleri?: Record<string, { birim_maliyet: unknown }> };
    const dolu = Object.values(o.acilis_maliyetleri ?? {}).some((x) => x.birim_maliyet !== null && x.birim_maliyet !== undefined);
    if (dolu) console.warn("Uyarı: onay.json artık kullanılmıyor; içindeki maliyetleri stok-onay.xlsx'e taşıyın.");
    else rmSync(eskiOnay);
  }

  await writeApprovals(ONAY_XLSX, rows, { excelName: path.basename(EXCEL), stokTarihi: STOK_TARIHI });

  writeFileSync(
    path.join(OUT, "RAPOR.md"),
    buildReport({
      excelName: path.basename(EXCEL),
      sheetNames,
      summary,
      deliveries,
      sales,
      catalog,
      products,
      variantPrice,
      priceRows,
      priceNotApplied,
      references,
      blocks,
      rates,
      thresholds,
      rows,
      approved,
      issues,
      kur,
      stokDurum,
    }),
  );

  const variantCount = products.reduce((a, p) => a + p.variants.length, 0);
  const positive = rows.filter((r) => r.remaining > 0);
  console.log(`Katalog: ${products.length} ürün, ${variantCount} varyant, ${[...productBy.values()].filter((p) => p.defaultPrice !== null).length + variantPrice.size} kesin fiyat eşleşmesi → katalog-aktarim.sql`);
  console.log(`Teslimat satırı: ${deliveries.length}, satış satırı: ${sales.length}`);
  console.log(
    `Mekonsis kalanı pozitif: ${positive.length} kod (${positive.reduce((a, r) => a + r.remaining, 0)} adet); onaylı: ${approved.length} (${approved.reduce((a, r) => a + r.remaining, 0)} adet); hariç: ${rows.filter((r) => r.status.startsWith("HARİÇ")).length}`,
  );
  console.log(`Çelişki/eksik/uyarı: ${issues.length}`);
  console.log(`Stok: ${stokDurum}`);
  console.log(`Çıktılar: ${path.relative(ROOT, OUT)}/`);
  process.exitCode = exitCode;
}

// ---------------------------------------------------------------- stok-onay.xlsx
const COL = {
  kod: "Ürün kodu",
  ad: "Ürün adı (Excel)",
  erp: "ERP ürün / varyant",
  teslim: "Teslim edilen",
  satis: "Satılan",
  kalan: "Mekonsis kalan (adet)",
  a1: "Aday 1: Satış Fiyatları maliyeti",
  a1pb: "Aday 1 para birimi",
  a2: "Aday 2: Ürün Maliyet dökümü toplamı",
  a2pb: "Aday 2 para birimi",
  a2usd: "Aday 2 USD karşılığı (Excel'in sabit kuruyla, bilgi)",
  maliyet: "ONAYLANAN birim maliyet",
  pb: "ONAYLANAN para birimi",
  not: "Onay notu (kaynak, isteğe bağlı)",
  durum: "Stok aktarımı",
  aciklama: "Açıklama",
} as const;

async function readApprovals(file: string): Promise<Map<string, PrevApproval>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(ONAY_SAYFASI);
  if (!ws) throw new Error(`${path.basename(file)} içinde "${ONAY_SAYFASI}" sayfası yok.`);
  const cols = new Map<string, number>();
  ws.getRow(1).eachCell((c, n) => cols.set(text(c), n));
  const need = [COL.kod, COL.kalan, COL.maliyet, COL.pb];
  const missing = need.filter((h) => !cols.has(h));
  if (missing.length) throw new Error(`${path.basename(file)}: başlık bulunamadı: ${missing.join(", ")}`);
  const out = new Map<string, PrevApproval>();
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const sku = normalizeCode(text(row.getCell(cols.get(COL.kod)!)));
    if (!sku) continue;
    const costRaw = raw(row.getCell(cols.get(COL.maliyet)!));
    let cost: number | null = null;
    if (typeof costRaw === "number") cost = costRaw;
    else if (typeof costRaw === "string" && costRaw.trim()) {
      const n = Number(costRaw.trim().replace(/\s/g, "").replace(",", "."));
      cost = Number.isFinite(n) ? n : NaN;
    }
    const pbText = text(row.getCell(cols.get(COL.pb)!)).toUpperCase();
    const currency: Currency | null =
      pbText === "USD" || pbText === "$" ? "USD" : pbText === "TRY" || pbText === "TL" || pbText === "₺" ? "TRY" : null;
    if (pbText && !currency) throw new Error(`${path.basename(file)} satır ${r} (${sku}): para birimi "${pbText}" tanınmadı; USD veya TRY yazın.`);
    const qty = num(row.getCell(cols.get(COL.kalan)!));
    const note = cols.has(COL.not) ? text(row.getCell(cols.get(COL.not)!)) || null : null;
    out.set(sku, { qty, cost: cost === null ? null : cost, currency, note });
  }
  return out;
}

async function writeApprovals(file: string, rows: OnayRow[], meta: { excelName: string; stokTarihi: string | null }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "scripts/excel-aktarim.ts";
  const ws = wb.addWorksheet(ONAY_SAYFASI, { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
  const widths: Record<keyof typeof COL, number> = {
    kod: 20, ad: 34, erp: 40, teslim: 9, satis: 9, kalan: 11, a1: 14, a1pb: 9, a2: 14, a2pb: 9, a2usd: 16,
    maliyet: 14, pb: 11, not: 28, durum: 30, aciklama: 90,
  };
  ws.columns = (Object.keys(COL) as (keyof typeof COL)[]).map((k) => ({ header: COL[k], key: k, width: widths[k] }));
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.alignment = { wrapText: true, vertical: "middle" };
  head.height = 45;
  const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  for (const k of ["maliyet", "pb", "not"] as const) head.getCell(k).fill = fill("FFFFD966");

  for (const r of rows) {
    const row = ws.addRow({
      kod: r.sku,
      ad: r.excelName,
      erp: r.erpName,
      teslim: r.delivered,
      satis: r.sold,
      kalan: r.remaining,
      a1: r.aday1?.value ?? null,
      a1pb: r.aday1?.currency ?? null,
      a2: r.aday2?.value ?? null,
      a2pb: r.aday2?.currency ?? null,
      a2usd: r.aday2 && r.aday2.currency !== "USD" ? r.aday2.usd : null,
      maliyet: r.approvedCost,
      pb: r.approvedCurrency,
      not: r.approvedNote,
      durum: r.status,
      aciklama: r.notes.join(" "),
    });
    row.alignment = { vertical: "top" };
    row.getCell("aciklama").alignment = { wrapText: true, vertical: "top" };
    for (const k of ["a1", "a2", "a2usd", "maliyet"] as const) row.getCell(k).numFmt = "0.00##";
    const excluded = r.status.startsWith("HARİÇ") || r.status === "Stok yok";
    for (const k of ["maliyet", "pb", "not"] as const) row.getCell(k).fill = fill(excluded ? "FFE7E6E6" : "FFFFF2CC");
    if (!excluded) {
      row.getCell("maliyet").dataValidation = {
        type: "decimal",
        operator: "greaterThan",
        formulae: [0],
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: "Birim maliyet",
        error: "Sıfırdan büyük bir sayı girin.",
      };
      row.getCell("pb").dataValidation = {
        type: "list",
        formulae: ['"USD,TRY"'],
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: "Para birimi",
        error: "USD veya TRY seçin.",
      };
    }
    if (r.status.startsWith("HARİÇ")) row.getCell("durum").font = { bold: true, color: { argb: "FFC00000" } };
    if (r.remaining < 0) row.getCell("kalan").font = { bold: true, color: { argb: "FFC00000" } };
    if (r.notes.some((n) => n.startsWith("Adaylar çelişkili"))) {
      for (const k of ["a1", "a1pb", "a2", "a2pb", "a2usd"] as const) row.getCell(k).fill = fill("FFFCE4D6");
    }
  }
  ws.autoFilter = { from: "A1", to: { row: 1, column: Object.keys(COL).length } };

  const help = wb.addWorksheet("Nasıl kullanılır");
  help.getColumn(1).width = 120;
  [
    `Kaynak: ${meta.excelName}. Bu dosya scripts/excel-aktarim.ts tarafından üretilir; yeniden üretimde sarı sütunlardaki onaylarınız korunur.`,
    `Stok tarihi: ${meta.stokTarihi ?? "henüz verilmedi"}.`,
    "",
    "1. Her satırda Excel'deki aday maliyetleri inceleyin. Aday 1 ve Aday 2 çelişkiliyse hücreler turuncu boyanır; eksik olanlar boştur.",
    "2. Doğru olduğunu bildiğiniz birim maliyeti 'ONAYLANAN birim maliyet' sütununa, para birimini 'ONAYLANAN para birimi' sütununa (USD/TRY) yazın.",
    "   Adaylar yalnızca bilgi içindir; siz yazmadıkça hiçbir maliyet kullanılmaz. İsterseniz kaynağı 'Onay notu' sütununa yazın (açılış kaydının notuna eklenir).",
    "3. Boş bırakılan satırlar stok aktarımına alınmaz ('Onay bekliyor').",
    "4. Negatif kalanlı ve fiyat eşleşmesi belirsiz satırlar (gri) siz netleştirip kod listesi güncellenene kadar maliyet girilse bile aktarılmaz.",
    "5. Dosyayı kaydedip npm run excel:aktarim -- --excel \"...\" --stok-tarihi YYYY-AA-GG ile yeniden üretin.",
    "   Stok tarihinin TCMB kuru otomatik alınır; tatil/hafta sonuysa önceki son bülten kaynak tarihiyle kaydedilir. Manuel kur gerekmez.",
    "",
    "Açılış stoğu üretim sayılmaz (Dashboard'daki üretilen adet ve üretim harcaması artmaz); Mekonsis'e aktarım satış değildir (ciro/kâr oluşmaz).",
  ].forEach((t) => (help.addRow([t]).getCell(1).alignment = { wrapText: true }));
  await wb.xlsx.writeFile(file);
}

// ---------------------------------------------------------------- SQL ortak parçalar
function sqlHeader(title: string, commit: boolean, extra: string[]): string[] {
  return [
    "-- =====================================================================",
    `-- Heatemp ERP — ${title} (${commit ? "GERÇEK: COMMIT" : "KURU ÇALIŞTIRMA: sonunda ROLLBACK, hiçbir şey kaydedilmez"})`,
    "-- scripts/excel-aktarim.ts tarafından üretildi; elle düzenlemeyin, yeniden üretin.",
    "-- Supabase SQL Editor'de veya psql ile tek parça çalıştırın (postgres rolü).",
    "-- Tekrar çalıştırılabilir: mevcut kayıtları silmez ve değiştirmez; var olanı atlar.",
    ...extra.map((l) => `-- ${l}`),
    "-- =====================================================================",
    "",
    "do $$ begin if to_regclass('pg_temp._aktarim_rapor') is not null then drop table pg_temp._aktarim_rapor; end if; end $$;",
    "begin;",
    "",
    "-- Sonuç raporu (oturum boyunca kalır; gerçek aktarımda COMMIT sonrası listelenir)",
    "create temp table _aktarim_rapor (",
    "  sira serial primary key, adim text not null, kod text, sonuc text not null, aciklama text",
    ");",
    "",
    "-- 0) Ön koşul: ERP migration'ları uygulanmış olmalı",
    "do $$",
    "begin",
    "  if to_regclass('public.production_batches') is null",
    "     or not exists (select 1 from information_schema.columns where table_schema = 'public'",
    "                    and table_name = 'production_batches' and column_name = 'kind')",
    "     or to_regprocedure('public.record_opening_stock(uuid,integer,numeric,text,bigint,date,text,uuid)') is null then",
    "    raise exception 'ERP migration''ları (20260928090000…20260928090900) bu veritabanına uygulanmamış.';",
    "  end if;",
    "end",
    "$$;",
    "",
  ];
}

function sqlFooter(commit: boolean, label: string): string[] {
  if (commit) {
    return ["commit;", "", "select sira, adim, kod, sonuc, aciklama from _aktarim_rapor order by sira;", ""];
  }
  return [
    "select sira, adim, kod, sonuc, aciklama from _aktarim_rapor order by sira;",
    "",
    "-- KURU ÇALIŞTIRMA: özet bilinçli bir hata mesajıyla verilir; hata transaction'ı her ortamda",
    "-- (SQL Editor, psql) kesin olarak geri alır. Hiçbir değişiklik kaydedilmez.",
    "do $$",
    "declare v_ozet text;",
    "begin",
    "  select string_agg(format('%s %s: %s', adim, sonuc, n), '; ' order by adim, sonuc) into v_ozet",
    "    from (select adim, sonuc, count(*) as n from _aktarim_rapor group by adim, sonuc) t;",
    `  raise exception '${label} KURU ÇALIŞTIRMA TAMAMLANDI — hiçbir değişiklik kaydedilmedi. Gerçek aktarımda olacaklar: %', v_ozet`,
    "    using errcode = 'P0001';",
    "end",
    "$$;",
    "rollback;",
    "",
  ];
}

// ---------------------------------------------------------------- 1. adım: katalog SQL
function buildCatalogSql(o: {
  products: ProductDef[];
  variantPrice: Map<string, { price: number; currency: Currency; source: string }>;
  thresholds: { critical: number; watch: number } | null;
  priceCurrency: Currency;
  commit: boolean;
}): string {
  const t = o.thresholds ?? { critical: 0, watch: 0 };
  const L: string[] = sqlHeader("Excel aktarımı 1. adım: KATALOG", o.commit, [
    "Yalnızca ürün, varyant, kesin eşleşen satış fiyatları ve stok eşikleri. Kur, maliyet, stok, teslimat,",
    "satış veya yönetici kimliği gerektirmez; stok defterine dokunmaz. Var olan ürün/varyant değiştirilmez.",
  ]);
  const push = (...s: string[]) => L.push(...s);
  push(
    "-- 1) Ürünler (ürün grubu kodu SKU'dan türetilmiştir; varsa atlanır)",
    "create temp table _urun (",
    "  kod text primary key, ad text not null, varsayilan_fiyat numeric, para_birimi text,",
    "  ilk_varyant_kodu text not null, ilk_varyant_adi text not null, ilk_varyant_fiyat numeric, ilk_varyant_para text",
    ") on commit drop;",
    "insert into _urun values",
    o.products
      .map((p) => {
        const first = p.variants[0];
        const vp = o.variantPrice.get(first.sku);
        return `  (${[
          sqlString(p.code),
          sqlString(p.name),
          sqlNumber(p.defaultPrice),
          sqlString(p.defaultPrice !== null ? o.priceCurrency : null),
          sqlString(first.sku),
          sqlString(first.variantName),
          sqlNumber(vp?.price ?? null),
          sqlString(vp?.currency ?? null),
        ].join(", ")})`;
      })
      .join(",\n") + ";",
    "",
    "create temp table _yeni_urun (id uuid primary key, kod text not null) on commit drop;",
    "with ekle as (",
    "  insert into public.products (code, name, default_sale_price, default_currency, unit_production_minutes,",
    "                               critical_stock, min_stock, target_stock)",
    `  select kod, ad, varsayilan_fiyat, coalesce(para_birimi, 'USD'), 0, ${t.critical}, ${t.watch}, ${t.watch}`,
    "    from _urun",
    "  on conflict (code) do nothing",
    "  returning id, code",
    ")",
    "insert into _yeni_urun select id, code from ekle;",
    "insert into _aktarim_rapor (adim, kod, sonuc, aciklama)",
    "select '1-urun', u.kod, case when y.id is null then 'zaten vardı' else 'eklendi' end,",
    "       case when y.id is null then 'Değiştirilmedi (fiyat ve eşikler dahil).'",
    `            else u.ad || coalesce(' — satış fiyatı ' || u.varsayilan_fiyat || ' ' || u.para_birimi, '') || ' — eşikler ${t.critical}/${t.watch}/${t.watch}' end`,
    "  from _urun u left join _yeni_urun y on y.kod = u.kod order by u.kod;",
    "",
    "-- Ürün eklenince tetikleyici 'Standart' varyantı oluşturur; yeni ürünlerde bu varyant ilk SKU olur.",
    "update public.product_variants v",
    "   set code = u.ilk_varyant_kodu, name = u.ilk_varyant_adi, sale_price = u.ilk_varyant_fiyat, currency = u.ilk_varyant_para",
    "  from _yeni_urun y join _urun u on u.kod = y.kod",
    " where v.product_id = y.id and v.code = y.kod and v.name = 'Standart'",
    "   and (u.ilk_varyant_kodu <> y.kod or u.ilk_varyant_adi <> 'Standart')",
    "   and not exists (select 1 from public.product_variants e where e.code = u.ilk_varyant_kodu and e.id <> v.id);",
    "",
    "-- 2) Varyantlar (Excel ürün kodu = varyant kodu; varsa atlanır)",
    "create temp table _varyant (kod text primary key, urun_kodu text not null, ad text not null, fiyat numeric, para_birimi text) on commit drop;",
    "insert into _varyant values",
    o.products
      .flatMap((p) =>
        p.variants.map((v) => {
          const vp = o.variantPrice.get(v.sku);
          return `  (${[sqlString(v.sku), sqlString(p.code), sqlString(v.variantName), sqlNumber(vp?.price ?? null), sqlString(vp?.currency ?? null)].join(", ")})`;
        }),
      )
      .join(",\n") + ";",
    "",
    "create temp table _yeni_varyant (kod text primary key) on commit drop;",
    "with ekle as (",
    "  insert into public.product_variants (product_id, code, name, sale_price, currency)",
    "  select p.id, v.kod, v.ad, v.fiyat, v.para_birimi",
    "    from _varyant v join public.products p on p.code = v.urun_kodu",
    "   where not exists (select 1 from public.product_variants e where e.code = v.kod)",
    "     and not exists (select 1 from public.product_variants e where e.product_id = p.id and e.name = v.ad)",
    "  on conflict (code) do nothing",
    "  returning code",
    ")",
    "insert into _yeni_varyant select code from ekle;",
    "insert into _aktarim_rapor (adim, kod, sonuc, aciklama)",
    "select '2-varyant', v.kod,",
    "       case when n.kod is not null or (y.id is not null and pv.id is not null) then 'eklendi'",
    "            when pv.id is null then 'ATLANDI'",
    "            when pp.code <> v.urun_kodu then 'zaten vardı (başka üründe)'",
    "            else 'zaten vardı' end,",
    "       case when pv.id is null then 'Aynı adlı varyant üründe var veya ürün bulunamadı; elle kontrol edin.'",
    "            when pp.code <> v.urun_kodu then 'Mevcut ürün: ' || pp.code || '. Değiştirilmedi.'",
    "            when n.kod is null and y.id is null then 'Değiştirilmedi.'",
    "            else v.ad || coalesce(' — satış fiyatı ' || v.fiyat || ' ' || v.para_birimi, '') end",
    "  from _varyant v",
    "  left join _yeni_varyant n on n.kod = v.kod",
    "  left join public.product_variants pv on pv.code = v.kod",
    "  left join public.products pp on pp.id = pv.product_id",
    "  left join _yeni_urun y on y.kod = v.urun_kodu and y.id = pv.product_id",
    " order by v.kod;",
    "",
    ...sqlFooter(o.commit, "KATALOG"),
  );
  return L.join("\n");
}

// ---------------------------------------------------------------- 2. adım: stok SQL
function buildStockSql(o: { rows: OnayRow[]; approved: OnayRow[]; kur: KurBilgisi; adminEmail: string | null; commit: boolean }): string {
  const k = o.kur;
  const tatil = k.bultenTarihi !== k.stokTarihi;
  const L: string[] = sqlHeader("Excel aktarımı 2. adım: STOK", o.commit, [
    `Stok tarihi ${k.stokTarihi}: onaylanan kalanlar açılış stoğu (Heatemp) + aynı gün Mekonsis teslimatı olarak girer.`,
    "Açılış stoğu üretim sayılmaz (üretilen adet / üretim harcaması artmaz); teslimat satış değildir (ciro/kâr oluşmaz).",
    `Kur: TCMB ${k.kurTuru} ${k.kur} — bülten ${k.bultenTarihi}${k.bultenNo ? ` (no ${k.bultenNo})` : ""}${tatil ? `; ${k.stokTarihi} günü bülten yayımlanmadığı için önceki son bülten` : ""}.`,
    `Kaynak: ${k.url}`,
    "Önce katalog-aktarim.sql çalıştırılmış olmalıdır.",
  ]);
  const push = (...s: string[]) => L.push(...s);
  push("-- 1) Yönetici kimliği (işlem fonksiyonları yönetici yetkisi ister; bu transaction boyunca kullanılır)", "do $$", "declare", "  v_uid uuid;", "  v_count integer;", "begin");
  if (o.adminEmail) {
    push(
      "  select u.id into v_uid from auth.users u",
      "    join public.app_users a on a.user_id = u.id and a.role = 'admin'",
      `   where lower(u.email) = lower(${sqlString(o.adminEmail)});`,
      "  if v_uid is null then",
      `    raise exception 'Yönetici bulunamadı: %. Kullanıcı app_users tablosunda admin olmalı.', ${sqlString(o.adminEmail)};`,
      "  end if;",
    );
  } else {
    push(
      "  select count(*), (array_agg(user_id))[1] into v_count, v_uid from public.app_users where role = 'admin';",
      "  if v_count <> 1 then",
      "    raise exception 'Tam olarak bir yönetici bekleniyordu (bulunan: %). Paketi --admin-email ile yeniden üretin.', v_count;",
      "  end if;",
    );
  }
  push(
    "  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);",
    "  perform set_config('request.jwt.claim.sub', v_uid::text, true);",
    "end",
    "$$;",
    "",
    "-- 2) stok-onay.xlsx'te onaylanan satırlar (negatif kalanlı ve fiyat eşleşmesi belirsiz kodlar hariç)",
    "create temp table _acilis (kod text primary key, adet integer not null, birim_maliyet numeric not null,",
    "                           para_birimi text not null, kaynak text not null) on commit drop;",
    "insert into _acilis values",
    o.approved
      .map((r) => {
        const src = `stok-onay.xlsx (kullanıcı onayı)${r.approvedNote ? `: ${r.approvedNote}` : ""}`;
        return `  (${[sqlString(r.sku), r.remaining, sqlNumber(r.approvedCost), sqlString(r.approvedCurrency), sqlString(src)].join(", ")})`;
      })
      .join(",\n") + ";",
    "",
    "do $$",
    "declare v_eksik text;",
    "begin",
    "  select string_agg(a.kod, ', ' order by a.kod) into v_eksik",
    "    from _acilis a where not exists (select 1 from public.product_variants v where v.code = a.kod);",
    "  if v_eksik is not null then",
    "    raise exception 'Şu varyantlar veritabanında yok: %. Önce katalog-aktarim.sql çalıştırın.', v_eksik;",
    "  end if;",
    "end",
    "$$;",
    "",
    "-- 3) Stok tarihinin TCMB kuru (paket üretilirken TCMB arşivinden alındı; bugünün kuru kullanılmaz)",
    "create temp table _kur (id bigint not null) on commit drop;",
    "do $$",
    "declare",
    `  v_stok date := date ${sqlString(k.stokTarihi)};`,
    `  v_bulten date := date ${sqlString(k.bultenTarihi)};`,
    `  v_kur numeric := ${sqlNumber(k.kur)};`,
    "  v_max integer;",
    "  v_id bigint;",
    "  v_row public.fx_rates;",
    "begin",
    "  select fx_max_age_days into v_max from public.app_settings where id;",
    "  if v_stok - v_bulten > coalesce(v_max, 4) then",
    "    raise exception 'Stok tarihi % için son TCMB bülteni % tarihli (% gün önce); Ayarlar''daki kur yaşı sınırı % gün. Uzun tatil ise sınırı geçici olarak artırıp tekrar çalıştırın.',",
    "      to_char(v_stok, 'DD.MM.YYYY'), to_char(v_bulten, 'DD.MM.YYYY'), v_stok - v_bulten, coalesce(v_max, 4);",
    "  end if;",
    `  v_id := public.record_auto_fx_rate('TCMB', ${sqlString(k.kurTuru)}, v_kur, v_bulten,`,
    `    ${sqlString(JSON.stringify(k.raw))}::jsonb);`,
    "  select * into v_row from public.fx_rates where id = v_id;",
    "  if v_row.rate <> round(v_kur, 6) then",
    "    raise exception 'Veritabanında % tarihli TCMB % kuru % olarak kayıtlı, TCMB arşivindeki değer %. Farkı inceleyin; aktarım yapılmadı.',",
    `      to_char(v_bulten, 'DD.MM.YYYY'), ${sqlString(k.kurTuru)}, v_row.rate, v_kur;`,
    "  end if;",
    "  insert into _kur values (v_id);",
    "  insert into _aktarim_rapor (adim, kod, sonuc, aciklama)",
    `  values ('3-kur', 'USD/TRY', 'TCMB ${k.kurTuru} ' || v_kur,`,
    `          'Stok tarihi ' || to_char(v_stok, 'DD.MM.YYYY') || ', kaynak bülten ' || to_char(v_bulten, 'DD.MM.YYYY')${tatil ? " || ' (stok günü bülten yayımlanmadı; önceki son bülten)'" : ""} || ', fx_rates.id ' || v_id);`,
    "end",
    "$$;",
    "",
    "-- 4) Açılış stoğu + aynı gün Mekonsis teslimatı. Varyantın stok hareketi varsa atlanır (çift stok oluşmaz).",
    "do $$",
    "declare",
    `  v_date date := date ${sqlString(k.stokTarihi)};`,
    "  v_fx bigint := (select id from _kur);",
    "  v_variant uuid;",
    "  v_batch uuid;",
    "  r record;",
    "begin",
    "  for r in select * from _acilis order by kod loop",
    "    select id into v_variant from public.product_variants where code = r.kod;",
    "    if exists (select 1 from public.production_batches where variant_id = v_variant)",
    "       or exists (select 1 from public.deliveries where variant_id = v_variant) then",
    "      insert into _aktarim_rapor (adim, kod, sonuc, aciklama)",
    "      values ('4-stok', r.kod, 'zaten vardı', 'Varyantın stok hareketi var (önceki aktarım veya elle giriş); çift stok oluşturulmadı.');",
    "      continue;",
    "    end if;",
    "    v_batch := public.record_opening_stock(",
    "      v_variant, r.adet, r.birim_maliyet, r.para_birimi, v_fx, v_date,",
    `      'Excel devri (Mekonsis_Heatamp_Stok_Takip, Stok Özeti kalan, ' || to_char(v_date, 'DD.MM.YYYY') || '). Maliyet: ' || r.kaynak,`,
    `      md5(${sqlString(SEED + ":acilis:")} || r.kod)::uuid);`,
    "    perform public.deliver_to_mekonsis(",
    "      v_variant, r.adet, v_batch, v_date,",
    "      'Excel devri: Mekonsis rafındaki kalan (satış değildir)',",
    `      md5(${sqlString(SEED + ":teslimat:")} || r.kod)::uuid);`,
    "    insert into _aktarim_rapor (adim, kod, sonuc, aciklama)",
    "    values ('4-stok', r.kod, 'eklendi', r.adet || ' adet açılış + Mekonsis teslimatı, birim maliyet ' || r.birim_maliyet || ' ' || r.para_birimi);",
    "  end loop;",
    "end",
    "$$;",
    "",
  );
  const info = o.rows
    .filter((r) => r.status !== "Onaylandı")
    .map((r) => {
      const [sonuc, aciklama] =
        r.status === "Onay bekliyor"
          ? ["BEKLİYOR", `${r.remaining} adet — stok-onay.xlsx'te birim maliyet onayı yok`]
          : r.status === "Stok yok"
            ? ["stok yok", "Kalan 0"]
            : ["HARİÇ", `${r.status.replace("HARİÇ: ", "")} (kalan ${r.remaining}); netleştirilene kadar aktarılmaz`];
      return `  (${[sqlString("4-stok"), sqlString(r.sku), sqlString(sonuc), sqlString(aciklama)].join(", ")})`;
    });
  if (info.length) push("insert into _aktarim_rapor (adim, kod, sonuc, aciklama) values", info.join(",\n") + ";", "");
  push(
    "-- 5) Tutarlılık: stok defteri bakiyeleri hareketlerle uyumlu olmalı",
    "do $$",
    "begin",
    "  if exists (select 1 from public.ledger_inconsistencies()) then",
    "    raise exception 'Defter tutarsızlığı bulundu; aktarım geri alındı.';",
    "  end if;",
    "end",
    "$$;",
    "",
    ...sqlFooter(o.commit, "STOK"),
  );
  return L.join("\n");
}

// ---------------------------------------------------------------- Rapor
function buildReport(o: {
  excelName: string;
  sheetNames: string[];
  summary: { sku: string; name: string }[];
  deliveries: Movement[];
  sales: Movement[];
  catalog: { sku: string; cell: string; context: string }[];
  products: ProductDef[];
  variantPrice: Map<string, { price: number; currency: Currency; source: string }>;
  priceRows: PriceRow[];
  priceNotApplied: { row: PriceRow; reason: string }[];
  references: { product: string; y2025: number | null; y2026: number | null }[];
  blocks: CostBlock[];
  rates: number[];
  thresholds: { critical: number; watch: number } | null;
  rows: OnayRow[];
  approved: OnayRow[];
  issues: Issue[];
  kur: KurBilgisi | null;
  stokDurum: string;
}): string {
  const variantCount = o.products.reduce((a, p) => a + p.variants.length, 0);
  const pos = o.rows.filter((r) => r.remaining > 0);
  const stockedSkus = new Set(o.summary.map((s) => s.sku));
  const priced = o.products.filter((p) => p.defaultPrice !== null).length + o.variantPrice.size;
  const L: string[] = [];
  L.push(
    `# Excel aktarım raporu — ${o.excelName}`,
    "",
    "Otomatik üretildi (`scripts/excel-aktarim.ts`). Veritabanına bağlanılmadı.",
    "",
    "## Çalıştırma sırası",
    "",
    "| Adım | Dosya | Gerekenler | Durum |",
    "|---|---|---|---|",
    `| 1. Katalog | \`katalog-aktarim-kuru.sql\` → \`katalog-aktarim.sql\` | Yok (kur, maliyet, yönetici gerekmez) | Hazır: ${o.products.length} ürün, ${variantCount} varyant, ${priced} kesin fiyat, eşikler |`,
    `| 2. Stok | \`stok-aktarim-kuru.sql\` → \`stok-aktarim.sql\` | Stok tarihi, \`stok-onay.xlsx\`'te onaylı maliyet, TCMB kuru (otomatik) | ${o.stokDurum} |`,
    "",
    "Her dosya tek transaction'dır, tekrar çalıştırılabilir, mevcut kayıtları silmez veya değiştirmez. Kuru",
    "çalıştırma aynı işlemleri yapıp sonunda bir özet hatası vererek her şeyi geri alır.",
    "",
    "## Sayfa bazında karar",
    "",
    "| Sayfa | İçerik | Aktarım |",
    "|---|---|---|",
    `| Ürünler | ${o.catalog.length} ürün kodu (katalog) | 1. adım: ürün + varyant |`,
    `| Stok Özeti | ${o.summary.length} kodun giren/satış/kalan özeti, durum eşikleri | 1. adım: eşikler; kalan yalnızca doğrulama (detaydan yeniden hesaplandı) |`,
    `| Teslimat Detayı | ${o.deliveries.length} satır (tarih, adet) | Stok defterine tek tek girmez; net kalan hesabında kullanılır, gecmis-hareketler.csv'ye arşivlenir |`,
    `| Satış Detayı | ${o.sales.length} satır (tarih, adet, fatura no) — fiyat yok | Satış olarak girmez (ciro/kâr uydurulmaz); net kalan hesabında kullanılır, arşivlenir |`,
    `| Satış Fiyatları | ${o.priceRows.length} ürün tipi için maliyet ve satış (USD) | 1. adım: kesin eşleşen ${priced} satış fiyatı; maliyetler yalnızca stok-onay.xlsx'te aday |`,
    `| Satış Fiyatları (simülasyon, 3'e bölüşüm, Mekonsis referansları) | Senaryo/referans tabloları | Aktarılmaz |`,
    `| Ürün Maliyet | ${o.blocks.length} maliyet dökümü | Reçete (BOM) ve hammadde oluşturulmaz; toplamlar stok-onay.xlsx'te aday 2 |`,
    "",
    `Sayfalar: ${o.sheetNames.join(", ")}.`,
    "",
    "## 1. adım — Katalog",
    "",
    `**${o.products.length} ürün, ${variantCount} varyant.** Excel ürün kodu varyant kodu olarak aynen korunur; ürün grubu kodu`,
    "sensör elemanı (NTC10K/NTC20K/PT1000) çıkarılarak türetilmiştir (ör. HT-NTC10K-K-50mm → ürün HT-K-50mm).",
    "Var olan ürün veya varyant kodu atlanır; fiyatı, eşikleri ve adı değiştirilmez.",
    "",
    "| Ürün kodu | Ürün adı | Varyantlar | Varsayılan satış fiyatı | Excel stok özetinde |",
    "|---|---|---|---|---|",
  );
  for (const p of o.products) {
    const vs = p.variants
      .map((v) => {
        const vp = o.variantPrice.get(v.sku);
        return `${v.sku}${vp ? ` (${vp.price} ${vp.currency})` : ""}`;
      })
      .join(", ");
    const inStock = p.variants.filter((v) => stockedSkus.has(v.sku)).length;
    L.push(
      `| ${p.code}${p.derivedCode ? "*" : ""} | ${p.name} | ${vs} | ${p.defaultPrice !== null ? `${p.defaultPrice} USD` : "—"} | ${inStock ? `${inStock} varyant` : "—"} |`,
    );
  }
  L.push("", "\\* türetilmiş grup kodu (değiştirilebilir).", "");
  L.push(
    `Tüm yeni ürünlere: birim üretim süresi **0 (Excel'de yok)**, stok eşikleri Excel "Durum" kuralından kritik ≤ ${o.thresholds?.critical}, minimum ≤ ${o.thresholds?.watch}, hedef ${o.thresholds?.watch} (Excel notuna göre varsayım).`,
    "",
    "Fiyatı aktarılmayan Satış Fiyatları satırları (kesin eşleşme yok):",
    "",
  );
  for (const n of o.priceNotApplied) {
    L.push(`- ${n.row.product.trim()} (maliyet ${n.row.cost} ${n.row.costCurrency}, satış ${n.row.price} ${n.row.priceCurrency}): ${n.reason}`);
  }
  const noPrice = o.products.filter((p) => p.defaultPrice === null && !p.variants.some((v) => o.variantPrice.has(v.sku)));
  L.push("", `Satış fiyatı olmayan ürünler (${noPrice.length}): ${noPrice.map((p) => p.code).join(", ")}.`, "");

  L.push(
    "## 2. adım — Stok (onay tablosu: `stok-onay.xlsx`)",
    "",
    "1. Excel yalnızca **Mekonsis rafını** izliyor: kalan = teslim edilen − satılan (detay sayfalarından yeniden hesaplandı).",
    "2. Geçmiş teslimat ve satışlar tek tek girilmez (satış fiyatı ve parti maliyeti yok). Pozitif kalan, stok tarihinde",
    "   **açılış stoğu** + **aynı gün Mekonsis'e teslimat** olarak bir kez girer; stok iki kez oluşmaz.",
    "3. Açılış stoğu **üretim sayılmaz**: Dashboard'daki üretilen adet ve üretim harcaması artmaz (açılış değeri ayrı",
    "   gösterilir). Mekonsis'e aktarım **satış değildir**: ciro ve kâr oluşmaz; stok Heatemp'in varlığı olarak kalır.",
    "4. Yalnızca `stok-onay.xlsx`'te **ONAYLANAN birim maliyet ve para birimi** yazılan satırlar aktarılır. Excel'deki",
    "   adaylar yalnızca bilgi içindir.",
    "5. **Negatif kalanlı** ve **fiyat eşleşmesi belirsiz** kodlar, maliyet girilse bile siz netleştirene kadar hariçtir.",
    "6. Kur: stok tarihindeki **TCMB bülteni** otomatik alınır; hafta sonu/tatilse önceki son bülten, kaynak tarihiyle",
    "   kaydedilir. Bugünün kuru geçmiş tarihe uygulanmaz; manuel kur gerekmez.",
    "",
  );
  if (o.kur) {
    L.push(
      `**Kur:** TCMB ${o.kur.kurTuru} **${o.kur.kur}** — stok tarihi ${o.kur.stokTarihi}, kaynak bülten ${o.kur.bultenTarihi}${o.kur.bultenNo ? ` (no ${o.kur.bultenNo})` : ""}${o.kur.bultenTarihi !== o.kur.stokTarihi ? " — stok günü bülten yayımlanmadığı için önceki son bülten" : ""}. Kaynak: ${o.kur.url}`,
      "",
    );
  }
  L.push(
    "| Ürün kodu | Ürün adı (Excel) | Mekonsis kalan | Aday 1 (Satış Fiyatları) | Aday 2 (Ürün Maliyet dökümü) | Onaylanan | Stok aktarımı | Açıklama |",
    "|---|---|---:|---|---|---|---|---|",
  );
  for (const r of o.rows) {
    const a1 = r.aday1 ? `${fmtN(r.aday1.value)} ${r.aday1.currency}` : "";
    const a2 = r.aday2 ? `${fmtN(r.aday2.value)} ${r.aday2.currency}${r.aday2.currency !== "USD" && r.aday2.usd !== null ? ` (≈${fmtN(r2(r.aday2.usd))} USD)` : ""}` : "";
    const ok = r.approvedCost !== null ? `${fmtN(r.approvedCost)} ${r.approvedCurrency ?? ""}` : "";
    const desc = r.notes.filter((n) => !n.startsWith("Kaynak:")).join(" ");
    L.push(`| ${r.sku} | ${r.excelName} | ${r.remaining} | ${a1} | ${a2} | ${ok} | ${r.status} | ${desc.replace(/\|/g, "\\|")} |`);
  }
  L.push(
    "",
    `Pozitif kalan: **${pos.length} kod, ${pos.reduce((a, r) => a + r.remaining, 0)} adet**; onaylı: ${o.approved.length} kod, ${o.approved.reduce((a, r) => a + r.remaining, 0)} adet; hariç: ${o.rows.filter((r) => r.status.startsWith("HARİÇ")).map((r) => r.sku).join(", ") || "yok"}.`,
    "",
    "## Hammadde ve reçete (BOM)",
    "",
    "Oluşturulmadı. Ürün Maliyet sayfasındaki dökümler birim başına **TL tutarı** veriyor; malzeme miktarı, birimi,",
    "eldeki stok ve alış tarihi yok. Bazı kalemler hizmet ve malzemeyi birleştiriyor (ör. \"Klemens + Termistör +",
    "Epoksi + İşçilik\"). Reçete için her malzemenin 1 adet ürün başına miktarı ve birimi gerekir.",
    "",
  );
  for (const b of o.blocks) {
    if (!b.lines.length) continue;
    L.push(
      `- **${b.title}** (${b.cell}): ${b.lines.map((l) => `${l.label} ${l.value}${l.currency ? ` ${l.currency}` : ""}`).join("; ")}` +
        (b.total !== null ? ` → toplam ${r2(b.total)} ${b.totalCurrency ?? ""}` : "") +
        (b.converted !== null ? ` (${r4(b.converted)} ${b.convertedCurrency ?? ""}${b.rate ? `, kur ${b.rate}` : ""})` : "") +
        (b.multiplier !== null ? ` (sayfada ayrıca ×${b.multiplier} adet hesabı)` : ""),
    );
  }
  L.push(
    "",
    `Excel'de sabit kurlar kullanılmış (${o.rates.join(", ")} ve simülasyonda 48); ERP bunları kullanmaz, stok tarihinin TCMB kuru kullanılır.`,
    "",
    "## Eksik ve çelişkili alanlar",
    "",
    "| Seviye | Konu | Açıklama |",
    "|---|---|---|",
  );
  const order = { çelişki: 0, eksik: 1, uyarı: 2 } as const;
  for (const i of [...o.issues].sort((a, b) => order[a.seviye] - order[b.seviye])) {
    L.push(`| ${i.seviye} | ${i.konu} | ${i.aciklama.replace(/\|/g, "\\|")} |`);
  }
  L.push(
    `| eksik | Tüm ürünler | Birim üretim süresi yok (0 olarak girilir; simülasyonda süre 0 görünür). |`,
    `| eksik | Tüm ürünler | Reçete (BOM) ve malzeme miktarları yok; üretim simülasyonu/başlatma için reçete girilmeli. |`,
    `| eksik | Satış Detayı | Birim satış fiyatı ve para birimi yok; geçmiş satışlar ciro/kâr olarak aktarılamaz. |`,
    `| eksik | Heatemp rafı | Heatemp'in kendi elindeki mamul stoğu Excel'de yok. |`,
    `| eksik | Stok | Excel kalanlarının geçerli olduğu kesin stok tarihi dosyada yok (siz belirleyeceksiniz). |`,
    "",
    "## Aktarılmayan veriler",
    "",
    "- Satış Fiyatları → \"1.000 Satış Simülasyonları\", \"Özel Satış Simülasyonları\", \"3 Ortak Maliyet - Kar Bölümü\": senaryo hesapları.",
    `- Satış Fiyatları → "Seçili Ürünler Mekonsis Satış Referansları" (2025/2026): ${o.references.map((r) => `${r.product.trim()} ${r.y2025}/${r.y2026}`).join("; ")} — birimi belirtilmemiş referans rakamlar; Heatemp satışı değil.`,
    "- Sıva Üstü Termostat: ürün kodu yok.",
    "- Geçmiş teslimat ve satış satırları: `gecmis-hareketler.csv` (fatura numaralarıyla).",
    "",
  );
  return L.join("\n");
}

main().catch((err) => {
  console.error("Aktarım paketi üretilemedi:", err instanceof Error ? err.message : err);
  process.exit(1);
});
