# Heatemp Yönetim

Heatemp için sade üretim, stok ve Mekonsis satış yönetimi. Next.js 16 + TypeScript arayüzü, Supabase
(Postgres, Auth, Storage) arka ucu. Tüm iş kuralları (stok, maliyet, FIFO, kur) Postgres
fonksiyonlarında atomik olarak çalışır; arayüz Türkçedir ve masaüstü kullanım için tasarlanmıştır.

- Mimari ve değerleme kararları: [`docs/MIMARI.md`](docs/MIMARI.md)
- Excel alan eşleştirme notu: [`docs/EXCEL_ALAN_ESLESTIRME.md`](docs/EXCEL_ALAN_ESLESTIRME.md)

## Ekranlar

| Ekran | Yol | Özet |
|---|---|---|
| Dashboard | `/` | Ürün/varyant: tamamlanan üretim, Mekonsis'in sattığı, iki raf, toplam kalan, eşiğe göre stok durumu, son iki parti birim maliyet değişimi; günlük/aylık satış-ciro grafiği |
| Ürünler ve BOM | `/urunler` | Ürün, kod, detay, görsel, fiyat/para birimi, birim süre, eşikler; varyantlar ve varyant başına 1 adetlik reçete; süreli maliyet görünümü |
| Hammadde | `/hammadde` | Birim türü ve normalizasyon, gerçek miktar, alış hareketleri (USD/TRY + TL karşılığı), fire/sayım düşümü |
| Üretim Simülasyonu | `/simulasyon` | Ürün → varyant → adet; eksikler, maksimum adet, tahmini maliyet/süre; "Üretimi Başlat" |
| Üretim ve Partiler | `/uretim` | Parti no, durum (Üretimde/Tamamlandı/İptal), süre, sabitlenmiş maliyet, tamamla/iptal |
| Rafım (Heatemp) | `/rafim` | Varyant/parti bazında adet ve maliyet değeri; "Mekonsis'e Teslim Et"; açılış stoğu |
| Mekonsis Rafı | `/mekonsis` | Teslimat/parti bazında teslim edilen, satılan, kalan; teslimat geçmişi ve geri alma |
| Satışlar | `/satislar` | Gerçek adet/fiyat, USD/TRY, tarih, müşteri; FIFO tahsisleri, ciro, satılan ürün maliyeti, brüt kâr; iptal |
| Kurumsal Müşteriler | `/musteriler` | Firma bilgileri, toplu satış teklifi (tahmini ciro/maliyet/kâr/marj), "Satışa Dönüştür" |
| Kasa | `/kasa` | Finansal özet (nakit bakiyesi değildir) ve ürün/varyant bazında analiz |
| Ayarlar | `/ayarlar` | Kur kaynağı/türü, kur geçerlilik süresi, manuel kur, kur geçmişi, kullanıcılar |

## Gereksinimler

- Node.js ≥ 20.9 (22 ile test edildi), npm
- Docker (yerel Supabase için)
- Supabase CLI (önerilen; `npx supabase …` ile de çalışır)

## Ortam değişkenleri

`.env.example` dosyasını `.env.local` olarak kopyalayın:

| Değişken | Nerede | Açıklama |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | tarayıcı + sunucu | Supabase API adresi (yerel: `http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` veya `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | tarayıcı + sunucu | Herkese açık anahtar; tüm erişim RLS ile sınırlıdır |
| `SUPABASE_SERVICE_ROLE_KEY` (veya `SUPABASE_SECRET_KEY`) | **yalnızca sunucu** | Yalnızca otomatik kur kaydı (`record_auto_fx_rate`) için. Boşsa otomatik kur kaydedilmez, manuel kur girilir |
| `DATABASE_URL` | yalnızca DB testleri | Varsayılan `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

Service role anahtarını hiçbir zaman `NEXT_PUBLIC_` önekiyle tanımlamayın.

## Kurulum ve çalıştırma (yerel)

### A) Supabase CLI ile (önerilen)

```bash
npm install
npx supabase start            # yerel Supabase (API 54321, DB 54322, Studio 54323)
npx supabase db reset         # supabase/migrations/*.sql dosyalarını sırayla uygular
npx supabase status           # URL, anon ve service_role anahtarlarını gösterir → .env.local
```

**İlk yönetici:** Herkese açık kayıt kapalıdır. Studio'da (http://127.0.0.1:54323) *Authentication → Add user*
ile kullanıcı oluşturun, ardından SQL düzenleyicide:

```sql
insert into public.app_users (user_id, role)
select id, 'admin' from auth.users where email = 'yonetici@firma.com';
-- Salt okunur kullanıcı için role = 'viewer'
```

```bash
npm run dev                   # http://localhost:3000
```

### B) Supabase CLI olmadan (asgari Docker yığını)

`scripts/dev-stack/` Supabase'in resmi imajlarıyla (Postgres, GoTrue, PostgREST, Storage, nginx ağ geçidi)
CLI portlarını taklit eden bir yığın kurar, migration'ları uygular, bir yönetici oluşturur ve `.env.local` yazar:

```bash
WITH_STORAGE=1 npm run dev:stack   # giriş: admin@heatemp.local / heatemp-yerel-123
npm run dev
npm run dev:stack:down             # durdur ve verileri sil
```

### Uzak Supabase projesine migration (bu teslimatta YAPILMADI)

```bash
npx supabase link --project-ref <proje-ref>
npx supabase db push          # yalnızca bekleyen migration'ları uygular
```

Canlıya almadan önce Supabase panelinde: e-posta kaydını kapatın (Authentication → Providers), ilk yöneticiyi
yukarıdaki SQL ile ekleyin, Vercel vb. ortamda yukarıdaki değişkenleri tanımlayın.

## Migration dosyaları

| Dosya | İçerik |
|---|---|
| `20260928090000_temel.sql` | Yetki (`app_users`, `is_admin`), ayarlar, birimler, kurlar ve kur doğrulama |
| `20260928090100_urun_hammadde.sql` | Ürün, varyant, hammadde, bakiye/hareket defteri, BOM, alış ve fire |
| `20260928090200_uretim.sql` | Simülasyon, parti başlat/tamamla/iptal, mamul stok katmanları |
| `20260928090300_teslimat.sql` | Mekonsis teslimatı ve geri alma |
| `20260928090400_satis.sql` | Müşteri, satış, FIFO tahsis, satış iptali |
| `20260928090500_raporlar.sql` | Dashboard/Kasa görünümleri, defter tutarlılık kontrolü |
| `20260928090600_teklifler.sql` | Teklif, tahmin, satışa dönüştürme |
| `20260928090700_urun_gorselleri.sql` | Özel Storage kovası ve politikaları |
| `20260928090800_acilis_stogu.sql` | Sistem öncesi mamul için açılış stoğu |

## Kur (USD/TRY)

- Sunucu TCMB'den (döviz alış varsayılan; Ayarlar'dan döviz satış seçilebilir) otomatik kur alır; erişilemezse
  ECB referans kuru (Frankfurter) denenir. Kaynak, kurun geçerli günü ve alınma zamanı kaydedilir.
- Hafta sonu/tatilde en yakın önceki bülten kullanılır. İşlem tarihinden en fazla `fx_max_age_days` (varsayılan
  4) gün eski kur kabul edilir; yoksa işlem kaydedilmez ve yönetici manuel kur girer (formlarda "Manuel kur gir").
- Her alış, parti ve satış kullandığı kuru kopyalar; sonradan gelen kurlar geçmişi değiştirmez.

## Testler ve doğrulama

```bash
npm run lint && npm run typecheck
npm test                      # birim testleri (kur XML/JSON ayrıştırma, sayı/para biçimi, Excel başlık eşleştirme)
npm run test:db:docker        # temiz supabase/postgres konteyneri + tüm migration'lar + DB testleri
# veya Supabase CLI ile: npx supabase db reset && npm run test:db
npm run build
npm run test:e2e              # yığın + npm run dev çalışırken; playwright paketi ve Chromium gerekir
```

