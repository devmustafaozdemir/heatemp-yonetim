-- =====================================================================
-- Heatemp ERP — 21 Hammadde hareketini yerinde düzenleme (alış) / silme (alış, fire)
-- 20 numaralı düzeltme (ters kayıt + yeni alış) kaldırılır: hareket geçmişine
-- çıkış/giriş satırı eklenmez; alış satırı doğrudan güncellenir, alış veya fire satırı silinir.
-- Bakiye (material_balances) ve sonraki hareketlerin "bakiye" sütunları farkla kaydırılır.
-- Kural: hareketten SONRA üretim tüketimi veya fire varsa değiştirilemez (o çıkışların
-- ortalama maliyeti bu harekete dayanır ve partilere/fire kayıtlarına sabitlenmiştir).
-- =====================================================================

alter table public.material_movements add column if not exists corrected_at timestamptz;
comment on column public.material_movements.corrected_at is 'Alış satırı sonradan düzenlendiyse son düzenleme zamanı.';

drop function if exists public.correct_material_purchase(bigint, text, numeric, text, numeric, text, bigint, date, text, text, uuid);

-- Hareketi kilitler ve değiştirilebilir olduğunu doğrular (iç kullanım).
create or replace function private.lock_editable_movement(p_movement_id bigint, p_types text[])
returns public.material_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orig public.material_movements;
begin
  select * into v_orig from public.material_movements where id = p_movement_id;
  if not found then
    raise exception 'Hareket bulunamadı.';
  end if;
  if not v_orig.movement_type = any (p_types) then
    raise exception 'Bu hareket türü burada değiştirilemez (üretim hareketleri parti iptaliyle geri alınır).';
  end if;
  -- Aynı malzemedeki eşzamanlı giriş/çıkışlarla sırayı korumak için bakiye satırı kilitlenir.
  perform 1 from public.material_balances where material_id = v_orig.material_id for update;
  select * into v_orig from public.material_movements where id = p_movement_id for update;
  if exists (select 1 from public.material_movements where reverses_movement_id = v_orig.id) then
    raise exception 'Bu alış daha önce ters kayıtla iptal edilmiş; değiştirilemez.';
  end if;
  if exists (
    select 1 from public.material_movements m
     where m.material_id = v_orig.material_id
       and m.id > v_orig.id
       and m.movement_type in ('production_consume', 'write_off')
  ) then
    raise exception 'Bu hareketten sonra malzeme üretimde kullanıldı veya fire yazıldı; o kayıtların maliyeti bu harekete dayandığı için değiştirilemez. Farkı yeni bir alış veya fire kaydıyla girin.';
  end if;
  return v_orig;
end
$$;

