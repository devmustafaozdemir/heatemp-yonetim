-- =====================================================================
-- Heatemp ERP — 25 Hammadde silme
-- Malzemeyi hareketleri, stok bakiyesi ve reçete satırlarıyla birlikte siler.
-- Üretim partisinde kullanıldıysa silinmez (parti maliyetleri bu kayıtlara bağlıdır);
-- bu durumda malzeme pasif yapılmalıdır. Yalnız yönetici; kullanıcı ekranda onaylar.
-- =====================================================================

create or replace function public.delete_raw_material(p_material_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  perform private.assert_admin();
  select name into v_name from public.raw_materials where id = p_material_id;
  if not found then
    raise exception 'Malzeme bulunamadı.';
  end if;
  perform 1 from public.material_balances where material_id = p_material_id for update;
  if exists (select 1 from public.production_consumptions where material_id = p_material_id) then
    raise exception '% üretim partilerinde kullanıldı; silinemez. Bunun yerine malzemeyi pasif yapın.', v_name;
  end if;
  delete from public.bom_items where material_id = p_material_id;
  delete from public.material_movements where material_id = p_material_id;
  delete from public.raw_materials where id = p_material_id; -- bakiye satırı birlikte silinir
end
$$;

comment on function public.delete_raw_material(uuid) is
  'Hammaddeyi hareketleri, bakiyesi ve reçete satırlarıyla siler; üretimde kullanıldıysa reddeder.';

do $$ begin perform private.lock_down_public_functions(); end $$;
