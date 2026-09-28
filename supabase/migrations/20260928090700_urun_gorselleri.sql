-- =====================================================================
-- Heatemp ERP — 8/8 Ürün görselleri (Supabase Storage)
-- Görseller herkese açık bir kovada tutulur (yalnızca ürün fotoğrafı içindir);
-- yükleme, değiştirme ve silme yalnızca yöneticiye açıktır.
-- =====================================================================

-- storage.buckets.public sütunu Storage servisinin kendi migration'larıyla gelir;
-- yalnızca veritabanı içeren test ortamlarında bu sütun olmayabilir.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'storage' and table_name = 'buckets' and column_name = 'public') then
    insert into storage.buckets (id, name, public)
    values ('product-images', 'product-images', true)
    on conflict (id) do nothing;
  else
    insert into storage.buckets (id, name)
    values ('product-images', 'product-images')
    on conflict (id) do nothing;
  end if;
end
$$;

create policy "urun_gorselleri_okuma" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-images' and (select public.is_app_member()));

create policy "urun_gorselleri_yukleme" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));

create policy "urun_gorselleri_guncelleme" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()))
  with check (bucket_id = 'product-images' and (select public.is_admin()));

create policy "urun_gorselleri_silme" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));
