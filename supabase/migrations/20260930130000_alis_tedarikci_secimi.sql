-- =====================================================================
-- Heatemp ERP — 24 Mevcut alışa tedarikçi seçimi
-- Yalnız tedarikçiyi değiştirir (miktar, fiyat, kur, maliyet ve bakiye aynen kalır).
-- Tedarikçi maliyeti etkilemediği için alıştan sonra üretim/fire olsa da yapılabilir.
-- =====================================================================

create or replace function public.set_purchase_supplier(p_movement_id bigint, p_supplier_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_supplier public.suppliers;
begin
  perform private.assert_admin();
  select movement_type into v_type from public.material_movements where id = p_movement_id;
  if not found then
    raise exception 'Hareket bulunamadı.';
  end if;
  if v_type <> 'purchase' then
    raise exception 'Tedarikçi yalnız alış hareketine seçilebilir.';
  end if;
  v_supplier := private.resolve_supplier(p_supplier_id);
  update public.material_movements
     set supplier_id = v_supplier.id,
         supplier = v_supplier.name
   where id = p_movement_id;
end
$$;

comment on function public.set_purchase_supplier(bigint, uuid) is
  'Alışın tedarikçisini değiştirir; maliyet ve stok değerlerine dokunmaz.';

do $$ begin perform private.lock_down_public_functions(); end $$;
