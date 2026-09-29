-- =====================================================================
-- Heatemp ERP — 23 KDV ve stok seyri dönemleri
-- 1) Hammaddeye KDV oranı (varsayılan %20); alışta KDV oranı ve KDV tutarı saklanır.
--    KDV maliyete girmez (ortalama maliyet KDV hariç); tedarikçiye ödenen tutarda gösterilir.
--    KDV tutarı verilmezse oran × tutar (2 ondalık) hesaplanır; faturadaki tutar elle girilebilir.
-- 2) material_flows: malzeme giriş/çıkışı gün, hafta, ay veya yıl bazında.
-- =====================================================================

alter table public.raw_materials
  add column if not exists vat_rate numeric(5, 2) not null default 20 check (vat_rate >= 0 and vat_rate <= 100);
comment on column public.raw_materials.vat_rate is 'Alışlarda önerilen KDV oranı (%).';

alter table public.material_movements
  add column if not exists vat_rate numeric(5, 2) check (vat_rate >= 0 and vat_rate <= 100),
  add column if not exists vat_amount numeric(18, 4) check (vat_amount >= 0);
alter table public.material_movements drop constraint if exists material_movements_vat_purchase;
alter table public.material_movements add constraint material_movements_vat_purchase
  check (movement_type = 'purchase' or (vat_rate is null and vat_amount is null));
comment on column public.material_movements.vat_amount is 'Alış KDV tutarı (alış para biriminde); maliyete dahil değildir.';

-- ---------------------------------------------------------------------
-- Stok girişi ve alış düzenleme: KDV oranı / tutarı
-- ---------------------------------------------------------------------
drop function if exists public.receive_material(uuid, numeric, text, numeric, text, bigint, date, uuid, text, uuid);

