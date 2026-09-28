-- =====================================================================
-- Heatemp ERP — 10 Açık yetki matrisi
-- Uzak Supabase projelerinde "public" şemasının varsayılan yetkileri projeye
-- göre değişebilir (ör. yeni tabloları Data API'ye otomatik açmayan projeler).
-- Bu migration uygulamanın ihtiyaç duyduğu yetkileri açıkça tanımlar; böylece
-- davranış proje varsayılanlarından bağımsızdır. Satır erişimi yine RLS ile sınırlıdır.
-- =====================================================================

grant usage on schema public to authenticated, service_role;

-- anon: hiçbir tabloya, görünüme, diziye erişemez.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon, authenticated;

-- authenticated: önce tüm tablo yetkileri kaldırılır, sonra gerekenler verilir.
revoke all on all tables in schema public from authenticated;

-- Okuma: tüm tablo ve görünümler (hangi satırların görüneceğini RLS belirler).
grant select on all tables in schema public to authenticated;

-- Ana veri yazma: yalnızca bu tablolar; RLS yalnızca yöneticiye izin verir.
grant insert, update, delete on
  public.products,
  public.product_variants,
  public.raw_materials,
  public.bom_items,
  public.customers,
  public.quotes,
  public.quote_items
to authenticated;

-- Ayarlar: yalnızca belirli sütunlar güncellenebilir (RLS: yönetici).
grant update (company_name, fx_primary_source, fx_tcmb_rate_type, fx_refresh_minutes, fx_max_age_days, show_usd_info)
  on public.app_settings to authenticated;

-- Stok defterleri, bakiyeler, partiler, teslimatlar, satışlar, kurlar ve
-- kullanıcılar için yazma yetkisi YOKTUR; yalnızca işlem fonksiyonları yazar.

-- Fonksiyonlar: anon ve PUBLIC çalıştıramaz; otomatik kur yalnızca service role.
do $$ begin perform private.lock_down_public_functions(); end $$;

-- Bu şemada ileride oluşturulacak nesneler anon'a otomatik açılmasın.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
