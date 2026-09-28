// Mekonsis/Heatemp stok takip Excel'inden ERP aktarım paketi üretir (SALT OKUNUR).
// Veritabanına bağlanmaz. Çıktılar (varsayılan import/excel-aktarim/, git dışında):
//   RAPOR.md              — sayfa bazında aktarım kararları, sayılar, eksik/çelişkili alanlar
//   onay.json             — açılış stoğu birim maliyet onayları (yoksa şablon oluşturulur, üzerine yazılmaz)
//   gecmis-hareketler.csv — Excel'deki geçmiş teslimat ve satış satırları (arşiv; stok defterine girmez)
//   aktarim-kuru.sql      — kuru çalıştırma: aynı işlemler, sonunda ROLLBACK
//   aktarim.sql           — gerçek aktarım: tek transaction, tekrar çalıştırılabilir, silme yapmaz
//
// Kullanım:
//   npm run excel:aktarim -- --excel "referans/Mekonsis_Heatamp_Stok_Takip (1).xlsx" --stok-tarihi 2026-09-28
//   [--onay import/excel-aktarim/onay.json] [--cikti import/excel-aktarim] [--admin-email yonetici@firma.com]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
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
  type StockLine,
} from "./excel-aktarim-model";

// ---------------------------------------------------------------- argümanlar
function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}
const ROOT = path.resolve(__dirname, "..");
const EXCEL = arg("excel");
const OUT = path.resolve(ROOT, arg("cikti") ?? "import/excel-aktarim");
const ONAY = path.resolve(ROOT, arg("onay") ?? path.join(path.relative(ROOT, OUT), "onay.json"));
const STOK_TARIHI_ARG = arg("stok-tarihi");
const ADMIN_EMAIL_ARG = arg("admin-email");
const SEED = "heatemp-excel-aktarim-v1";

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
interface OnayRow {
  adet: number;
  birim_maliyet: number | null;
  para_birimi: Currency | null;
  excel_adaylari: { deger: number; para_birimi: Currency; kaynak: string }[];
  not?: string;
}
interface Onay {
  aciklama: string;
  stok_tarihi: string | null;
  admin_email: string | null;
  acilis_maliyetleri: Record<string, OnayRow>;
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
  // Toplu (600 adet) blok ile birim blok tutarlılığı
  const batchBlock = blocks.find((b) => /^\d+\s*Ad\./.test(b.title));
  const unitBlock = blocks.find((b) => b.title.startsWith("1 Adet Paslanmaz"));
  if (batchBlock && unitBlock) {
    const n = Number(batchBlock.title.match(/^(\d+)/)![1]);
    for (const line of batchBlock.lines) {
      const u = unitBlock.lines.find((l) => l.label === line.label);
      if (u && Math.abs(u.value - line.value / n) > 0.05) {
        const implied = Math.round(line.value / u.value);
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
    issues.push({
      seviye: "uyarı",
      konu: "Maliyet: Kanal Tipi 150mm",
      aciklama: "Maliyet dökümü PT1000 eleman içeriyor; stoktaki Kanal Tipi varyantları NTC10K ve NTC20K. Döküm bu varyantlara doğrudan uygulanamaz.",
    });
  }
  const pmt = blocks.find((b) => b.title === "Plastik Mahal Tipi");
  if (pmt?.lines.some((l) => /PT1000/.test(l.label))) {
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

  // ------------------------------------------------ Açılış maliyeti adayları ve onay
  const candidatesFor = (sku: string): OnayRow["excel_adaylari"] => {
    const v = parseSku(sku);
    const out: OnayRow["excel_adaylari"] = [];
    for (const pr of priceRows) {
      const t = PRICE_TARGETS[pr.product.trim()];
      if (!t || t.level === "none" || pr.cost === null || !pr.costCurrency) continue;
      if ((t.level === "product" && t.code === v.productCode) || (t.level === "variant" && t.code === sku)) {
        out.push({ deger: pr.cost, para_birimi: pr.costCurrency, kaynak: `Satış Fiyatları!C${pr.row} (${pr.product.trim()})` });
        const block = blocks.find((b) => COST_BLOCK_TO_PRICE[b.title] === pr.product.trim());
        if (block?.total !== null && block?.total !== undefined && block.totalCurrency) {
          out.push({
            deger: r4(block.total),
            para_birimi: block.totalCurrency,
            kaynak: `Ürün Maliyet dökümü "${block.title}" toplamı`,
          });
        }
      }
    }
    return out;
  };
  const positive = stock.filter((s) => s.remaining > 0);
  let onay: Onay;
  let onayCreated = false;
  if (existsSync(ONAY)) {
    onay = JSON.parse(readFileSync(ONAY, "utf8")) as Onay;
  } else {
    onay = {
      aciklama:
        "Açılış stoğu yalnızca birim_maliyet ve para_birimi doldurulan kodlar için oluşturulur. excel_adaylari yalnızca bilgi içindir; Excel'deki değerler parti maliyeti değil tahmini maliyettir. Boş bırakılan kodlar aktarılmaz ve raporda 'bekliyor' olarak listelenir.",
      stok_tarihi: STOK_TARIHI_ARG,
      admin_email: ADMIN_EMAIL_ARG,
      acilis_maliyetleri: Object.fromEntries(
        positive.map((s) => [
          s.sku,
          { adet: s.remaining, birim_maliyet: null, para_birimi: null, excel_adaylari: candidatesFor(s.sku) },
        ]),
      ),
    };
    onayCreated = true;
  }
  const stokTarihi = STOK_TARIHI_ARG ?? onay.stok_tarihi;
  if (!stokTarihi || !/^\d{4}-\d{2}-\d{2}$/.test(stokTarihi)) {
    throw new Error("Stok tarihi gerekli: --stok-tarihi YYYY-AA-GG (Excel'deki kalanların geçerli olduğu gün).");
  }
  const adminEmail = ADMIN_EMAIL_ARG ?? onay.admin_email ?? null;
  const confirmed: { sku: string; qty: number; cost: number; currency: Currency; source: string }[] = [];
  const pending: StockLine[] = [];
  for (const s of positive) {
    const o = onay.acilis_maliyetleri[s.sku];
    if (o && o.adet !== s.remaining) {
      throw new Error(`onay.json'daki adet (${o.adet}) Excel'deki kalanla (${s.remaining}) uyuşmuyor: ${s.sku}. Onay dosyasını yeniden oluşturun.`);
    }
    if (o && o.birim_maliyet !== null && o.birim_maliyet !== undefined) {
      if (!(o.birim_maliyet > 0) || (o.para_birimi !== "USD" && o.para_birimi !== "TRY")) {
        throw new Error(`onay.json: ${s.sku} için birim_maliyet > 0 ve para_birimi USD/TRY olmalı.`);
      }
      confirmed.push({
        sku: s.sku,
        qty: s.remaining,
        cost: o.birim_maliyet,
        currency: o.para_birimi,
        source: o.not ?? "onay.json (kullanıcı onayı)",
      });
    } else {
      pending.push(s);
    }
  }

  // ------------------------------------------------ çıktılar
  mkdirSync(OUT, { recursive: true });
  if (onayCreated) writeFileSync(ONAY, JSON.stringify(onay, null, 2) + "\n");

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

  const sql = (commit: boolean) =>
    buildSql({ products, variantPrice, thresholds, priceCurrency, confirmed, pending, stock, stokTarihi, adminEmail, commit });
  writeFileSync(path.join(OUT, "aktarim.sql"), sql(true));
  writeFileSync(path.join(OUT, "aktarim-kuru.sql"), sql(false));

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
      stock,
      confirmed,
      pending,
      issues,
      stokTarihi,
      onayPath: path.relative(ROOT, ONAY),
    }),
  );