create or replace function public.receive_material(
  p_material_id uuid,
  p_qty numeric,
  p_unit text,
  p_unit_price numeric,
  p_currency text,
  p_fx_rate_id bigint,
  p_received_on date default null,
  p_supplier_id uuid default null,
  p_note text default null,
  p_request_id uuid default null,
  p_vat_rate numeric default null,
  p_vat_amount numeric default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_material public.raw_materials;
  v_balance public.material_balances;
  v_supplier public.suppliers;
  v_fx public.fx_rates;
  v_date date := coalesce(p_received_on, public.today_tr());
  v_qty_base numeric;
  v_total numeric;
  v_value_try numeric;
  v_value_usd numeric;
  v_id bigint;
  v_vat_rate numeric;
  v_vat_amount numeric;
begin
  perform private.assert_admin();
  perform private.claim_request(p_request_id);
  if p_request_id is not null then
    select id into v_id from public.material_movements where request_id = p_request_id;
    if found then
      return v_id;
    end if;
  end if;

  select * into v_material from public.raw_materials where id = p_material_id;
  if not found then
    raise exception 'Malzeme bulunamadı.';
  end if;
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
  v_supplier := private.resolve_supplier(p_supplier_id);

  v_fx := private.resolve_fx(p_fx_rate_id, v_date);
  v_qty_base := private.to_base_qty(p_qty, p_unit, v_material.unit_kind);
  v_total := round(p_qty * p_unit_price, 4);
  if v_total <= 0 then
    raise exception 'Giriş tutarı sıfırdan büyük olmalıdır.';
  end if;
  v_vat_rate := coalesce(p_vat_rate, v_material.vat_rate);
  if v_vat_rate < 0 or v_vat_rate > 100 then
    raise exception 'KDV oranı 0 ile 100 arasında olmalıdır.';
  end if;
  v_vat_amount := coalesce(p_vat_amount, round(v_total * v_vat_rate / 100, 2));
  if v_vat_amount < 0 then
    raise exception 'KDV tutarı negatif olamaz.';
  end if;
  if p_currency = 'TRY' then
    v_value_try := v_total;
    v_value_usd := round(v_total / v_fx.rate, 6);
  else
    v_value_usd := v_total;
    v_value_try := round(v_total * v_fx.rate, 6);
  end if;

  select * into v_balance from public.material_balances where material_id = p_material_id for update;

  update public.material_balances
     set qty = qty + v_qty_base,
         value_try = value_try + v_value_try,
         value_usd = value_usd + v_value_usd,
         updated_at = now()
   where material_id = p_material_id;

  insert into public.material_movements (
    material_id, movement_type, movement_date, qty, value_try, value_usd,
    unit_cost_try, unit_cost_usd, entry_qty, entry_unit, currency, unit_price, total_amount,
    fx_rate_id, fx_rate, supplier_id, supplier, note, balance_qty_after, balance_value_try_after, request_id,
    vat_rate, vat_amount
  ) values (
    p_material_id, 'purchase', v_date, v_qty_base, v_value_try, v_value_usd,
    v_value_try / v_qty_base, v_value_usd / v_qty_base, p_qty, p_unit, p_currency, p_unit_price, v_total,
    v_fx.id, v_fx.rate, v_supplier.id, v_supplier.name, nullif(btrim(p_note), ''),
    v_balance.qty + v_qty_base, v_balance.value_try + v_value_try, p_request_id,
    v_vat_rate, v_vat_amount
  ) returning id into v_id;

  return v_id;
end
$$;

drop function if exists public.update_material_purchase(bigint, numeric, text, numeric, text, bigint, date, uuid, text);

create or replace function public.update_material_purchase(
  p_movement_id bigint,
  p_qty numeric,
  p_unit text,
  p_unit_price numeric,
  p_currency text,
  p_fx_rate_id bigint,
  p_received_on date,
  p_supplier_id uuid default null,
  p_note text default null,
  p_vat_rate numeric default null,
  p_vat_amount numeric default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orig public.material_movements;
  v_material public.raw_materials;
  v_supplier public.suppliers;
  v_fx public.fx_rates;
  v_date date;
  v_qty_base numeric;
  v_total numeric;
  v_value_try numeric;
  v_value_usd numeric;
  v_vat_rate numeric;
  v_vat_amount numeric;
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
  v_supplier := private.resolve_supplier(p_supplier_id);

  v_fx := private.resolve_fx(p_fx_rate_id, v_date);
  v_qty_base := private.to_base_qty(p_qty, p_unit, v_material.unit_kind);
  v_total := round(p_qty * p_unit_price, 4);
  if v_total <= 0 then
    raise exception 'Giriş tutarı sıfırdan büyük olmalıdır.';
  end if;
  v_vat_rate := coalesce(p_vat_rate, v_material.vat_rate);
  if v_vat_rate < 0 or v_vat_rate > 100 then
    raise exception 'KDV oranı 0 ile 100 arasında olmalıdır.';
  end if;
  v_vat_amount := coalesce(p_vat_amount, round(v_total * v_vat_rate / 100, 2));
  if v_vat_amount < 0 then
    raise exception 'KDV tutarı negatif olamaz.';
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
         supplier_id = v_supplier.id,
         supplier = v_supplier.name,
         note = nullif(btrim(p_note), ''),
         vat_rate = v_vat_rate,
         vat_amount = v_vat_amount,
         balance_qty_after = balance_qty_after + (v_qty_base - v_orig.qty),
         balance_value_try_after = balance_value_try_after + (v_value_try - v_orig.value_try),
         corrected_at = now()
   where id = v_orig.id;

  return v_orig.id;
end
$$;

comment on function public.update_material_purchase(bigint, numeric, text, numeric, text, bigint, date, uuid, text, numeric, numeric) is
  'Hammadde alışını yerinde düzenler; bakiye ve sonraki bakiye sütunları farkla güncellenir. Sonrasında tüketim/fire varsa reddeder.';

-- ---------------------------------------------------------------------
-- Tedarikçi listesi: KDV toplamı (TL, alış günü kuruyla) sona eklenir
-- ---------------------------------------------------------------------
create or replace view public.v_supplier_list with (security_invoker = true) as
select s.*,
       coalesce(a.purchase_count, 0) as purchase_count,
       coalesce(a.material_count, 0) as material_count,
       coalesce(a.total_try, 0) as total_try,
       coalesce(a.total_usd, 0) as total_usd,
       a.last_purchase_date,
       coalesce(a.vat_try, 0) as vat_try
  from public.suppliers s
  left join (
    select supplier_id,
           count(*) as purchase_count,
           count(distinct material_id) as material_count,
           round(sum(value_try), 2) as total_try,
           round(sum(value_usd), 2) as total_usd,
           max(movement_date) as last_purchase_date,
           round(sum(case when currency = 'TRY' then coalesce(vat_amount, 0) else coalesce(vat_amount, 0) * fx_rate end), 2) as vat_try
      from public.material_movements
     where movement_type = 'purchase' and supplier_id is not null
     group by supplier_id
  ) a on a.supplier_id = s.id;

comment on view public.v_supplier_list is
  'Tedarikçiler ve toplam alış tutarları (KDV hariç, alış günü kuruyla TL; USD bilgi) ve KDV toplamı (TL).';

-- ---------------------------------------------------------------------
-- Stok seyri: gün / hafta / ay / yıl bazında giriş ve çıkış (temel birim)
-- ---------------------------------------------------------------------
create or replace function public.material_flows(p_material_id uuid, p_grain text default 'ay', p_from date default null)
returns table (bucket date, in_qty numeric, out_qty numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    date_trunc(case p_grain when 'gun' then 'day' when 'hafta' then 'week' when 'yil' then 'year' else 'month' end,
               mm.movement_date::timestamp)::date,
    coalesce(sum(mm.qty) filter (where mm.qty > 0), 0),
    coalesce(-sum(mm.qty) filter (where mm.qty < 0), 0)
  from public.material_movements mm
  where mm.material_id = p_material_id
    and (p_from is null or mm.movement_date >= p_from)
  group by 1
  order by 1
$$;

comment on function public.material_flows(uuid, text, date) is
  'Malzemenin giriş/çıkış miktarı (temel birim) gün (gun), hafta (hafta, pazartesi), ay (ay) veya yıl (yil) bazında.';

do $$ begin perform private.lock_down_public_functions(); end $$;
do $$ begin perform private.lock_down_public_views(); end $$;
