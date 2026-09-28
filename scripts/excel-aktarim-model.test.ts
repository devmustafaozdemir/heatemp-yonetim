import { describe, expect, it } from "vitest";
import { computeStock, groupProducts, parseSku, sqlString, type Movement } from "./excel-aktarim-model";

describe("Excel ürün kodu → ERP ürün/varyant", () => {
  it("sensör kodlarını tip + uzunluk ürününe, elemanı varyanta ayırır", () => {
    expect(parseSku("HT-NTC10K-K-50mm")).toMatchObject({
      productCode: "HT-K-50mm",
      productName: "Kablo Tipi Sıcaklık Sensörü - 50mm",
      variantName: "NTC10K",
    });
    expect(parseSku("HT-PT1000-KT-150mm")).toMatchObject({ productCode: "HT-KT-150mm", variantName: "PT1000" });
    expect(parseSku("HT-NTC20K-MT-P")).toMatchObject({
      productCode: "HT-MT-P",
      productName: "Mahal Tipi Sıcaklık Sensörü - Plastik",
    });
    expect(parseSku("HT-NTC10K-DO")).toMatchObject({ productCode: "HT-DO", productName: "Dış Ortam Tipi Sıcaklık Sensörü" });
    expect(parseSku("HT-KV15")).toMatchObject({ productCode: "HT-KV", variantName: "150mm" });
    expect(parseSku("HT-SKS-N1")).toMatchObject({ productCode: "HT-SKS", variantName: "Normal (Buzzersız)" });
    expect(parseSku("HT-FCM4")).toMatchObject({ productCode: "HT-FCM", variantName: "4 Fan Kontrol" });
    expect(parseSku("HT-NTC10K-D-50mm").notes[0]).toMatch(/D' kısaltmasının anlamı/);
  });

  it("kalıba uymayan kodu değiştirmeden tek varyantlı ürün yapar", () => {
    expect(parseSku(" 1/4 x 1/2  Redüksiyon ")).toMatchObject({
      sku: "1/4 x 1/2 Redüksiyon",
      productCode: "1/4 x 1/2 Redüksiyon",
      variantName: "Standart",
    });
  });

  it("varyantları gruplar ve kararlı sıralar", () => {
    const g = groupProducts(["HT-PT1000-K-50mm", "HT-NTC10K-K-50mm", "HT-NTC20K-K-50mm", "HT-NTC10K-K-50mm"]);
    expect(g).toHaveLength(1);
    expect(g[0].variants.map((v) => v.variantName)).toEqual(["NTC10K", "NTC20K", "PT1000"]);
    expect(g[0].derivedCode).toBe(true);
  });
});

describe("Stok hesabı ve çelişkiler", () => {
  const m = (sku: string, date: string, qty: number): Movement => ({ sheet: "x", row: 1, name: "", sku, date, qty });

  it("kalan = teslim − satış; sıfır adetli satırlar sayılmaz", () => {
    const [s] = computeStock([m("A", "2026-06-01", 100), m("A", "2026-07-01", 0)], [m("A", "2026-06-05", 30)]);
    expect(s).toMatchObject({ delivered: 100, sold: 30, remaining: 70, issues: [] });
  });

  it("teslimattan fazla ve teslimattan önce satışı işaretler", () => {
    const [s] = computeStock([m("B", "2026-06-19", 168)], [m("B", "2026-06-16", 300)]);
    expect(s.remaining).toBe(-132);
    expect(s.issues.join(" ")).toMatch(/fazla/);
    expect(s.issues.join(" ")).toMatch(/önce/);
  });

  it("SQL metinlerini güvenli kaçışlar", () => {
    expect(sqlString("O'Neil")).toBe("'O''Neil'");
    expect(sqlString(null)).toBe("null");
  });
});
