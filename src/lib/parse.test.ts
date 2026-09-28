import { describe, expect, it } from "vitest";
import { isIsoDate, parseDecimal, parseInteger } from "./parse";
import { fmtMinutes, fmtMoney, fmtPct, fmtQty } from "./format";

describe("Türkçe sayı girişi", () => {
  it("virgül ve nokta ayırıcılarını doğru okur", () => {
    expect(parseDecimal("12,5")).toBe(12.5);
    expect(parseDecimal("1.234,56")).toBe(1234.56);
    expect(parseDecimal("1,234.56")).toBe(1234.56);
    expect(parseDecimal("1234.56")).toBe(1234.56);
    expect(parseDecimal("1.000")).toBe(1000);
    expect(parseDecimal("₺ 250")).toBe(250);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("abc")).toBeNaN();
  });

  it("tam sayı kontrolü", () => {
    expect(parseInteger("100")).toBe(100);
    expect(parseInteger("1,5")).toBeNaN();
  });

  it("tarih doğrulama", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
  });
});

describe("Biçimlendirme", () => {
  it("para, yüzde, süre ve birim", () => {
    expect(fmtMoney(1234.5, "TRY")).toBe("₺1.234,50");
    expect(fmtMoney(-10, "USD")).toBe("−$10,00");
    expect(fmtPct(19.047, true)).toBe("+%19,05");
    expect(fmtMinutes(135)).toBe("2 sa 15 dk");
    expect(fmtMinutes(45)).toBe("45 dk");
    expect(fmtQty(2500, 1000, "kg")).toBe("2,5 kg");
  });
});