Bu teslimatta çalıştırılıp geçen kontroller:

- **Lint, typecheck, `next build`:** hatasız.
- **Birim testleri:** 13/13.
- **Veritabanı testleri (24/24)**, `supabase/postgres:15.8.1.085` üzerinde migration'lar sıfırdan uygulanarak:
  - Uçtan uca: 100 üretim → Heatemp 100; 80 teslimat → Heatemp 20, Mekonsis 80, ciro/kâr 0;
    30 satış (50 USD, kur 40) → Heatemp 20, Mekonsis 50, satılan 30, ciro ₺60.000, maliyet ₺5.400, kâr ₺54.600.
  - Farklı maliyetli iki partiden 120 adet satış: 100 adet 1. partiden, 20 adet 2. partiden FIFO tahsis ve doğru maliyet.
  - Eş zamanlı iki satış (50 stokta 2×40): yalnızca biri başarılı, stok eksiye düşmedi; 6 eş zamanlı satışta da aynı.
  - Eş zamanlı iki üretim başlatma aynı hammaddeyi iki kez tüketemez.
  - Eş zamanlı çift iptal: malzeme tam bir kez, aynı maliyetle iade edildi; tamamlanan parti tekrar tamamlanamaz.
  - Aynı istek kimliğiyle tekrarlanan satış/üretim tek kayıt; teklif iki kez (eş zamanlı dahil) dönüştürülemez.
  - Kur: eski ve işlem tarihinden sonraki kur reddedilir; manuel kur kullanılabilir.
  - RLS: anonim erişim yok; uygulamaya eklenmemiş kullanıcı hiçbir şey göremez; görüntüleyici değiştiremez;
    yönetici bile defter/bakiye tablolarını doğrudan değiştiremez; otomatik kuru yalnızca service role yazar.
  - Defter bakiyeleri hareketlerle tutarlı; Kasa mutabakatı sağlanıyor; açılış stoğu FIFO'da önce tüketiliyor.
- **Arayüz senaryosu (Playwright, `tests/e2e/arayuz-akisi.cjs`):** Supabase Postgres + GoTrue + PostgREST +
  Storage yığınında giriş, manuel kur, malzeme alışları (kg/adet, USD/TRY), ürün + görsel yükleme + reçete,
  simülasyon (eksik stok engeli dahil), üretim başlat/tamamla ve başlat/iptal, 80 teslimat, 30 satış, fazla
  satış uyarısı, müşteri teklifi ve satışa dönüştürme, Dashboard ve Kasa; tarayıcı hatası yok.

## Bilinen sınırlamalar

- Referans PDF ve Excel dosyası çalışma ortamında yoktu; Excel sütunları incelenemedi, içe aktarma yapılmadı
  (bkz. `docs/EXCEL_ALAN_ESLESTIRME.md`, `npm run excel:incele`).
- TCMB ve Frankfurter bu çalışma ortamının ağından erişilemediği için canlı kur alma yalnızca örnek yanıtlarla
  (birim testleri) doğrulandı; uçtan uca testlerde manuel kur kullanıldı.
- Supabase CLI ile `supabase start` Docker Hub çekme limiti nedeniyle burada tamamlanamadı; `config.toml`
  CLI tarafından ayrıştırıldı, migration'lar Supabase'in resmi imajlarından kurulan yığında doğrulandı.
- Tarihsel maliyet ilkesi: USD alınmış malzemenin TL maliyeti alış günü kuruyla sabitlenir (bkz. MIMARI §7).
- Mekonsis'ten Heatemp'e kısmi iade yoktur; yalnızca hiç satış yapılmamış teslimat tamamen geri alınabilir.
- Kullanıcı yönetimi arayüzü yoktur (tek yönetici); kullanıcılar Supabase panelinden eklenir.
- Kasa bir yönetim özetidir; banka, tahsilat, cari hesap, e-fatura modülleri kapsam dışıdır.
