// Mevcut stok takip Excel'ini SALT OKUNUR inceler ve bir alan eşleştirme
// raporu üretir. Veritabanına hiçbir şey yazmaz.
//
// Kullanım:
//   npm run excel:incele -- "referans/Mekonsis_Heatamp_Stok_Takip (1).xlsx"
//   (yol verilmezse referans/ klasöründeki ilk .xlsx dosyası kullanılır)
// Çıktı: docs/excel-inceleme-sonucu.md

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { inferKind, suggestField } from "./excel-eslestirme";

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) return (v as { result: unknown }).result ?? null; // formül
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
    if ("text" in v) return (v as { text: string }).text;
    if ("error" in v) return null;
  }
  return v;
}

function display(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v === null || v === undefined) return "";
  return String(v).replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 40);
}

async function main() {
  const root = path.resolve(__dirname, "..");
  let file = process.argv[2];
  if (!file) {
    const dir = path.join(root, "referans");
    const found = existsSync(dir) ? readdirSync(dir).find((f) => f.toLowerCase().endsWith(".xlsx")) : undefined;
    if (!found) {
      console.error("Excel dosyası bulunamadı. Dosyayı referans/ klasörüne koyun veya yolu parametre olarak verin.");
      process.exit(1);
    }
    file = path.join(dir, found);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const out: string[] = [];
  out.push(`# Excel inceleme sonucu (otomatik üretildi)`);
  out.push("");
  out.push(`Kaynak: \`${path.basename(file)}\` — ${new Date().toISOString().slice(0, 10)}`);
  out.push("");
  out.push("> Bu rapor salt okunur incelemedir; veritabanına hiçbir kayıt aktarılmadı.");
  out.push("> Önerilen eşleştirmeler başlık adlarına göre tahmindir ve elle doğrulanmalıdır.");

  wb.eachSheet((ws) => {
    const rows: unknown[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = (row.values as ExcelJS.CellValue[]).slice(1).map(cellValue);
      rows.push(values);
    });
    out.push("");
    out.push(`## Sayfa: ${ws.name}`);
    out.push("");
    if (rows.length === 0) {
      out.push("Boş sayfa.");
      return;
    }
    // Başlık satırı: en az iki metin hücresi olan ilk satır
    const headerIndex = rows.findIndex((r) => r.filter((v) => typeof v === "string" && v.trim()).length >= 2);
    if (headerIndex < 0) {
      out.push(`Başlık satırı bulunamadı (${rows.length} dolu satır).`);
      return;
    }
    const header = rows[headerIndex].map((v) => (v === null ? "" : String(v).trim()));
    const data = rows.slice(headerIndex + 1).filter((r) => r.some((v) => v !== null && v !== ""));
    out.push(`Başlık satırı: ${headerIndex + 1}. dolu satır · veri satırı: ${data.length}`);
    out.push("");
    out.push("| # | Excel sütunu | Değer türü | Örnek değerler | Önerilen hedef alan |");
    out.push("|---|---|---|---|---|");
    header.forEach((h, i) => {
      if (!h) return;
      const col = data.map((r) => r[i]);
      const samples = [...new Set(col.filter((v) => v !== null && v !== "").map(display))].slice(0, 4).join(", ");
      const target = suggestField(h);
      out.push(`| ${i + 1} | ${display(h)} | ${inferKind(col)} | ${samples} | ${target ? `${target.label} (\`${target.key}\`)` : "— (eşleşme yok)"} |`);
    });

    const nameCol = header.findIndex((h) => suggestField(h)?.key === "products.name");
    const codeCol = header.findIndex((h) => suggestField(h)?.key === "products.code");
    if (nameCol >= 0 || codeCol >= 0) {
      const products = new Map<string, string>();
      for (const r of data) {
        const name = nameCol >= 0 ? display(r[nameCol]) : "";
        const code = codeCol >= 0 ? display(r[codeCol]) : "";
        if (name || code) products.set(`${code}|${name}`, `${code || "—"} · ${name || "—"}`);
      }
      out.push("");
      out.push(`Tespit edilen ürün satırları (${products.size} benzersiz):`);
      out.push("");
      for (const p of [...products.values()].slice(0, 200)) out.push(`- ${p}`);
    }
  });

  const docs = path.join(root, "docs");
  mkdirSync(docs, { recursive: true });
  const target = path.join(docs, "excel-inceleme-sonucu.md");
  writeFileSync(target, out.join("\n") + "\n");
  console.log(`Rapor yazıldı: ${path.relative(root, target)}`);
}

main().catch((err) => {
  console.error("Excel okunamadı:", err instanceof Error ? err.message : err);
  process.exit(1);
});
