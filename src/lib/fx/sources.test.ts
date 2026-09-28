import { describe, expect, it } from "vitest";
import { fetchTcmb, parseFrankfurter, parseTcmbXml, tcmbUrl } from "./sources";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="25.09.2026" Date="09/25/2026"  Bulten_No="2026/184" >
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
    <Unit>1</Unit>
    <Isim>ABD DOLARI</Isim>
    <CurrencyName>US DOLLAR</CurrencyName>
    <ForexBuying>41.2345</ForexBuying>
    <ForexSelling>41.3088</ForexSelling>
    <BanknoteBuying>41.2056</BanknoteBuying>
    <BanknoteSelling>41.3708</BanknoteSelling>
  </Currency>
  <Currency CrossOrder="9" Kod="JPY" CurrencyCode="JPY">
    <Unit>100</Unit>
    <ForexBuying>27.5</ForexBuying>
    <ForexSelling>27.7</ForexSelling>
  </Currency>
</Tarih_Date>`;

describe("TCMB ayrıştırma", () => {
  it("USD döviz alış/satış ve bülten tarihini okur", () => {
    const buying = parseTcmbXml(SAMPLE, "ForexBuying");
    expect(buying).toMatchObject({ source: "TCMB", rate: 41.2345, rateDate: "2026-09-25", rateType: "ForexBuying" });
    expect(parseTcmbXml(SAMPLE, "ForexSelling").rate).toBe(41.3088);
  });

  it("USD yoksa açık hata verir", () => {
    expect(() => parseTcmbXml(SAMPLE.replace(/USD/g, "EUR"), "ForexBuying")).toThrow(/USD kuru bulunamadı/);
  });

  it("arşiv URL'sini doğru kurar", () => {
    expect(tcmbUrl("2026-09-05")).toBe("https://www.tcmb.gov.tr/kurlar/202609/05092026.xml");
    expect(tcmbUrl(null)).toBe("https://www.tcmb.gov.tr/kurlar/today.xml");
    expect(tcmbUrl("2026-09-05", "http://127.0.0.1:9/kurlar")).toBe("http://127.0.0.1:9/kurlar/202609/05092026.xml");
  });

  it("tarih verilince bugünün bültenini istemez; farklı kaynak adresi kullanılabilir", async () => {
    const calls: string[] = [];
    const fetcher = async (url: string) => {
      calls.push(url);
      return url.endsWith("25092026.xml") ? new Response(SAMPLE, { status: 200 }) : new Response("", { status: 404 });
    };
    await fetchTcmb("2026-09-25", "ForexBuying", { fetcher, baseUrl: "http://yerel/kurlar" });
    expect(calls).toEqual(["http://yerel/kurlar/202609/25092026.xml"]);
  });

  it("hafta sonu için önceki iş gününe gider", async () => {
    const calls: string[] = [];
    const fetcher = async (url: string) => {
      calls.push(url);
      if (url.endsWith("25092026.xml")) return new Response(SAMPLE, { status: 200 });
      return new Response("not found", { status: 404 });
    };
    const r = await fetchTcmb("2026-09-27", "ForexBuying", { fetcher });
    expect(r.rateDate).toBe("2026-09-25");
    expect(calls).toHaveLength(3); // Pazar, Cumartesi, Cuma
  });

  it("servis hatasında geri gitmez, hatayı iletir", async () => {
    const fetcher = async () => new Response("err", { status: 503 });
    await expect(fetchTcmb("2026-09-27", "ForexBuying", { fetcher })).rejects.toThrow(/503/);
  });
});

describe("Frankfurter ayrıştırma", () => {
  it("ECB referans kurunu okur", () => {
    expect(parseFrankfurter({ amount: 1, base: "USD", date: "2026-09-25", rates: { TRY: 41.1 } })).toMatchObject({
      source: "FRANKFURTER",
      rate: 41.1,
      rateDate: "2026-09-25",
    });
    expect(() => parseFrankfurter({ rates: {} })).toThrow();
  });
});
