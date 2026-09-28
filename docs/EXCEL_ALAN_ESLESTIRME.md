# Excel alan eşleştirme notu — `Mekonsis_Heatamp_Stok_Takip (1).xlsx`

Dosya 6 sayfadan oluşur. Aktarım paketi `scripts/excel-aktarim.ts` ile **salt okunur** üretilir; ayrıntılı
rapor, sayılar ve SQL `import/excel-aktarim/` altındadır (git dışında, gerçek ticari veri içerir).

## Sayfa → ERP eşleştirmesi

| Sayfa | Alanlar | ERP karşılığı | Karar |
|---|---|---|---|
| Ürünler | Ürün grubu başlıkları, ürün kodları (49) | `products`, `product_variants` | Aktarılır |
| Stok Özeti | Ürün adı, kod, toplam giren (Mekonsis rafı), satış, kalan, durum eşikleri | Eşikler → `critical/min/target_stock`; kalan → doğrulama | Eşikler aktarılır; toplamlar detaydan yeniden hesaplanıp karşılaştırılır |
| Teslimat Detayı | Ürün, kod, teslim tarihi, adet | (Mekonsis'e teslimat geçmişi) | Stok defterine tek tek girmez; net kalan hesabında kullanılır, CSV arşivi |
| Satış Detayı | Ürün, kod, satış tarihi, adet, fatura no | (Mekonsis satış geçmişi) | **Fiyat yok** → satış/ciro olarak girmez; net kalan hesabında kullanılır, CSV arşivi |
| Satış Fiyatları | Ürün tipi, maliyet (USD), satış (USD) | Satış → `default_sale_price` (USD) / varyant fiyatı | Satış fiyatları aktarılır; maliyet yalnızca açılış maliyeti adayıdır |
| Satış Fiyatları (simülasyonlar, 3'e bölüşüm, Mekonsis referansları) | Senaryo ve referans rakamlar | — | Aktarılmaz |
| Ürün Maliyet | Ürün tipine göre TL/USD maliyet dökümleri | (hammadde/BOM için yetersiz) | Aktarılmaz; raporda listelenir |

## Ürün / varyant modeli

- Excel **ürün kodu = ERP varyant kodu** (aynen korunur).
- Ürün (grup) kodu, SKU'dan sensör elemanı çıkarılarak türetilir:
  `HT-NTC10K-K-50mm` → ürün `HT-K-50mm` "Kablo Tipi Sıcaklık Sensörü - 50mm", varyant "NTC10K".
  Mahal tipi `HT-MT-M`/`HT-MT-P`, su kaçak `HT-SKS`, çoklama kartı `HT-FCM`, kovan `HT-KV`.
- Kalıba uymayan kodlar (Redüksiyonlar) kendi kodlarıyla tek varyantlı ürün olur.
- Sonuç: 19 ürün, 51 varyant (49 katalog kodu + katalogda olmayan 2 Redüksiyon).

## Stok aktarım yöntemi

Excel yalnızca Mekonsis rafını izler (kalan = teslim − satış). Satışların fiyatı ve teslim edilen partilerin
maliyeti bilinmediği için geçmiş hareketler yeniden oynatılmaz. Pozitif kalan, seçilen stok tarihinde
**açılış stoğu + aynı gün Mekonsis teslimatı** olarak bir kez girilir; yalnızca birim maliyeti `onay.json`'da
açıkça onaylanan kodlar için. Negatif kalanlar (satılan > teslim edilen) aktarılmaz.

## Bilinen eksik ve çelişkiler (özet)

- Birim üretim süresi, reçete (malzeme miktarı/birimi), hammadde stoğu, Heatemp'in kendi raf stoğu yok.
- Geçmiş satışlarda birim fiyat yok.
- `HT-SKS-S1` ve `HT-SKS-N1`: satılan teslim edilenden fazla, ilk satış ilk teslimattan önce.
- Paslanmaz Mahal maliyet dökümünde bir kalem 600 yerine ≈300 adede bölünmüş (birim toplam etkileniyor).
- Plastik Mahal (1,82 / 2,45 USD), Çoklama Kartı (14,57 / 15 USD), Termostat (9,2 / 9,5 USD) maliyetleri iki sayfada farklı.
- Kanal 150mm ve Plastik Mahal maliyet dökümleri PT1000 içeriyor; stoktaki varyantlar NTC10K/NTC20K.
- "Çoklama Kartı (3 Role)" fiyatının HT-FCM2 mi HT-FCM4 mü olduğu belirsiz; "Sıva Üstü Termostat"ın kodu yok.
- "D" kodlu sensör serisinin (HT-…-D-…) adı dosyada açıklanmamış.

## Kullanım

```bash
# Excel'i referans/ klasörüne koyun (git'e eklenmez)
npm run excel:aktarim -- --excel "referans/Mekonsis_Heatamp_Stok_Takip (1).xlsx" --stok-tarihi 2026-09-28
# import/excel-aktarim/RAPOR.md'yi inceleyin, onay.json'da onaylanan maliyetleri doldurun ve yeniden üretin
bash scripts/excel-aktarim-test.sh     # yerel temiz veritabanında uçtan uca test
```

Uzak veritabanında önce `aktarim-kuru.sql` (değişiklik kaydetmez), ardından `aktarim.sql` çalıştırılır.
Her iki dosya tek transaction'dır, tekrar çalıştırılabilir, mevcut kayıtları silmez veya değiştirmez.
