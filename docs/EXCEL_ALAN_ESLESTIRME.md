# Excel alan eşleştirme notu

## Durum

`Mekonsis_Heatamp_Stok_Takip (1).xlsx` ve `Heatemp_Mekonsis_ERP_Yol_Haritasi.pdf` bu çalışma sırasında
depoda veya çalışma ortamında **bulunamadı**; bu yüzden Excel'in gerçek sayfa/sütun adları ve ürün listesi
incelenemedi. Tahmini sütun adı veya ürün uydurulmadı.

Yerine şunlar hazırlandı:

1. `scripts/excel-incele.ts` — Excel'i **salt okunur** açar, her sayfanın başlık satırını bulur, sütunları,
   değer türlerini ve örnek değerleri listeler, başlıkları aşağıdaki hedef alanlara sezgisel olarak eşler ve
   benzersiz ürün satırlarını çıkarır. Sonucu `docs/excel-inceleme-sonucu.md` dosyasına yazar.
   Veritabanına bağlanmaz, hiçbir kayıt oluşturmaz.
2. Aşağıdaki hedef alan sözlüğü ve aktarım ilkeleri.

```bash
# Dosyayı referans/ klasörüne koyun (klasör içeriği git'e eklenmez)
npm run excel:incele -- "referans/Mekonsis_Heatamp_Stok_Takip (1).xlsx"
```

Rapordaki "Önerilen hedef alan" sütunu yalnızca başlık adına dayalı bir tahmindir; her satır elle doğrulanmalıdır.

## Hedef alan sözlüğü

| Varlık | Alan | Zorunlu | Not |
|---|---|---|---|
| Ürün (`products`) | Kod, ad | Evet | Kod benzersiz |
| | Detay/açıklama, görsel | Hayır | |
| | Varsayılan satış fiyatı + para birimi (USD/TRY) | Hayır | |
| | Birim üretim süresi (dk) | Evet (0 olabilir) | Simülasyon süre tahmini |
| | Kritik / minimum / hedef stok | Evet (0 olabilir) | kritik ≤ minimum ≤ hedef |
| Varyant (`product_variants`) | Kod, ad/detay (ör. "2000 W, 220 V") | Evet | Ürün başına en az bir varyant ("Standart") |
| | Fiyat, süre, eşikler | Hayır | Boşsa ürün varsayılanı kullanılır |
| Hammadde/komponent (`raw_materials`) | Kod, ad, tür (hammadde/komponent), birim türü, gösterim birimi | Evet | Birim türü sonradan (hareket varsa) değişmez |
| Alış (`receive_material`) | Miktar + birim, birim fiyat, para birimi, alış tarihi | Evet | O günün kuru gerekir; tedarikçi opsiyonel |
| Reçete (`bom_items`) | Varyant, malzeme, 1 adet için miktar + birim | Evet | Temel birime çevrilir |
| Açılış stoğu (`record_opening_stock`) | Varyant, adet, gerçek birim maliyet + para birimi, sayım tarihi, açıklama | Evet | Sistem öncesi mamul için |
| Teslimat | Varyant, adet, tarih, (parti) | Evet | Mekonsis'teki mevcut stok için açılıştan sonra |
| Satış | Tarih, varyant, adet, gerçek birim fiyat, para birimi | Evet | Satış günü kuru gerekir; müşteri opsiyonel |
| Kurumsal müşteri | Firma adı | Evet | Vergi no, yetkili, telefon, e-posta, adres opsiyonel |

## Tipik stok takip sütunlarının karşılığı

Excel doğrulandığında aşağıdaki kavramsal eşleştirme kullanılabilir:

| Excel'de beklenebilecek kavram | Yeni sistemdeki karşılığı | Dikkat |
|---|---|---|
| Ürün kodu / adı / model | `products.code/name`, `product_variants.name` | Aynı ürünün modelleri → varyant |
| Satış fiyatı | Ürün/varyant varsayılan fiyatı | Gerçek satış fiyatı her satışta ayrıca girilir |
| Heatemp'te / depoda kalan | Açılış stoğu (Heatemp rafı) | Birim maliyet bilinmeli |
| Mekonsis'te kalan | Açılış stoğu + aynı tarihli teslimat | Mekonsis'teki ürün Heatemp varlığıdır |
| Satılan adet (toplam) | Geçmiş satışlar tek tek girilirse ciroya dahil olur | Tarih, fiyat ve o günün kuru olmadan ciro/kâr hesaplanamaz; yalnızca adet varsa geçmiş satış olarak girilmemeli |
| Hammadde listesi / miktar | `raw_materials` + açılış alışı | Maliyet ve alış tarihi olmadan değerleme yapılamaz |
| Birim (kg, g, m, adet) | Birim türü + gösterim birimi | kg → gram gibi normalizasyon otomatik |
| Maliyet | Açılış stoğu birim maliyeti / alış birim fiyatı | Para birimi ve tarih belirtilmeli |

## Aktarım ilkeleri

- **Sessiz aktarım yok.** Canlı veritabanı yalnızca yöneticinin açık işlemiyle (ekranlardan veya ayrıca
  onaylanmış bir içe aktarma betiğiyle) değişir. Bu teslimatta içe aktarma betiği yoktur.
- Her tutar para birimi ve işlem günü kuruyla girilir; kur yoksa manuel kur gerekir.
- Maliyeti bilinmeyen stok "0 maliyetli" girilmez; önce maliyet belirlenir.
- Excel'deki örnek/deneme satırları gerçek veri gibi aktarılmaz.
