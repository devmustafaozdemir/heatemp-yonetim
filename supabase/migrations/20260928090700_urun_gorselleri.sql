-- =====================================================================
-- Heatemp ERP — 8 Ürün görselleri (Supabase Storage)
-- Görseller ÖZEL bir kovada tutulur. Uygulama görseli oturum sahibinin
-- yetkisiyle sunucu tarafında okur (/urun-gorseli/... rotası); okuma yalnızca
-- uygulama üyelerine, yükleme/değiştirme/silme yalnızca yöneticiye açıktır.
--
-- Barındırılan Supabase'te ve Supabase CLI'da storage şeması her zaman vardır.
-- Yalnızca Storage servisi olmayan çıplak bir Postgres'te (ör. bazı test
-- ortamları) bu adım bir uyarıyla atlanır.
-- =====================================================================

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage şeması bulunamadı; ürün görseli kovası ve politikaları oluşturulmadı.';
    return;
  end if;

  -- "public" sütunu Storage servisinin migration'larıyla gelir ve varsayılanı
  -- false'tur; bu yüzden yalnızca kimlik ve ad yazılır (kova özeldir).
  insert into storage.buckets (id, name)
  values ('product-images', 'product-images')
  on conflict (id) do nothing;

  execute $p$
    create policy "urun_gorselleri_okuma" on storage.objects
      for select to authenticated
      using (bucket_id = 'product-images' and (select public.is_app_member()))
  $p$;

  execute $p$
    create policy "urun_gorselleri_yukleme" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'product-images' and (select public.is_admin()))
  $p$;

  execute $p$
    create policy "urun_gorselleri_guncelleme" on storage.objects
      for update to authenticated
      using (bucket_id = 'product-images' and (select public.is_admin()))
      with check (bucket_id = 'product-images' and (select public.is_admin()))
  $p$;

  execute $p$
    create policy "urun_gorselleri_silme" on storage.objects
      for delete to authenticated
      using (bucket_id = 'product-images' and (select public.is_admin()))
  $p$;
end
$$;
