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
| Satış Fiyatları | Ürün tipi, maliyet (USD), satış (USD) | Satış → `default_sale_price` (USD) / varyant fiyatı | Yalnızca kesin eşleşen 6 satış fiyatı aktarılır; maliyet yalnızca `stok-onay.xlsx`'te aday |
| Satış Fiyatları (simülasyonlar, 3'e bölüşüm, Mekonsis referansları) | Senaryo ve referans rakamlar | — | Aktarılmaz |
| Ürün Maliyet | Ürün tipine göre TL/USD maliyet dökümleri | (hammadde/BOM için yetersiz) | Aktarılmaz; toplamlar `stok-onay.xlsx`'te 2. aday |

## Ürün / varyant modeli

- Excel **ürün kodu = ERP varyant kodu** (aynen korunur).
- Ürün (grup) kodu, SKU'dan sensör elemanı çıkarılarak türetilir:
  `HT-NTC10K-K-50mm` → ürün `HT-K-50mm` "Kablo Tipi Sıcaklık Sensörü - 50mm", varyant "NTC10K".
  Mahal tipi `HT-MT-M`/`HT-MT-P`, su kaçak `HT-SKS`, çoklama kartı `HT-FCM`, kovan `HT-KV`.
- Kalıba uymayan kodlar (Redüksiyonlar) kendi kodlarıyla tek varyantlı ürün olur.
- Sonuç: 19 ürün, 51 varyant (49 katalog kodu + katalogda olmayan 2 Redüksiyon).

## Aktarım adımları

1. **Katalog** (`katalog-aktarim.sql`): ürün, varyant, kesin eşleşen satış fiyatları (HT-MT-M 8, HT-MT-P 10,
   HT-KT-150mm 10, HT-K-150mm 12, HT-SKS 50 USD; HT-KV15 varyantı 8 USD) ve stok eşikleri (50/150/150).
   Kur, maliyet veya yönetici kimliği gerektirmez; stok defterine dokunmaz. Var olan kod atlanır, değiştirilmez.
2. **Stok** (`stok-aktarim.sql`): Excel yalnızca Mekonsis rafını izler (kalan = teslim − satış). Satışların fiyatı
   ve teslim edilen partilerin maliyeti bilinmediği için geçmiş hareketler yeniden oynatılmaz. Pozitif kalan,
   stok tarihinde **açılış stoğu + aynı gün Mekonsis teslimatı** olarak bir kez girilir; yalnızca birim maliyeti
   `stok-onay.xlsx`'te açıkça onaylanan kodlar için.
   - Açılış stoğu üretim sayılmaz (üretilen adet ve üretim harcaması artmaz); teslimat satış değildir.
   - Negatif kalanlar (HT-SKS-S1, HT-SKS-N1) ve fiyat eşleşmesi belirsiz ürünler (HT-FCM) maliyet girilse bile
     netleştirilene kadar hariçtir.
   - Kur: üretici stok tarihinin TCMB arşiv bültenini indirir (`/kurlar/YYYYAA/GGAAYYYY.xml`); hafta sonu/tatilse
     geriye giderek son yayımlanan bülteni alır ve bülten tarihiyle kaydeder (`record_auto_fx_rate`, kaynak TCMB).
     `today.xml` geçmiş tarih için hiç istenmez. Bülten, Ayarlar'daki kur yaşı sınırından eskiyse SQL açık bir
     hatayla durur. Veritabanında aynı gün için farklı bir TCMB kuru varsa da durur.

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
npm run excel:aktarim -- --excel "referans/Mekonsis_Heatamp_Stok_Takip (1).xlsx"
# → katalog-aktarim-kuru.sql, sonra katalog-aktarim.sql (Supabase SQL Editor)
# stok-onay.xlsx'te ONAYLANAN birim maliyet / para birimi sütunlarını doldurun, sonra:
npm run excel:aktarim -- --excel "referans/Mekonsis_Heatamp_Stok_Takip (1).xlsx" --stok-tarihi YYYY-AA-GG
# → stok-aktarim-kuru.sql, sonra stok-aktarim.sql
bash scripts/excel-aktarim-test.sh     # yerel temiz veritabanında uçtan uca test (sahte TCMB arşiviyle)
```

Yeniden üretimde `stok-onay.xlsx`'teki onaylar korunur; Excel'deki kalan değişmişse üretici durur ve o satırın
gözden geçirilmesini ister. Her SQL dosyası tek transaction'dır, tekrar çalıştırılabilir, mevcut kayıtları silmez.
