// Arayüz uçtan uca senaryosu (Playwright). Yerel yığın + `npm run dev` çalışırken:
//   E2E_EMAIL=admin@heatemp.local E2E_PASSWORD=heatemp-yerel-123 npm run test:e2e
// Gereken: `playwright` paketi ve Chromium (npx playwright install chromium).
// Senaryo: kur → malzeme alışları → ürün + görsel + reçete → simülasyon →
// üretim (başlat/tamamla, ayrıca başlat/iptal) → 80 teslimat → 30 satış →
// fazla satış engeli → müşteri teklifi → satışa dönüştürme → Dashboard/Kasa.
// Her çalıştırma benzersiz kodlar kullanır; mevcut veriyi değiştirmez, yeni kayıt ekler.
const path = require("node:path");
const fs = require("node:fs");
const zlib = require("node:zlib");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const SHOTS = process.env.E2E_SHOTS ?? path.join(__dirname, "../../test-results/e2e");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "admin@heatemp.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "heatemp-yerel-123";
const RUN = Date.now().toString(36).slice(-4).toUpperCase();

function writePng(file) {
  const w = 64, h = 64;
  const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.from([0, ...Array(w).fill([234, 88, 12]).flat()])));
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const PNG = path.join(SHOTS, "urun.png");
  writePng(PNG);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("dialog", (d) => d.accept());
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const shot = async (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  const expectText = async (text, timeout = 15000) => {
    await page.getByText(text, { exact: false }).first().waitFor({ timeout });
  };
  const step = (s) => console.log("•", s);
  const selectByText = async (select, text) => {
    const value = await select.locator("option", { hasText: text }).first().getAttribute("value");
    await select.selectOption(value);
  };

  step("Giriş");
  await page.goto(BASE + "/giris");
  await page.getByLabel("E-posta").fill(EMAIL);
  await page.getByLabel("Şifre").fill(PASSWORD);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL(BASE + "/");
  await expectText("Ürün durumu");
  await shot("01-dashboard-bos");

  step("Manuel kur (otomatik kaynaklar bu ortamda erişilemez)");
  await page.goto(BASE + "/ayarlar");
  await page.getByLabel("USD/TRY *").fill("40");
  await page.getByRole("button", { name: "Manuel kuru kaydet" }).click();
  await expectText("Manuel kur kaydedildi");
  await shot("02-ayarlar");

  step("Malzemeler");
  await page.goto(BASE + "/hammadde");
  await page.getByRole("button", { name: "Yeni malzeme" }).click(); // form yan panelde
  await page.getByLabel("Malzeme kodu *").fill(`HAM-TEL-${RUN}`);
  await page.getByLabel("Malzeme adı *").fill("Rezistans teli");
  await page.getByLabel("Birim türü *").selectOption("mass");
  await page.getByLabel("Gösterim / giriş birimi *").selectOption("kg");
  await page.getByRole("button", { name: "Malzemeyi oluştur" }).click();
  await page.waitForURL(/\/hammadde\/[0-9a-f-]{36}$/);
  step("Tel alışı: 30 kg × 10 USD");
  await expectText("İşlem kuru (USD/TRY)");
  await page.getByText("tarihli").first().waitFor();
  await page.getByLabel("Miktar *").first().fill("30");
  await page.getByLabel("Birim fiyat (seçilen birim başına) *").fill("10");
  await page.getByRole("button", { name: "Alışı kaydet" }).click();
  await expectText("Alış kaydedildi");
  await shot("03-hammadde-tel");

  await page.goto(BASE + "/hammadde");
  await page.getByRole("button", { name: "Yeni malzeme" }).click();
  await page.getByLabel("Malzeme kodu *").fill(`KMP-TERM-${RUN}`);
  await page.getByLabel("Malzeme adı *").fill("Termostat");
  await page.locator("select[name=kind]").selectOption("component");
  await page.getByRole("button", { name: "Malzemeyi oluştur" }).click();
  await page.waitForURL(/\/hammadde\/[0-9a-f-]{36}$/);
  await page.getByText("tarihli").first().waitFor();
  await page.getByLabel("Miktar *").first().fill("200");
  await page.getByLabel("Birim fiyat (seçilen birim başına) *").fill("80");
  await page.getByLabel("Para birimi *").selectOption("TRY");
  await page.getByRole("button", { name: "Alışı kaydet" }).click();
  await expectText("Alış kaydedildi");

  await page.goto(BASE + "/hammadde");
  await shot("04-hammadde-liste");

  step("Ürün ve reçete");
  await page.goto(BASE + "/urunler");
  await page.getByRole("button", { name: "Yeni ürün" }).click(); // form yan panelde
  await page.getByLabel("Ürün kodu *").fill(`HP-500-${RUN}`);
  await page.getByLabel("Ürün adı *").fill(`Isıtıcı Panel 500 ${RUN}`);
  await page.getByLabel("Varsayılan satış fiyatı").fill("50");
  await page.getByLabel("Birim üretim süresi (dk) *").fill("12");
  await page.getByLabel("Kritik stok eşiği *").fill("5");
  await page.getByLabel("Minimum stok eşiği *").fill("10");
  await page.getByLabel("Hedef stok *").fill("40");
  await page.getByRole("button", { name: "Ürünü oluştur" }).click();
  await page.waitForURL(/\/urunler\/[0-9a-f-]{36}$/);
  step("Ürün görseli yükleme");
  await page.locator("input[type=file][name=image]").setInputFiles(PNG);
  await page.getByRole("button", { name: "Yükle" }).click();
  await expectText("Görsel yüklendi");
  await page.reload();
  const img = page.locator("img[alt^='Isıtıcı Panel']");
  await img.waitFor();
  const ok = await img.evaluate((el) => el.complete && el.naturalWidth > 0);
  if (!ok) throw new Error("Yüklenen görsel görüntülenemedi");
  await shot("04b-urun-gorsel");
  await page.getByRole("link", { name: "Standart" }).click();
  await page.waitForURL(/varyant/);
  await page.getByLabel("Malzeme *").selectOption({ label: `Rezistans teli (HAM-TEL-${RUN})` });
  await page.getByLabel("1 adet için miktar *").fill("250");
  await page.getByLabel("Birim *").selectOption("g");
  await page.getByRole("button", { name: "Reçeteye kaydet" }).click();
  await expectText("Reçete satırı kaydedildi");
  await page.getByLabel("Malzeme *").selectOption({ label: `Termostat (KMP-TERM-${RUN})` });
  await page.getByLabel("1 adet için miktar *").fill("1");
  await page.getByRole("button", { name: "Reçeteye kaydet" }).click();
  await expectText("Reçete satırı kaydedildi");
  await page.reload();
  await expectText("$4,50");
  await shot("05-varyant-bom");

  step("Simülasyon: 100 adet");
  const variantUrl = page.url();
  const variantId = variantUrl.split("/").pop();
  await page.goto(`${BASE}/simulasyon?varyant=${variantId}&adet=150`);
  await expectText("Yetersiz hammadde");
  await shot("06-simulasyon-eksik");
  await page.goto(`${BASE}/simulasyon?varyant=${variantId}&adet=100`);
  await expectText("Maksimum üretilebilir");
  await page.getByText("tarihli").first().waitFor();
  await shot("07-simulasyon-100");
  await page.getByRole("button", { name: "Üretimi Başlat" }).click();
  await page.waitForURL(/\/uretim\/[0-9a-f-]{36}$/);
  await expectText("Üretimde");
  await shot("08-parti-uretimde");
  await page.getByRole("button", { name: /Tamamla/ }).click();
  await expectText("Parti tamamlandı");
  await shot("09-parti-tamamlandi");

  step("İptal akışı: 10 adet başlat → iptal → malzeme iadesi");
  await page.goto(`${BASE}/simulasyon?varyant=${variantId}&adet=10`);
  await page.getByText("tarihli").first().waitFor();
  await page.getByRole("button", { name: "Üretimi Başlat" }).click();
  await page.waitForURL(/\/uretim\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "İptal et", exact: true }).click(); // iptal formu pencerede
  await page.getByLabel("İptal gerekçesi").fill("Test iptali");
  await page.getByRole("button", { name: "Partiyi iptal et" }).click();
  await expectText("Parti iptal edildi");
  await page.reload();
  await expectText("İade edildi");
  await shot("09b-parti-iptal");
  await page.goto(`${BASE}/simulasyon?varyant=${variantId}&adet=1`);
  await expectText("20 adet"); // tel: 5 kg kaldı → 20 adet (iade sonrası yine 20)

  step("Heatemp → Mekonsis teslimat: 80");
  await page.goto(BASE + "/rafim");
  await page.getByRole("button", { name: "Yeni teslimat" }).click(); // teslimat formu yan panelde
  await selectByText(page.locator("select[name=variant_id]").first(), RUN);
  await page.getByLabel(/Adet \* \(en fazla/).fill("80");
  await page.getByRole("button", { name: "Mekonsis'e teslim et" }).click();
  await expectText("Teslimat kaydedildi");
  await page.reload();
  await shot("10-rafim");
  await page.goto(BASE + "/mekonsis");
  await shot("11-mekonsis");
  await page.goto(BASE + "/");
  await shot("12-dashboard-teslimat-sonrasi");

  step("Satış: 30 × 50 USD");
  await page.goto(BASE + "/satislar/yeni");
  await page.getByText("tarihli").first().waitFor();
  await selectByText(page.getByLabel("Varyant"), RUN);
  await page.getByLabel("Adet").fill("30");
  await page.getByLabel(/Gerçek birim fiyat/).fill("50");
  await shot("13-satis-form");
  await page.getByRole("button", { name: "Satışı kaydet" }).click();
  await page.waitForURL(/\/satislar\/[0-9a-f-]{36}$/);
  await expectText("Gerçekleşmiş brüt kâr");
  await shot("14-satis-detay");

  step("Fazla satış denemesi (51 > 50)");
  await page.goto(BASE + "/satislar/yeni");
  await page.getByText("tarihli").first().waitFor();
  await selectByText(page.getByLabel("Varyant"), RUN);
  await page.getByLabel("Adet").fill("51");
  await page.getByLabel(/Gerçek birim fiyat/).fill("50");
  await expectText("Mekonsis rafında yalnızca 50 adet var");
  await shot("15-satis-fazla");

  step("Müşteri + teklif + satışa dönüştür");
  await page.goto(BASE + "/musteriler");
  await page.getByRole("button", { name: "Müşteri ekle" }).click(); // form yan panelde
  await page.getByLabel("Firma adı *").fill(`Örnek Yapı A.Ş. ${RUN}`);
  await page.getByLabel("Yetkili kişi").fill("Ayşe Yılmaz");
  await page.getByRole("button", { name: "Müşteriyi ekle" }).click();
  await page.waitForURL(/\/musteriler\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Teklif oluştur" }).click();
  await page.waitForURL(/\/musteriler\/teklif\//);
  await selectByText(page.getByLabel("Varyant *"), RUN);
  await page.getByLabel("Adet *").fill("20");
  await page.getByLabel(/Özel birim fiyat/).fill("45");
  await page.getByRole("button", { name: "Kalemi kaydet" }).click();
  await expectText("Teklif kalemi kaydedildi");
  await page.reload();
  await expectText("Tahmini brüt kâr");
  await shot("16-teklif");
  await page.getByText("tarihli").first().waitFor();
  await page.getByRole("button", { name: "Satışa Dönüştür" }).click();
  await page.waitForURL(/\/satislar\/[0-9a-f-]{36}$/);
  await expectText("Kaynak teklif");
  await shot("17-tekliften-satis");

  step("Dashboard ve Kasa");
  await page.goto(BASE + "/");
  await shot("18-dashboard-son");
  await page.goto(BASE + "/kasa");
  await shot("19-kasa");
  await page.goto(BASE + "/uretim");
  await shot("20-uretim-liste");
  await page.goto(BASE + "/satislar");
  await shot("21-satislar");
  await page.goto(BASE + "/teslimatlar");
  await page.getByRole("heading", { level: 1, name: /Teslimatlar/ }).waitFor();
  await shot("22-teslimatlar");

  console.log(errors.length ? "Sayfa hataları:\n" + errors.join("\n") : "Sayfa hatası yok.");
  await browser.close();
}

main().catch(async (e) => {
  console.error("HATA:", e.message);
  process.exit(1);
});
