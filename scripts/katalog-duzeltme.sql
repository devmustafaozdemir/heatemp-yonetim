-- =====================================================================
-- Heatemp ERP — Ürün kataloğunu Heatemp Ürün Grubu tablosuna göre düzenleme
-- Tek seferlik veri düzeltmesi; Excel katalog aktarımından SONRA çalıştırılır.
-- Supabase SQL Editor'de tek parça çalıştırın (postgres rolü). Tekrar çalıştırılabilir.
-- Tüm işlem tek bir DO bloğudur (tek ifade): editör ifadeleri ayrı çalıştırsa da bütünlük korunur.
--
-- Ne yapar:
--   1) 6 ürün ailesi: Kablo Tipi, Kanal Tipi (Kanal/Daldırma/Dış Ortam/Yüzey), Mahal Tipi,
--      Su Kaçak, Fan Coil Çoklama Kartı, Sıcaklık Sensör Kovanı.
--   2) 49 katalog kodunun varyantı ilgili aileye taşınır ve yeniden adlandırılır; varyant kodu,
--      stoğu, satış/teslimat/üretim geçmişi ve reçetesi (BOM) aynen korunur. Eski üründen gelen
--      fiyat, stok eşiği ve üretim süresi değişmesin diye gerekirse varyanta yazılır.
--      Katalogda olup veritabanında olmayan kod varsa eklenir.
--   3) Boşalan eski ürünler (ör. HT-K-50mm, HT-D-100mm) silinir.
--   4) Redüksiyonlar hammadde/komponent olarak eklenir (stok 0; stoğu "Stok girişi" ile girin).
--      Ürün tarafında hareketi, reçetesi veya satış kaydı yoksa silinir; varsa pasif yapılır.
-- Hata olursa hiçbir değişiklik kalmaz. Sonda güncel ürün/hammadde durumu listelenir.
-- =====================================================================

do $katalog$
declare
  rec record;
  v_hata text;
