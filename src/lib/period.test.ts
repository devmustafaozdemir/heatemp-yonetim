import { describe, expect, it } from "vitest";
import { buckets, resolvePeriod } from "./period";
import { fmtCompactMoney, pctChange } from "./format";

describe("dönem seçimi", () => {
  it("son 30 gün ve önceki eşit uzunlukta dönem", () => {
    const p = resolvePeriod({}, "2026-09-29");
    expect([p.from, p.to, p.days, p.prevFrom, p.prevTo, p.granularity]).toEqual([
      "2026-08-31", "2026-09-29", 30, "2026-08-01", "2026-08-30", "gunluk",
    ]);
  });
  it("geçen ay tam ay; önceki dönem aynı gün sayısı", () => {
    const p = resolvePeriod({ donem: "gecen-ay" }, "2026-09-29");
    expect([p.from, p.to, p.days, p.prevTo]).toEqual(["2026-08-01", "2026-08-31", 31, "2026-07-31"]);
  });
  it("özel aralık doğrulanır; geçersizse varsayılana döner, gelecek bugünle sınırlanır", () => {
    expect(resolvePeriod({ donem: "ozel", bas: "2026-09-01", bit: "2026-12-01" }, "2026-09-29").to).toBe("2026-09-29");
    expect(resolvePeriod({ donem: "ozel", bas: "x", bit: "2026-09-10" }, "2026-09-29").key).toBe("30g");
  });
  it("uzun dönemde aylık görünüm, istenirse günlük", () => {
    expect(resolvePeriod({ donem: "12a" }, "2026-09-29").granularity).toBe("aylik");
    expect(resolvePeriod({ donem: "12a", gorunum: "gunluk" }, "2026-09-29").granularity).toBe("gunluk");
  });
  it("gün ve ay kovaları", () => {
    expect(buckets("2026-09-28", "2026-10-01", "gunluk")).toHaveLength(4);
    expect(buckets("2026-01-15", "2026-03-02", "aylik")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
});

describe("biçim", () => {
  it("önceki değer 0 ise yüzde uydurulmaz", () => {
    expect(pctChange(100, 0)).toBeNull();
    expect(pctChange(150, 100)).toBe(50);
  });
  it("kısa tutar", () => {
    expect(fmtCompactMoney(905364, "TRY")).toBe("₺905 bin");
    expect(fmtCompactMoney(1250000, "TRY")).toBe("₺1,3 mn");
  });
});