-- Bakiyeyi ve bu hareketten sonraki bakiye sütunlarını farkla kaydırır (iç kullanım).
create or replace function private.shift_material_balance(
  p_material_id uuid, p_from_movement_id bigint, p_qty numeric, p_value_try numeric, p_value_usd numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance public.material_balances;
begin
  select * into v_balance from public.material_balances where material_id = p_material_id;
  if v_balance.qty + p_qty < 0 or v_balance.value_try + p_value_try < 0 or v_balance.value_usd + p_value_usd < 0 then
    raise exception 'Mevcut stok bu değişikliğe yetmiyor.';
  end if;
  update public.material_balances
     set qty = qty + p_qty,
         value_try = value_try + p_value_try,
         value_usd = value_usd + p_value_usd,
         updated_at = now()
   where material_id = p_material_id;
  update public.material_movements
     set balance_qty_after = balance_qty_after + p_qty,
         balance_value_try_after = balance_value_try_after + p_value_try
   where material_id = p_material_id and id > p_from_movement_id;
end
$$;

-- Alışı yerinde düzenler. Döner: hareket id.
create or replace function public.update_material_purchase(
  p_movement_id bigint,
  p_qty numeric,
  p_unit text,
  p_unit_price numeric,
  p_currency text,
  p_fx_rate_id bigint,
  p_received_on date,
  p_supplier text default null,
  p_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orig public.material_movements;
  v_material public.raw_materials;
  v_fx public.fx_rates;
  v_date date;
  v_qty_base numeric;
  v_total numeric;
  v_value_try numeric;
  v_value_usd numeric;
begin
  perform private.assert_admin();
  v_orig := private.lock_editable_movement(p_movement_id, array['purchase']);
  select * into v_material from public.raw_materials where id = v_orig.material_id;
  v_date := coalesce(p_received_on, v_orig.movement_date);

  if p_qty is null or p_qty <= 0 then
    raise exception 'Giriş miktarı sıfırdan büyük olmalıdır.';
  end if;
  if p_unit_price is null or p_unit_price <= 0 then
    raise exception 'Birim fiyat sıfırdan büyük olmalıdır.';
  end if;
  if p_currency not in ('USD', 'TRY') then
    raise exception 'Para birimi USD veya TRY olmalıdır.';
  end if;
  if v_date > public.today_tr() then
    raise exception 'Gelecek tarihli giriş yapılamaz.';
  end if;

  v_fx := private.resolve_fx(p_fx_rate_id, v_date);
  v_qty_base := private.to_base_qty(p_qty, p_unit, v_material.unit_kind);
  v_total := round(p_qty * p_unit_price, 4);
  if v_total <= 0 then
    raise exception 'Giriş tutarı sıfırdan büyük olmalıdır.';
  end if;
  if p_currency = 'TRY' then
    v_value_try := v_total;
    v_value_usd := round(v_total / v_fx.rate, 6);
  else
    v_value_usd := v_total;
    v_value_try := round(v_total * v_fx.rate, 6);
  end if;

  perform private.shift_material_balance(
    v_orig.material_id, v_orig.id,
    v_qty_base - v_orig.qty, v_value_try - v_orig.value_try, v_value_usd - v_orig.value_usd
  );

  update public.material_movements
     set movement_date = v_date,
         qty = v_qty_base,
         value_try = v_value_try,
         value_usd = v_value_usd,
         unit_cost_try = v_value_try / v_qty_base,
         unit_cost_usd = v_value_usd / v_qty_base,
         entry_qty = p_qty,
         entry_unit = p_unit,
         currency = p_currency,
         unit_price = p_unit_price,
         total_amount = v_total,
         fx_rate_id = v_fx.id,
         fx_rate = v_fx.rate,
         supplier = nullif(btrim(p_supplier), ''),
         note = nullif(btrim(p_note), ''),
         balance_qty_after = balance_qty_after + (v_qty_base - v_orig.qty),
         balance_value_try_after = balance_value_try_after + (v_value_try - v_orig.value_try),
         corrected_at = now()
   where id = v_orig.id;

  return v_orig.id;
end
$$;

-- Alış veya fire hareketini siler. Stok ve ortalama maliyet hareket hiç yapılmamış gibi olur.
create or replace function public.delete_material_movement(p_movement_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orig public.material_movements;
begin
  perform private.assert_admin();
  v_orig := private.lock_editable_movement(p_movement_id, array['purchase', 'write_off']);
  perform private.shift_material_balance(v_orig.material_id, v_orig.id, -v_orig.qty, -v_orig.value_try, -v_orig.value_usd);
  delete from public.material_movements where id = v_orig.id;
end
$$;

comment on function public.update_material_purchase(bigint, numeric, text, numeric, text, bigint, date, text, text) is
  'Hammadde alışını yerinde düzenler; bakiye ve sonraki bakiye sütunları farkla güncellenir. Sonrasında tüketim/fire varsa reddeder.';
comment on function public.delete_material_movement(bigint) is
  'Hammadde alış veya fire hareketini siler; bakiye geri alınır. Sonrasında tüketim/fire varsa reddeder.';

do $$ begin perform private.lock_down_public_functions(); end $$;