  const variantCount = products.reduce((a, p) => a + p.variants.length, 0);
  console.log(`Ürün: ${products.length}, varyant: ${variantCount}, katalog kodu: ${catalog.length}`);
  console.log(`Teslimat satırı: ${deliveries.length}, satış satırı: ${sales.length}`);
  console.log(`Kalanı pozitif varyant: ${positive.length} (${positive.reduce((a, s) => a + s.remaining, 0)} adet); onaylı maliyet: ${confirmed.length}, bekleyen: ${pending.length}`);
  console.log(`Çelişki/eksik/uyarı: ${issues.length}`);
  console.log(`Çıktılar: ${path.relative(ROOT, OUT)}/ ${onayCreated ? "(onay.json şablonu oluşturuldu)" : ""}`);
}

// ---------------------------------------------------------------- SQL
function buildSql(o: {
  products: ProductDef[];
  variantPrice: Map<string, { price: number; currency: Currency; source: string }>;
  thresholds: { critical: number; watch: number } | null;
  priceCurrency: Currency;
  confirmed: { sku: string; qty: number; cost: number; currency: Currency; source: string }[];
  pending: StockLine[];
  stock: StockLine[];
  stokTarihi: string;
  adminEmail: string | null;
  commit: boolean;
}): string {
  const t = o.thresholds ?? { critical: 0, watch: 0 };
  const L: string[] = [];
  const push = (...s: string[]) => L.push(...s);
  push(
    "-- =====================================================================",
    `-- Heatemp ERP — Excel aktarımı (${o.commit ? "GERÇEK: COMMIT" : "KURU ÇALIŞTIRMA: sonunda ROLLBACK, hiçbir şey kaydedilmez"})`,
    "-- scripts/excel-aktarim.ts tarafından üretildi; elle düzenlemeyin, yeniden üretin.",
    "-- Supabase SQL Editor'de veya psql ile tek parça çalıştırın (postgres rolü).",
    "-- Tekrar çalıştırılabilir: mevcut kayıtları silmez ve değiştirmez; var olanı atlar.",
    "-- Geçmiş teslimat/satış satırları stok defterine AKTARILMAZ (bkz. RAPOR.md).",
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
    "-- 0) Ön koşullar: ERP migration'ları ve yönetici kimliği",
    "do $$",
    "declare",
    "  v_uid uuid;",
    "  v_count integer;",
    "begin",
    "  if to_regclass('public.production_batches') is null",
    "     or not exists (select 1 from information_schema.columns where table_schema = 'public'",
    "                    and table_name = 'production_batches' and column_name = 'kind')",
    "     or to_regprocedure('public.record_opening_stock(uuid,integer,numeric,text,bigint,date,text,uuid)') is null then",
    "    raise exception 'ERP migration''ları (20260928090000…20260928090900) bu veritabanına uygulanmamış.';",
    "  end if;",
  );
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
      "    raise exception 'Tam olarak bir yönetici bekleniyordu (bulunan: %). --admin-email ile belirtin.', v_count;",
      "  end if;",
    );
  }
  push(
    "  -- İşlem fonksiyonları yönetici yetkisi ister; bu transaction boyunca yöneticinin kimliğiyle çalışılır.",
    "  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);",
    "  perform set_config('request.jwt.claim.sub', v_uid::text, true);",
    "end",
    "$$;",
    "",
    "-- 1) Ürünler (ürün grubu kodu SKU'dan türetilmiştir; varsa atlanır)",
    "create temp table _urun (",
    "  kod text primary key, ad text not null, varsayilan_fiyat numeric, para_birimi text,",
    "  ilk_varyant_kodu text not null, ilk_varyant_adi text not null, ilk_varyant_fiyat numeric, ilk_varyant_para text",
    ") on commit drop;",
    "insert into _urun values",
  );
  push(
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
    "       case when y.id is null then 'Değiştirilmedi.' else u.ad end",
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
    "            else v.ad end",
    "  from _varyant v",
    "  left join _yeni_varyant n on n.kod = v.kod",
    "  left join public.product_variants pv on pv.code = v.kod",
    "  left join public.products pp on pp.id = pv.product_id",
    "  left join _yeni_urun y on y.kod = v.urun_kodu and y.id = pv.product_id",
    " order by v.kod;",
    "",
    `-- 3) Mevcut stok: Excel Stok Özeti kalanı (teslim − satış) ${o.stokTarihi} itibarıyla Mekonsis rafına devredilir.`,
    "--    Yöntem: açılış stoğu (Heatemp, onaylı birim maliyetle) + aynı gün Mekonsis'e teslimat.",
    "--    Geçmiş teslimat/satış satırları ayrıca girilmez; böylece aynı stok iki kez oluşmaz.",
    "create temp table _acilis (kod text primary key, adet integer not null, birim_maliyet numeric not null,",
    "                           para_birimi text not null, kaynak text not null) on commit drop;",
  );
  if (o.confirmed.length) {
    push(
      "insert into _acilis values",
      o.confirmed
        .map((c) => `  (${[sqlString(c.sku), c.qty, sqlNumber(c.cost), sqlString(c.currency), sqlString(c.source)].join(", ")})`)
        .join(",\n") + ";",
    );
  } else {
    push("-- (onaylı birim maliyet yok: açılış stoğu oluşturulmayacak)");
  }
  push(
    "",
    "do $$",
    "declare",
    `  v_date date := date ${sqlString(o.stokTarihi)};`,
    "  v_fx bigint;",
    "  v_variant uuid;",
    "  v_batch uuid;",
    "  r record;",
    "begin",
    "  if exists (select 1 from _acilis) then",
    "    select f.id into v_fx from public.fx_rate_for_date(v_date) f where f.is_valid;",
    "    if v_fx is null then",
    "      raise exception 'Stok tarihi % için geçerli USD/TRY kuru yok. Uygulamada Ayarlar > Manuel kur girişi ile bu tarihe kur girin (veya otomatik kuru alın) ve tekrar çalıştırın.', v_date;",
    "    end if;",
    "  end if;",
    "  for r in select * from _acilis order by kod loop",
    "    select id into v_variant from public.product_variants where code = r.kod;",
    "    if v_variant is null then",
    "      insert into _aktarim_rapor (adim, kod, sonuc, aciklama) values ('3-stok', r.kod, 'ATLANDI', 'Varyant yok.');",
    "      continue;",
    "    end if;",
    "    if exists (select 1 from public.production_batches where variant_id = v_variant)",
    "       or exists (select 1 from public.deliveries where variant_id = v_variant) then",
    "      insert into _aktarim_rapor (adim, kod, sonuc, aciklama)",
    "      values ('3-stok', r.kod, 'zaten vardı', 'Varyantın stok hareketi var (önceki aktarım veya elle giriş); çift stok oluşturulmadı.');",
    "      continue;",
    "    end if;",
    "    v_batch := public.record_opening_stock(",
    "      v_variant, r.adet, r.birim_maliyet, r.para_birimi, v_fx, v_date,",
    `      'Excel devri (Mekonsis_Heatamp_Stok_Takip, Stok Özeti kalan). Maliyet: ' || r.kaynak,`,
    `      md5(${sqlString(SEED + ":acilis:")} || r.kod)::uuid);`,
    "    perform public.deliver_to_mekonsis(",
    "      v_variant, r.adet, v_batch, v_date,",
    "      'Excel devri: Mekonsis rafındaki kalan',",
    `      md5(${sqlString(SEED + ":teslimat:")} || r.kod)::uuid);`,
    "    insert into _aktarim_rapor (adim, kod, sonuc, aciklama)",
    "    values ('3-stok', r.kod, 'eklendi', r.adet || ' adet açılış + Mekonsis teslimatı, birim maliyet ' || r.birim_maliyet || ' ' || r.para_birimi);",
    "  end loop;",
    "end",
    "$$;",
    "",
  );
  const waiting = o.pending.map(
    (s) => `  (${[sqlString("3-stok"), sqlString(s.sku), sqlString("BEKLİYOR"), sqlString(`${s.remaining} adet — birim maliyet onayı yok (onay.json)`)].join(", ")})`,
  );
  const blocked = o.stock
    .filter((s) => s.remaining <= 0)
    .map(
      (s) =>
        `  (${[sqlString("3-stok"), sqlString(s.sku), sqlString(s.remaining < 0 ? "AKTARILMADI" : "stok yok"), sqlString(s.remaining < 0 ? `Kalan ${s.remaining}: satılan teslim edilenden fazla (çelişki)` : "Kalan 0")].join(", ")})`,
    );
  if (waiting.length || blocked.length) {
    push("insert into _aktarim_rapor (adim, kod, sonuc, aciklama) values", [...waiting, ...blocked].join(",\n") + ";", "");
  }
  push(
    "-- 4) Tutarlılık: stok defteri bakiyeleri hareketlerle uyumlu olmalı",
    "do $$",
    "begin",
    "  if exists (select 1 from public.ledger_inconsistencies()) then",
    "    raise exception 'Defter tutarsızlığı bulundu; aktarım geri alındı.';",
    "  end if;",
    "end",
    "$$;",
    "",
  );
  if (o.commit) {
    push(
      "commit;",
      "",
      "select sira, adim, kod, sonuc, aciklama from _aktarim_rapor order by sira;",
      "",
    );
  } else {
    push(
      "select sira, adim, kod, sonuc, aciklama from _aktarim_rapor order by sira;",
      "",
      "-- KURU ÇALIŞTIRMA: özet bilinçli bir hata mesajıyla verilir; hata transaction'ı her ortamda",
      "-- (SQL Editor, psql) kesin olarak geri alır. Hiçbir değişiklik kaydedilmez.",
      "do $$",
      "declare v_ozet text;",
      "begin",
      "  select string_agg(format('%s %s: %s', adim, sonuc, n), '; ' order by adim, sonuc) into v_ozet",
      "    from (select adim, sonuc, count(*) as n from _aktarim_rapor group by adim, sonuc) t;",
      "  raise exception 'KURU ÇALIŞTIRMA TAMAMLANDI — hiçbir değişiklik kaydedilmedi. Gerçek aktarımda olacaklar: %', v_ozet",
      "    using errcode = 'P0001';",
      "end",
      "$$;",
      "rollback;",
      "",
    );
  }
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
  stock: StockLine[];
  confirmed: { sku: string; qty: number; cost: number; currency: Currency }[];
  pending: StockLine[];
  issues: Issue[];
  stokTarihi: string;
  onayPath: string;
}): string {
  const variantCount = o.products.reduce((a, p) => a + p.variants.length, 0);
  const pos = o.stock.filter((s) => s.remaining > 0);
  const stockedSkus = new Set(o.summary.map((s) => s.sku));
  const L: string[] = [];
  L.push(
    `# Excel aktarım raporu — ${o.excelName}`,
    "",
    `Stok tarihi (devir): **${o.stokTarihi}** · Otomatik üretildi (\`scripts/excel-aktarim.ts\`). Veritabanına bağlanılmadı.`,
    "",
    "## Sayfa bazında karar",
    "",
    "| Sayfa | İçerik | Aktarım |",
    "|---|---|---|",
    `| Ürünler | ${o.catalog.length} ürün kodu (katalog) | Ürün + varyant olarak |`,
    `| Stok Özeti | ${o.summary.length} kodun giren/satış/kalan özeti, durum eşikleri | Eşikler ürünlere; kalan yalnızca doğrulama için (detaydan yeniden hesaplandı) |`,
    `| Teslimat Detayı | ${o.deliveries.length} satır (tarih, adet) | Stok defterine girmez; net kalan hesabında kullanılır, gecmis-hareketler.csv'ye arşivlenir |`,
    `| Satış Detayı | ${o.sales.length} satır (tarih, adet, fatura no) — fiyat yok | Satış olarak girmez (fiyat yok → ciro/kâr uydurulmaz); net kalan hesabında kullanılır, arşivlenir |`,
    `| Satış Fiyatları | ${o.priceRows.length} ürün tipi için maliyet ve satış (USD) | Satış fiyatı → varsayılan fiyat (${o.priceRows.length - o.priceNotApplied.length} eşleşti); maliyet → yalnızca açılış maliyeti adayı |`,
    `| Satış Fiyatları (simülasyon, 3'e bölüşüm, Mekonsis referansları) | Senaryo/referans tabloları | Aktarılmaz |`,
    `| Ürün Maliyet | ${o.blocks.length} maliyet dökümü | Reçete (BOM) ve hammadde oluşturulmaz (bkz. aşağı); rapor olarak kalır |`,
    "",
    `Sayfalar: ${o.sheetNames.join(", ")}.`,
    "",
    "## Ürün ve varyantlar",
    "",
    `**${o.products.length} ürün, ${variantCount} varyant.** Excel ürün kodu varyant kodu olarak aynen korunur; ürün grubu kodu`,
    "sensör elemanı (NTC10K/NTC20K/PT1000) çıkarılarak türetilmiştir (ör. HT-NTC10K-K-50mm → ürün HT-K-50mm).",
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
    `Tüm ürünlere: birim üretim süresi **0 (Excel'de yok)**, stok eşikleri Excel "Durum" kuralından kritik ≤ ${o.thresholds?.critical}, minimum ≤ ${o.thresholds?.watch}, hedef ${o.thresholds?.watch} (Excel notuna göre varsayım).`,
    "",
    "Fiyat eşleşmesi olmayan satırlar:",
    "",
  );
  for (const n of o.priceNotApplied) {
    L.push(`- ${n.row.product.trim()} (maliyet ${n.row.cost} ${n.row.costCurrency}, satış ${n.row.price} ${n.row.priceCurrency}): ${n.reason}`);
  }
  const noPrice = o.products.filter((p) => p.defaultPrice === null && !p.variants.some((v) => o.variantPrice.has(v.sku)));
  L.push("", `Satış fiyatı olmayan ürünler (${noPrice.length}): ${noPrice.map((p) => p.code).join(", ")}.`, "");

  L.push(
    "## Stok aktarım yöntemi",
    "",
    "1. Excel yalnızca **Mekonsis rafını** izliyor: kalan = teslim edilen − satılan (detay sayfalarından yeniden hesaplandı).",
    "2. Satışlarda fiyat, teslimatlarda parti maliyeti olmadığı için geçmiş hareketler stok defterine **tek tek girilmez**.",
    `3. Pozitif kalan, ${o.stokTarihi} tarihinde **açılış stoğu** (Heatemp, gerçek birim maliyetle) + **aynı gün Mekonsis'e teslimat** olarak girer.`,
    "   Böylece stok yalnızca bir kez oluşur; ERP'de satış ve ciro geçmişi sıfırdan başlar.",
    "4. Açılış stoğu yalnızca **birim maliyeti onaylanan** kodlar için oluşturulur (`" + o.onayPath + "`). Excel'deki maliyetler",
    "   parti maliyeti değil tahmini maliyettir; otomatik kullanılmaz.",
    "5. Heatemp'in kendi rafındaki stok Excel'de yok → aktarılmaz.",
    "6. Kalanı negatif çıkan kodlar aktarılmaz (çelişki).",
    "",
    "| Kod | Teslim | Satış | Kalan | Durum | Excel maliyet adayı |",
    "|---|---:|---:|---:|---|---|",
  );
  for (const s of o.stock) {
    const c = o.confirmed.find((x) => x.sku === s.sku);
    const state =
      s.remaining < 0 ? "**aktarılmaz (negatif)**" : s.remaining === 0 ? "stok yok" : c ? `açılış: ${c.cost} ${c.currency}` : "maliyet onayı bekliyor";
    const product = o.products.find((p) => p.variants.some((v) => v.sku === s.sku));
    const cand = o.priceRows
      .filter((pr) => {
        const t = PRICE_TARGETS[pr.product.trim()];
        return t && t.level !== "none" && (t.code === product?.code || t.code === s.sku);
      })
      .map((pr) => `${pr.cost} ${pr.costCurrency}`)
      .join(", ");
    L.push(`| ${s.sku} | ${s.delivered} | ${s.sold} | ${s.remaining} | ${state} | ${cand || "yok"} |`);
  }
  L.push(
    "",
    `Pozitif kalan: **${pos.length} kod, ${pos.reduce((a, s) => a + s.remaining, 0)} adet**; onaylı maliyetle aktarılacak: ${o.confirmed.length} kod, ${o.confirmed.reduce((a, s) => a + s.qty, 0)} adet; bekleyen: ${o.pending.length} kod.`,
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
    `Excel'de sabit kurlar kullanılmış (${o.rates.join(", ")} ve simülasyonda 48); ERP bunları kullanmaz, işlem günü kuru gerekir.`,
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
