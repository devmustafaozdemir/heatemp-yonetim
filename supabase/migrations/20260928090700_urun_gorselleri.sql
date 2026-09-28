-- =====================================================================
-- Heatemp ERP — 8/9 Ürün görselleri (Supabase Storage)
-- Görseller ÖZEL bir kovada tutulur. Uygulama görseli oturum sahibinin
-- yetkisiyle sunucu tarafında okur (/urun-gorseli/... rotası); okuma yalnızca
-- uygulama üyelerine, yükleme/değiştirme/silme yalnızca yöneticiye açıktır.
-- =====================================================================

-- "public" sütunu Storage servisinin kendi migration'larıyla eklenir ve
-- varsayılanı false'tur; bu yüzden yalnızca kimlik ve ad yazılır.
insert into storage.buckets (id, name)
values ('product-images', 'product-images')
on conflict (id) do nothing;

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
