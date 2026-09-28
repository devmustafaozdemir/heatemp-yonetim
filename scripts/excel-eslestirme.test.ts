import { describe, expect, it } from "vitest";
import { inferKind, normalizeHeader, suggestField } from "./excel-eslestirme";

describe("Excel başlık eşleştirme", () => {
  it("Türkçe başlıkları normalize eder", () => {
    expect(normalizeHeader("Ürün Adı")).toBe("urun adi");
    expect(normalizeHeader("  Satış Fiyatı (USD) ")).toBe("satis fiyati usd");
  });

  it("yaygın başlıkları hedef alanlara eşler", () => {
    expect(suggestField("Ürün Kodu")?.key).toBe("products.code");
    expect(suggestField("Ürün Adı")?.key).toBe("products.name");
    expect(suggestField("Mekonsis Stok")?.key).toBe("stock.mekonsis");
    expect(suggestField("Satılan Adet")?.key).toBe("sold_qty");
    expect(suggestField("Birim Maliyet")?.key).toBe("unit_cost");
    expect(suggestField("Hammadde")?.key).toBe("raw_materials.name");
    expect(suggestField("xyz")).toBeNull();
  });

  it("değer türünü çıkarır", () => {
    expect(inferKind([1, 2, null])).toBe("sayı");
    expect(inferKind(["a", 1])).toBe("karışık");
    expect(inferKind([null, ""])).toBe("boş");
  });
});
