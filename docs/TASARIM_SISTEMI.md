# Heatemp arayüz tasarım sistemi

Tek stil sistemi: **Tailwind 4 teması + `src/app/globals.css` bileşen sınıfları + `src/components/ui` bileşenleri.**
Yeni bir CSS dosyası, ikinci bir tema veya satır içi renk kodu eklemeyin; renkleri tema adlarıyla kullanın.

## Görsel dil

| Öğe | Değer |
|---|---|
| Uygulama zemini | `bg-canvas` (#f3f3f9) |
| Kart | `.card` — beyaz, 1px `border-line`, hafif gölge, 6px köşe |
| Sol menü | koyu lacivert `bg-nav` (#1e2945), metin `text-nav-text`, grup başlığı `text-nav-title` |
| Ana vurgu | `brand-600` (#405189) — birincil buton, etkin sekme, bağlantı |
| Grafik/durum | `chart-blue` #3577f1 · `chart-teal` #0ab39c (olumlu/kâr) · `chart-sky` #299cdb · `chart-amber` #f7b84b (uyarı) · `chart-red` #f06548 (kritik/zarar) · `chart-violet` #6559cc |
| Metin | başlık `text-ink`, gövde `text-ink-soft`, yardımcı `text-ink-muted` |
| Sayılar | `tabular-nums`, tablolarda `.num` (sağa hizalı) |
| İkonlar | yalnızca `lucide-react` çizgi ikonları; emoji veya ●▼✓ gibi simgeler kullanılmaz |

Yazı boyutları: sayfa başlığı `text-xl`, kart başlığı `.card-title` (15px), gövde 13.5px, tablo 13px,
yardımcı metin `text-xs text-ink-muted`.

## Sayfa iskeleti

```tsx
<PageHeader
  title="Satışlar"
  description="Gerçekleşmiş Mekonsis satışları. Teslimatlar satış değildir."
  crumbs={[{ label: "SAT-2026-00012" }]}      // detay sayfasında ek adım (isteğe bağlı)
  meta={<Badge tone="green">Gerçekleşti</Badge>} // başlık yanı rozet (isteğe bağlı)
  actions={<ButtonLink href="/satislar/yeni"><Plus />Satış ekle</ButtonLink>}
/>
```

Breadcrumb menü yapısından (`src/components/nav-config.ts`) otomatik türetilir. Yeni bir sayfa menüye
eklenecekse yalnızca `NAV` dizisini güncelleyin.

Yerleşim: `grid gap-4` (veya `gap-5`); özet kartları `grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4`.
Masaüstünde form + özet yan yana: `grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]`. Izgara çocuklarına
`min-w-0` verin (tablolar taşmasın).

## Bileşenler

| Bileşen | Dosya | Not |
|---|---|---|
| `PageHeader`, `Card`, `StatCard`, `IconBox`, `DeltaText`, `MetricRow`, `Badge`, `EmptyState`, `ErrorState`, `Alert`, `Button`, `ButtonLink`, `Field`, `FormSection`, `TableWrap`, `DefinitionList`, `ProgressBar` | `components/ui/index.tsx` | sunucu + istemci |
| `Dialog` / `Modal` / `Drawer` | `components/ui/dialog.tsx` | kısa işlemler; içindeki `ActionForm` başarıda pencereyi kapatır |
| `ListToolbar` | `components/ui/ListToolbar.tsx` | arama, seçim filtreleri, tarih aralığı, sonuç sayısı, "Filtreleri temizle" |
| `SortTh`, `Pagination`, `LinkTabs`, `LinkSegmented` | `components/ui/list.tsx` | URL tabanlı; sunucu bileşeni |
| `ActionForm`, `FormField`, `SubmitButton`, `FieldError` | `components/forms.tsx` | çift gönderim engeli, alan yanı hata, başarı bildirimi |
| `ChartFrame`, `TooltipBox`, `Segmented`, `DonutChart`, `HBarChart`, `CHART`, `AXIS_TICK`, `GRID_PROPS` | `components/charts/kit.tsx` | Recharts; boş durum dahil |
| `StockStatusBadge`, `STOCK_STATUS` | `components/StockStatus.tsx` | renk + ikon + metin |

### Özet kartı

```tsx
<StatCard label="Ciro" scope="Seçilen dönem" value={fmtMoney(x, "TRY")} icon={TrendingUp} tone="blue"
  delta={{ pct: pctChange(cur, prev), label: "önceki 30 güne göre" }} description="Yalnız gerçekleşen satışlar" />
```

`delta.pct` yalnızca gerçekten hesaplanabiliyorsa verilir; önceki değer 0/bilinmiyorsa `pctChange` `null`
döner ve kart "karşılaştırma yok" yazar. Yüzde uydurmayın. Stok kartları `scope="Güncel stok"`, satış
kartları `scope="Seçilen dönem"`.

### Liste sayfası kalıbı (sunucu tarafı filtre, sıralama, sayfalama)

```tsx
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const lp = parseListParams(await searchParams, { sortable: ["sold_on", "revenue_try"], defaultSort: "sold_on" });
  let query = ctx.supabase.from("v_sales").select("*", { count: "exact" });
  const pattern = searchPattern(lp.q);
  if (pattern) query = query.or(`sale_no.ilike.${pattern},items_summary.ilike.${pattern}`);
  if (lp.values.durum) query = query.eq("status", lp.values.durum);
  const res = await load(query.order(lp.sort!, { ascending: lp.dir === "asc" }).range(lp.from, lp.to));
  return (
    <Card padded={false}>
      <ListToolbar basePath="/satislar" values={lp.values} total={res.count} search={{ placeholder: "Satış no, ürün…" }}
        filters={[{ key: "durum", label: "Durum", options: [...] }]} dateRange={{ label: "Satış tarihi" }} />
      {res.error ? <ErrorState message={res.error} /> : res.data!.length === 0 ? <EmptyState … /> : (
        <TableWrap><table className="table-base">…<SortTh …/>…</table></TableWrap>
      )}
      {res.count ? <Pagination basePath="/satislar" values={lp.values} page={lp.page} pageSize={lp.pageSize} total={res.count} /> : null}
    </Card>
  );
}
```

URL anahtarları: `q` arama, `sayfa`, `adet` (25/50/100), `sirala`, `yon`, `bas`/`bit` tarih aralığı,
diğer filtreler Türkçe kısa adlar (`durum`, `urun`, `tur`…). Sekmeler `?sekme=…`.

### Veri yükleme: hata ≠ boş

`load(query)` → `{ data, error, count }`. `error` doluysa `<ErrorState message={error} />`; `data` boşsa
`<EmptyState …/>`. **Hata asla "0" veya "kayıt yok" olarak gösterilmez.** Sayfanın tamamı için zorunlu veri
(ör. detaydaki ana kayıt) `must(query, "Satış")` ile yüklenir; hata `error.tsx` sınırına gider.
Kayıt yoksa `notFound()`.

### Formlar

- Alanlar mantıklı gruplarda (`FormSection`). Zorunlu alan: etikete `*` yazmayın, `<FormField label="Ürün kodu" required>`
  kullanın; kırmızı ` *` etiketin gerçek metnidir, yani erişilebilir ad yine "Ürün kodu *" olur (e2e seçicileri bozulmaz).
  Girdiye de `required` / `aria-required` verin.
- `ActionForm` her gönderime `request_id` ekler (idempotent), beklerken düğme kilitlenir ve
  "Kaydediliyor…" döner, başarıda sağ altta bildirim gösterir.
- Kısa işlem (malzeme alışı, teslimat, kur girişi, müşteri ekleme) → `Drawer`/`Modal`; kapsamlı kayıt
  (ürün, teklif) → detay sayfası.
- `?islem=…` ile sayfaya gelindiğinde ilgili pencere açık başlatılabilir: `<Drawer defaultOpen={sp.islem === "giris"} …>`.

### Grafikler

`ChartFrame` sabit yükseklik, `role="img"` + açıklama ve boş durum sağlar. Para ve adet aynı eksende
gösterilmez (ayrı sekme/segment veya açıkça etiketli iki eksen). Tooltip'te birim yazılır
(`TooltipBox`). Eksen için `fmtCompactMoney`, tooltip için `fmtMoney`.

### Biçimlendirme (`lib/format.ts`)

`fmtMoney(v, "TRY")` → ₺1.234,56 · `fmtUnitMoney` (birim maliyet, 4 hane) · `fmtCompactMoney` · `fmtInt` ·
`fmtNum` · `fmtPct` · `fmtDate` (GG.AA.YYYY) · `fmtDateTime` · `fmtMonth` · `fmtMinutes` · `fmtQty` · `pctChange`.
Dönem seçimi: `lib/period.ts` (`resolvePeriod`, `buckets`).

## İş kuralları (arayüzde de korunur)

- Heatemp üretici, Mekonsis satıcıdır. **Teslimat satış değildir**; Mekonsis rafındaki stok Heatemp'in varlığıdır.
- Ciro/kâr yalnızca `status = completed` satışlardan; kâr = FIFO parti maliyetine göre gerçekleşmiş brüt kâr.
- Açılış stoğu (`kind = 'opening'`) üretim sayılmaz: üretilen adet/üretim harcamasında gösterilmez, ayrı etiketlenir.
- Her işlem kendi günündeki kuru sabitler; sonradan gelen kur geçmişi değiştirmez.
- Tanımlı satış fiyatı, tahmini reçete maliyeti ve gerçekleşmiş parti maliyeti farklı etiketlerle gösterilir.
- Kasa ekranı tahsil edilmiş nakit bakiyesi değildir; satış ve stok kayıtlarından türetilen özettir.
- Kaynak veri yoksa ilerleme yüzdesi, tamamlanma zamanı, değişim oranı uydurulmaz.
- Görüntüleyici (viewer) rolünde yazma düğmeleri gösterilmez (`ctx.role === "admin"` kontrolü).

## Erişilebilirlik ve duyarlılık

- Durumlar renk + ikon + metinle verilir. Odak halkası görünür (`:focus-visible`).
- Hedef genişlikler: 1440 px masaüstü, 768 px tablet, 390 px mobil. Sayfa yatay kaymaz; geniş tablolar
  `TableWrap` içinde kayar. Kart başlığındaki işlemler dar ekranda alta sarar.