begin
  create temp table _duzeltme_rapor (sira serial primary key, adim text not null, kod text, sonuc text not null, aciklama text)
    on commit drop;

  -- 1) Aileler ve katalog ------------------------------------------------------------------
  create temp table _aile (kod text primary key, ad text not null, kaynak text[] not null) on commit drop;
  insert into _aile values
    ('HT-KABLO', 'Kablo Tipi Sıcaklık Sensörü',
     array['HT-K-50mm', 'HT-K-100mm', 'HT-K-150mm', 'HT-D-50mm', 'HT-D-100mm', 'HT-D-150mm']),
    ('HT-KANAL', 'Kanal Tipi Sıcaklık Sensörü',
     array['HT-KT-100mm', 'HT-KT-150mm', 'HT-DT-100mm', 'HT-DT-150mm', 'HT-DO', 'HT-YT']),
    ('HT-MAHAL', 'Mahal Tipi Sıcaklık Sensörü', array['HT-MT-M', 'HT-MT-P']),
    ('HT-SKS', 'Su Kaçak Sensörü', array['HT-SKS']),
    ('HT-FCM', 'Fan Coil Çoklama Kartı', array['HT-FCM']),
    ('HT-KV', 'Sıcaklık Sensör Kovanı', array['HT-KV']);

  create temp table _katalog (kod text primary key, aile text not null, ad text not null) on commit drop;
  -- Kablo tipi: HT-<eleman>-<K|D>-<uzunluk>
  insert into _katalog
  select format('HT-%s-%s-%s', e, t, l), 'HT-KABLO', format('%s · %s · %s', e, t, l)
    from unnest(array['NTC10K', 'NTC20K', 'PT1000']) e, unnest(array['K', 'D']) t, unnest(array['50mm', '100mm', '150mm']) l;
  -- Kanal tipi ailesi: Kanal (KT), Daldırma (DT) uzunluklu; Dış Ortam (DO), Yüzey (YT)
  insert into _katalog
  select format('HT-%s-%s-%s', e, t.k, l), 'HT-KANAL', format('%s · %s · %s', t.ad, e, l)
    from unnest(array['NTC10K', 'NTC20K', 'PT1000']) e,
         (values ('KT', 'Kanal'), ('DT', 'Daldırma')) t(k, ad),
         unnest(array['100mm', '150mm']) l;
  insert into _katalog
  select format('HT-%s-%s', e, t.k), 'HT-KANAL', format('%s · %s', t.ad, e)
    from unnest(array['NTC10K', 'NTC20K', 'PT1000']) e, (values ('DO', 'Dış Ortam'), ('YT', 'Yüzey')) t(k, ad);
  -- Mahal tipi: Paslanmaz çelik (M), Plastik (P)
  insert into _katalog
  select format('HT-%s-MT-%s', e, t.k), 'HT-MAHAL', format('%s · %s', t.ad, e)
    from unnest(array['NTC10K', 'NTC20K', 'PT1000']) e, (values ('M', 'Paslanmaz Çelik'), ('P', 'Plastik')) t(k, ad);
  insert into _katalog values
    ('HT-SKS-S1', 'HT-SKS', 'Buzzerlı (Sesli)'),
    ('HT-SKS-N1', 'HT-SKS', 'Buzzersız (Sessiz)'),
    ('HT-FCM2', 'HT-FCM', '2 Fan Kontrol'),
    ('HT-FCM4', 'HT-FCM', '4 Fan Kontrol'),
    ('HT-KV5', 'HT-KV', '50mm'),
    ('HT-KV10', 'HT-KV', '100mm'),
    ('HT-KV15', 'HT-KV', '150mm');

  if (select count(*) from _katalog) <> 49 then raise exception 'Katalog 49 kod olmalı.'; end if;

  -- 2) Aile ürünleri (yoksa eklenir; eşik, süre, görsel ve açıklama ilk kaynak üründen) --------
  create temp table _yeni_aile (id uuid primary key, kod text not null) on commit drop;
  with kaynak as (
    select distinct on (a.kod) a.kod, a.ad, p.*
      from _aile a
      left join public.products p on p.code = any (a.kaynak)
     order by a.kod, array_position(a.kaynak, p.code)
  ), ekle as (
    insert into public.products (code, name, description, image_path, default_currency, unit_production_minutes,
                                 critical_stock, min_stock, target_stock)
    select k.kod, k.ad, k.description, k.image_path, 'USD', coalesce(k.unit_production_minutes, 0),
           coalesce(k.critical_stock, 0), coalesce(k.min_stock, 0), coalesce(k.target_stock, 0)
      from kaynak k
     where not exists (select 1 from public.products x where x.code = k.kod)
    returning id, code
  )
  insert into _yeni_aile select id, code from ekle;

  -- Ürün eklenince tetikleyicinin açtığı boş 'Standart' varyantı kaldır
  delete from public.product_variants v using _yeni_aile y
   where v.product_id = y.id and v.code = y.kod and v.name = 'Standart';

  update public.products p set name = a.ad from _aile a where p.code = a.kod and p.name <> a.ad;

  insert into _duzeltme_rapor (adim, kod, sonuc, aciklama)
  select '1-aile', a.kod, case when y.id is null then 'zaten vardı' else 'eklendi' end, a.ad
    from _aile a left join _yeni_aile y on y.kod = a.kod order by a.kod;

  -- Eski ürünlerin görsel ve açıklaması varsa aileye taşınır (aile ürününde boşsa)
  update public.products f
     set image_path = coalesce(f.image_path, s.image_path), description = coalesce(f.description, s.description)
    from _aile a,
         lateral (select p.image_path, p.description from public.products p
                   where p.code = any (a.kaynak) and p.code <> a.kod and (p.image_path is not null or p.description is not null)
                   order by array_position(a.kaynak, p.code) limit 1) s
   where f.code = a.kod and (f.image_path is null or f.description is null);

  -- 3) Varyantları aileye taşı ve yeniden adlandır -----------------------------------------
  create temp table _tasima on commit drop as
  select v.id, v.code, k.ad as yeni_ad, f.id as aile_id, p.id as eski_id, p.code as eski_kod,
         (p.id <> f.id) as tasinacak
    from _katalog k
    join public.product_variants v on v.code = k.kod
    join public.products p on p.id = v.product_id
    join public.products f on f.code = k.aile;

  -- Eski üründen devralınan değerler varyanta yazılır (taşıma sonrası etkin değer değişmesin)
  update public.product_variants v
     set sale_price = coalesce(v.sale_price, p.default_sale_price),
         currency = case when v.sale_price is null and p.default_sale_price is not null then p.default_currency else v.currency end,
         unit_production_minutes = case
           when v.unit_production_minutes is null and p.unit_production_minutes <> f.unit_production_minutes
             then p.unit_production_minutes else v.unit_production_minutes end,
         critical_stock = case when v.critical_stock is null
           and (p.critical_stock, p.min_stock, p.target_stock) <> (f.critical_stock, f.min_stock, f.target_stock)
             then p.critical_stock else v.critical_stock end,
         min_stock = case when v.critical_stock is null
           and (p.critical_stock, p.min_stock, p.target_stock) <> (f.critical_stock, f.min_stock, f.target_stock)
             then p.min_stock else v.min_stock end,
         target_stock = case when v.critical_stock is null
           and (p.critical_stock, p.min_stock, p.target_stock) <> (f.critical_stock, f.min_stock, f.target_stock)
             then p.target_stock else v.target_stock end,
         is_active = v.is_active and p.is_active
    from _tasima t
    join public.products p on p.id = t.eski_id
    join public.products f on f.id = t.aile_id
   where v.id = t.id and t.tasinacak;

  -- Aynı ailede çakışma olmasın diye önce geçici ad, sonra katalog adı
  update public.product_variants v set name = '~' || v.code from _tasima t where v.id = t.id and v.name <> t.yeni_ad;
  update public.product_variants v set product_id = t.aile_id, name = t.yeni_ad from _tasima t where v.id = t.id;

  insert into _duzeltme_rapor (adim, kod, sonuc, aciklama)
  select '2-varyant', t.code, case when t.tasinacak then 'taşındı' else 'yerinde' end,
         case when t.tasinacak then t.eski_kod || ' → ' else '' end || a.ad || ' — ' || t.yeni_ad
    from _tasima t join _katalog k on k.kod = t.code join _aile a on a.kod = k.aile
   order by k.aile, t.code;

  -- Katalogda olup veritabanında olmayan kodlar
  with ekle as (
    insert into public.product_variants (product_id, code, name)
    select f.id, k.kod, k.ad
      from _katalog k join public.products f on f.code = k.aile
     where not exists (select 1 from public.product_variants v where v.code = k.kod)
    returning code, name
  )
  insert into _duzeltme_rapor (adim, kod, sonuc, aciklama) select '2-varyant', code, 'eklendi', name from ekle;

  -- 4) Boşalan eski ürünler -----------------------------------------------------------------
  with sil as (
    delete from public.products p
     where p.code in (select unnest(kaynak) from _aile) and p.code not in (select kod from _aile)
       and not exists (select 1 from public.product_variants v where v.product_id = p.id)
    returning code, name
  )
  insert into _duzeltme_rapor (adim, kod, sonuc, aciklama) select '3-eski-urun', code, 'silindi', name from sil;

  insert into _duzeltme_rapor (adim, kod, sonuc, aciklama)
  select '3-eski-urun', p.code, 'KALDI', 'Katalog dışı varyantı var: ' || string_agg(v.code, ', ' order by v.code)
    from public.products p join public.product_variants v on v.product_id = p.id
   where p.code in (select unnest(kaynak) from _aile) and p.code not in (select kod from _aile)
   group by p.code;

  -- 5) Redüksiyonlar → hammadde (komponent, adet) -------------------------------------------
  create temp table _reduksiyon (urun_kodu text primary key, hm_kodu text not null, ad text not null) on commit drop;
  insert into _reduksiyon values
    ('1/4 x 1/2 Redüksiyon', 'KMP-RED-1/4x1/2', '1/4 x 1/2 Redüksiyon'),
    ('7/16 x 1/2 Redüksiyon', 'KMP-RED-7/16x1/2', '7/16 x 1/2 Redüksiyon');

  with ekle as (
    insert into public.raw_materials (code, name, kind, unit_kind, display_unit, notes)
    select r.hm_kodu, r.ad, 'component', 'count', 'adet', 'Ürün kataloğundan hammaddeye taşındı.'
      from _reduksiyon r
     where not exists (select 1 from public.raw_materials m where m.code = r.hm_kodu)
    returning code, name
  )
  insert into _duzeltme_rapor (adim, kod, sonuc, aciklama)
  select '4-reduksiyon', code, 'hammadde eklendi', name || ' — stok 0; stoğu Hammadde › Stok girişi ile girin.' from ekle;

  for rec in
      select p.id, p.code from public.products p join _reduksiyon x on x.urun_kodu = p.code
    loop
      if exists (select 1 from public.product_variants v where v.product_id = rec.id and (
           exists (select 1 from public.stock_movements s where s.variant_id = v.id)
        or exists (select 1 from public.deliveries d where d.variant_id = v.id)
        or exists (select 1 from public.sale_items s where s.variant_id = v.id)
        or exists (select 1 from public.quote_items q where q.variant_id = v.id)
        or exists (select 1 from public.production_batches b where b.variant_id = v.id)
        or exists (select 1 from public.bom_items b where b.variant_id = v.id))) then
        update public.product_variants set is_active = false where product_id = rec.id;
        update public.products set is_active = false where id = rec.id;
        insert into _duzeltme_rapor (adim, kod, sonuc, aciklama)
        values ('4-reduksiyon', rec.code, 'ürün PASİF', 'Stok, teslimat, satış, teklif veya reçete kaydı olduğu için silinmedi; geçmiş korunur.');
      else
        delete from public.product_variants where product_id = rec.id;
        delete from public.products where id = rec.id;
        insert into _duzeltme_rapor (adim, kod, sonuc, aciklama) values ('4-reduksiyon', rec.code, 'ürün silindi', null);
      end if;
    end loop;

  -- 6) Son kontrol: her aile beklenen sayıda katalog varyantı içermeli --------------------------
  select string_agg(format('%s: %s/%s', a.kod, coalesce(n.say, 0), e.say), ', ') into v_hata
      from _aile a
      join (select aile, count(*) say from _katalog group by aile) e on e.aile = a.kod
      left join (select k.aile, count(*) say from _katalog k
                   join public.product_variants v on v.code = k.kod
                   join public.products p on p.id = v.product_id and p.code = k.aile
                  group by k.aile) n on n.aile = a.kod
     where coalesce(n.say, 0) <> e.say;
    if v_hata is not null then raise exception 'Katalog varyant sayısı tutmuyor: %', v_hata; end if;

  raise notice '% aile eklendi, % varyant taşındı, % varyant eklendi, % eski ürün silindi',
    (select count(*) from _duzeltme_rapor where adim = '1-aile' and sonuc = 'eklendi'),
    (select count(*) from _duzeltme_rapor where adim = '2-varyant' and sonuc = 'taşındı'),
    (select count(*) from _duzeltme_rapor where adim = '2-varyant' and sonuc = 'eklendi'),
    (select count(*) from _duzeltme_rapor where adim = '3-eski-urun' and sonuc = 'silindi');
end
$katalog$;

-- Sonuç: güncel ürünler (varyant sayısıyla) ve Redüksiyon hammaddeleri
select 'ürün' as tur, p.code as kod, p.name as ad, case when p.is_active then 'aktif' else 'PASİF' end as durum,
       count(v.id) as varyant
  from public.products p left join public.product_variants v on v.product_id = p.id
 group by p.id
union all
select 'hammadde', m.code, m.name, case when m.is_active then 'aktif' else 'PASİF' end, null
  from public.raw_materials m where m.code like 'KMP-RED-%'
 order by 1 desc, 2;
