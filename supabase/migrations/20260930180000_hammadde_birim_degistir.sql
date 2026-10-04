-- =====================================================================
-- Heatemp ERP — 29 Hammaddenin birim türünü sonradan değiştirme
-- Malzeme yanlış birim türüyle açıldıysa (ör. adet yerine kg) hareketi veya reçetesi olsa bile
-- düzeltilebilir. Kural: ekranda görünen miktarlar aynı kalır (30 adet → 30 kg); tutarlar (TL/USD)
-- değişmez, birim maliyet ve birim fiyat yeni birime göre yeniden hesaplanır. Stok bakiyesi,
-- tüm hareketler, üretim tüketimleri ve reçete satırları aynı oranla birlikte güncellenir.
-- =====================================================================

-- Birim türü değişikliği yalnız change_material_unit işlemi içinde serbest.
create or replace function private.raw_materials_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
begin
  select kind into v_kind from public.units where code = new.display_unit;
  if v_kind is distinct from new.unit_kind then
    raise exception 'Gösterim birimi (%) malzemenin birim türüyle (%) uyuşmuyor.',
      new.display_unit, private.unit_kind_label(new.unit_kind);
  end if;
  if tg_op = 'UPDATE' and new.unit_kind <> old.unit_kind
     and coalesce(current_setting('heatemp.material_unit_change', true), '') <> 'on' then
    if exists (select 1 from public.material_movements where material_id = new.id)
       or exists (select 1 from public.bom_items where material_id = new.id) then
      raise exception 'Hareketi veya reçetesi olan malzemenin birim türü malzeme düzenleme ekranındaki birim türü alanıyla değiştirilir.';
    end if;
  end if;
  return new;
end
$$;

create or replace function public.change_material_unit(p_material_id uuid, p_unit_kind text, p_display_unit text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mat public.raw_materials;
  v_old_factor numeric;
  v_new_factor numeric;
  k numeric;
begin
  perform private.assert_admin();
  select * into v_mat from public.raw_materials where id = p_material_id for update;
  if not found then
    raise exception 'Malzeme bulunamadı.';
  end if;
  perform 1 from public.material_balances where material_id = p_material_id for update;
  select factor_to_base into v_new_factor from public.units where code = p_display_unit and kind = p_unit_kind;
  if v_new_factor is null then
    raise exception 'Gösterim birimi seçilen birim türüne ait değil.';
  end if;
  if p_unit_kind = v_mat.unit_kind then
    update public.raw_materials set display_unit = p_display_unit where id = p_material_id;
    return;
  end if;
  select factor_to_base into v_old_factor from public.units where code = v_mat.display_unit;
  -- Görünen miktar sabit: yeni temel miktar = eski temel miktar × (yeni gösterim katsayısı / eski)
  k := v_new_factor / v_old_factor;

  perform set_config('heatemp.material_unit_change', 'on', true);
  update public.raw_materials set unit_kind = p_unit_kind, display_unit = p_display_unit where id = p_material_id;
  perform set_config('heatemp.material_unit_change', 'off', true);

  update public.material_balances set qty = qty * k where material_id = p_material_id;

  update public.material_movements
     set qty = qty * k,
         balance_qty_after = balance_qty_after * k,
         unit_cost_try = unit_cost_try / k,
         unit_cost_usd = unit_cost_usd / k,
         entry_qty = case when entry_unit is not null then abs(qty * k) / v_new_factor else entry_qty end,
         entry_unit = case when entry_unit is not null then p_display_unit else entry_unit end,
         unit_price = case when unit_price is not null and total_amount is not null
                           then total_amount / (abs(qty * k) / v_new_factor) else unit_price end
   where material_id = p_material_id;

  update public.production_consumptions
     set qty = qty * k,
         qty_per_unit = qty_per_unit * k,
         unit_cost_try = unit_cost_try / k,
         unit_cost_usd = unit_cost_usd / k
   where material_id = p_material_id;

  -- Reçete: giriş birimi yeni gösterim birimi; temel miktar tetikleyiciyle yeniden hesaplanır.
  update public.bom_items
     set entry_qty = qty_per_unit * k / v_new_factor,
         entry_unit = p_display_unit
   where material_id = p_material_id;
end
$$;

comment on function public.change_material_unit(uuid, text, text) is
  'Hammaddenin birim türünü/gösterim birimini değiştirir; görünen miktarlar ve tutarlar korunur, birim maliyetler yeni birime göre hesaplanır.';

do $$ begin perform private.lock_down_public_functions(); end $$;
