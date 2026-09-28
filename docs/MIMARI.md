# Heatemp ERP — Mimari not

## 1. Depo analizi ve teknoloji seçimi

Başlangıçta depo boştu (yalnızca `README.md`). Görevde istenen varsayılan yığın kuruldu:

| Katman | Seçim |
|---|---|
| Arayüz | Next.js 16 (App Router, Server Components, Server Actions), TypeScript, Tailwind CSS 4 |
| Veri / kimlik | Supabase: Postgres 15, Auth (GoTrue), PostgREST, Storage |
| İş kuralları | Postgres fonksiyonları (RPC, `SECURITY DEFINER`, tek transaction) |
| Grafik | Recharts (yalnızca Dashboard satış/ciro grafiği) |
| Test | Vitest (birim + gerçek Postgres üzerinde DB testleri), Playwright (arayüz senaryosu) |

Referans PDF (`Heatemp_Mekonsis_ERP_Yol_Haritasi.pdf`) ve Excel dosyası depoda ve çalışma ortamında
bulunmadığı için mimari, görev metnindeki kurallara göre kuruldu. Excel için bkz. `EXCEL_ALAN_ESLESTIRME.md`.

## 2. İş modeli → veri modeli

```
Hammadde alışı ──► material_movements (purchase) ──► material_balances (miktar, TL değer, USD değer)
                                                          │  hareketli ağırlıklı ortalama
Üretimi başlat ──► production_batches (Üretimde) ◄────────┘  production_consumptions (birim maliyet sabitlenir)
Tamamla ─────────► stock_layers [heatemp] (parti katmanı) + stock_movements (production_in)
Teslimat ────────► deliveries + stock_layers [mekonsis] (parti kimliği korunur)   ← satış DEĞİL
Mekonsis satışı ─► sales / sale_items / sale_allocations (FIFO) + stock_movements (sale_out)
Teklif ──────────► quotes / quote_items  ──(Satışa Dönüştür: aynı satış çekirdeği, bir kez)──► sales
```

| Tablo | Amaç |
|---|---|
| `app_users` | Supabase Auth kullanıcısının uygulama rolü (`admin` / `viewer`) |
| `app_settings` | Kur kaynağı, kur türü, kurun en fazla yaşı, gösterim ayarları (tek satır) |
| `units` | Ölçü birimleri ve temel birime çevrim katsayısı (kg→g, cm→m …) |
| `fx_rates` | USD/TRY kurları: değer, geçerli olduğu gün, kaynak (TCMB/FRANKFURTER/MANUAL), alınma zamanı |
| `products`, `product_variants` | Ürün varsayılanları + varyant bazında geçersiz kılma (fiyat, süre, eşikler) |
| `raw_materials`, `material_balances`, `material_movements` | Hammadde/komponent tanımı, bakiye, hareket defteri |
| `bom_items` | Varyant başına 1 adetlik reçete (temel birimde) |
| `production_batches`, `production_consumptions` | Parti (otomatik benzersiz no), tüketim ve sabitlenmiş maliyetler |
| `stock_layers`, `stock_movements` | Mamul parti katmanları (Heatemp / Mekonsis) ve hareket defteri |
| `deliveries` | Mekonsis'e teslimat başlığı |
| `sales`, `sale_items`, `sale_allocations` | Satış, kalemler, FIFO tahsisleri (parti + teslimat) |
| `customers`, `quotes`, `quote_items` | Kurumsal müşteri ve toplu satış teklifi |

Görünümler (`security_invoker`, RLS'e tabi): `v_variants`, `v_materials`, `v_batches`, `v_heatemp_shelf`,
`v_mekonsis_shelf`, `v_deliveries`, `v_sales`, `v_sale_items`, `v_sale_allocations`, `v_quotes`,
`v_variant_overview`, `v_financial_summary`, `v_sales_daily`, `v_sales_monthly`.

## 3. Stok ve değerleme kuralları

- **Bakiyeler elle değiştirilemez.** Hammadde bakiyesi (`material_balances`) ve mamul katmanları
  (`stock_layers.qty_out`) yalnızca işlem fonksiyonları içinde, hareket kaydıyla aynı transaction'da güncellenir.
  `ledger_inconsistencies()` bakiye ile hareket toplamlarını karşılaştırır (testlerde boş döner).
- **Birim normalizasyonu:** Her malzemenin bir birim türü vardır (adet, ağırlık, uzunluk, alan, hacim).
  Stok ve reçete miktarları o türün temel biriminde saklanır (g, m, m², ml, adet). Kilogramla alınan tel,
  gram cinsinden reçeteyle doğrudan karşılaştırılır. Uyumsuz birim veritabanında reddedilir.
- **Hammadde değerleme: hareketli ağırlıklı ortalama.** Her alış kendi günündeki kurla hem TL hem USD
  değer olarak bakiyeye eklenir; çıkışlar ortalama maliyetle yapılır. İki para birimi paralel izlenir,
  böylece TL tarihsel değeri ve tutarlı USD maliyeti birlikte bilinir.
- **Parti maliyeti:** Üretim başlatıldığında her malzemenin o anki ortalama birim maliyeti (TL ve USD)
  ve işlem kuru partiye sabitlenir. Simülasyon tahmindir; parti kayıtlı gerçek maliyettir.
- **İptal:** Yalnızca "Üretimde" parti iptal edilir; tüketilen malzeme tüketildiği maliyetle tam bir kez
  iade edilir (`return_movement_id` benzersiz + durum kilidi).
- **Mamul FIFO:** Tamamlanan parti Heatemp rafında tek katmandır. Teslimat Heatemp katmanlarından
  (tamamlanma sırası veya seçilen parti) düşer ve Mekonsis'te parti kimliğini koruyan katmanlar oluşturur.
  Satış, Mekonsis katmanlarını teslimat tarihi + oluşturulma sırası (`fifo_seq`) ile tüketir.
  Satış tarihinden sonra teslim edilmiş ürün o satışta kullanılamaz.
- **Açılış stoğu:** Sistem öncesi üretilmiş mamul, gerçek birim maliyetiyle ve açıklamayla `kind = 'opening'`
  parti olarak girilebilir. Hammadde tüketmez, "üretilen" ve "üretime harcanan" toplamlarına ve maliyet
  karşılaştırmasına katılmaz. Otomatik aktarım yoktur.

## 4. Para birimi ve kur

- **Temel: TRY işlem günü değeri.** Finansal toplamlar farklı para birimlerini doğrudan toplamaz.
  - Satış geliri: satış günündeki kurla TL'ye çevrilir (`sales.fx_rate` sabitlenir).
  - Üretim maliyeti: tüketilen malzemelerin üretim anındaki ortalama maliyeti; bu ortalama, her alışın
    kendi günündeki kurla TL'ye çevrilmiş tarihsel değerlerinden oluşur (tarihsel maliyet ilkesi).
  - Brüt kâr = satış günü TL geliri − FIFO ile tahsis edilen partilerin kayıtlı TL maliyeti.
  - USD tutarlar yalnızca bilgi amaçlıdır ve arayüzde öyle etiketlenir.
- **Parti karşılaştırması:** Aynı varyantın ardışık iki tamamlanmış (gerçek üretim) partisinin USD birim
  maliyetiyle yüzde hesaplanır; TL tarihsel değer ayrıca gösterilir. Önceki parti yoksa yüzde gösterilmez.
- **Kaynak:** Sunucu, TCMB `today.xml` / arşiv XML'inden (döviz alış veya satış, ayarlanabilir) kur alır;
  erişilemezse ECB referans kuru (Frankfurter) denenir. Hafta sonu/tatilde en yakın önceki bülten kullanılır.
  Kur, kaynak, geçerli gün ve alınma zamanıyla `fx_rates` tablosuna **yalnızca service role ile** yazılır.
- **Geçerlilik:** Her işlem bir `fx_rates` kaydına bağlanır. Kurun tarihi işlem tarihinden sonra olamaz ve
  `fx_max_age_days` günden (varsayılan 4) eski olamaz. Otomatik kur yoksa son geçerli kur tarihiyle gösterilir;
  işlem kaydı engellenir ve yöneticiden manuel kur istenir. Hiçbir yerde sabit/uydurma kur kullanılmaz.
- Geçmiş kayıtlar yeni kurla yeniden yazılmaz: kur değeri her işleme kopyalanır.

## 5. Güvenlik ve güvenilirlik

- **Kimlik:** Supabase Auth (e-posta/şifre). `proxy.ts` oturumu yeniler ve girişsiz isteği `/giris`'e yönlendirir.
  Auth hesabı tek başına yetki vermez; kullanıcı `app_users` tablosunda olmalıdır.
- **RLS:** Tüm tablolarda açık. Okuma: uygulama üyeleri. Ana veri (ürün, varyant, reçete, malzeme tanımı,
  müşteri, teklif) yazma: yalnızca `admin`. Defter/bakiye/parti/satış tabloları için `authenticated` rolünün
  INSERT/UPDATE/DELETE yetkisi tamamen kaldırılmıştır; yazma yalnızca işlem fonksiyonlarıyla yapılır.
  `anon` rolü hiçbir tabloya ve fonksiyona erişemez.
- **İşlem fonksiyonları** (`start_production`, `complete_production`, `cancel_production`,
  `deliver_to_mekonsis`, `cancel_delivery`, `record_sale`, `cancel_sale`, `convert_quote_to_sale`,
  `receive_material`, `write_off_material`, `record_opening_stock`): tek transaction, başta yönetici kontrolü.
  - Eş zamanlılık: hammadde bakiyeleri `SELECT … FOR UPDATE` ile sabit sırada kilitlenir; mamul işlemleri
    varyant başına danışma kilidi (`pg_advisory_xact_lock`) + katman satır kilidiyle sıraya girer.
    Son savunma: `qty_out <= qty_in` ve `qty >= 0` kısıtları.
  - İdempotency: formlar her gönderimde bir `request_id` üretir; aynı kimlikle gelen tekrar istek aynı kaydı
    döndürür (danışma kilidi + benzersiz indeks). Teklif dönüştürme ikinci kez satış oluşturmaz.
  - Durum geçişleri tetikleyiciyle korunur (Üretimde → Tamamlandı | İptal; kapanmış parti/satış/teklif değişmez).
- Service role anahtarı yalnızca sunucuda, yalnızca otomatik kur kaydı için okunur; `NEXT_PUBLIC_` öneki yoktur.
- Ürün görselleri özel Storage kovasındadır; `/urun-gorseli/...` rotası oturum sahibinin yetkisiyle okur.

## 6. Raporlama

Dashboard ve Kasa aynı `v_variant_overview` / `v_financial_summary` görünümlerinden beslenir. Kasa bir
**finansal özettir, nakit bakiyesi değildir.** Mutabakat özdeşliği ekranda gösterilir ve testte doğrulanır:

```
üretime harcanan + açılış stoğu = satılan ürün maliyeti (FIFO) + Heatemp mamul değeri + Mekonsis mamul değeri + üretimdeki partiler
```

## 7. Bilinçli kararlar / sınırlar

- Tarihsel maliyet: USD ile alınmış malzemenin TL maliyeti alış günündeki kurla sabitlenir; üretim ve satış
  arasındaki kur farkı brüt kâra yansır. Üretim günü kuruyla yeniden değerleme istenirse bu karar değiştirilmelidir.
- Teslimat parçalı iade (Mekonsis'ten Heatemp'e kısmi geri dönüş) yoktur; yalnızca hiç satılmamış teslimat
  tamamen geri alınabilir. Satış iptali tahsisleri aynı katmanlara geri verir.
- Banka, tahsilat, cari, e-fatura, satın alma siparişi modülleri kapsam dışıdır.
