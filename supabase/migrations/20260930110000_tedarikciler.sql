-- =====================================================================
-- Heatemp ERP — 22 Tedarikçiler
-- Tedarikçi kartı; hammadde alışında tedarikçi listeden seçilir (supplier_id).
-- material_movements.supplier metni tedarikçi adının kopyasıdır (arama/gösterim);
-- tedarikçi adı değişince kopyalar da güncellenir. Eski serbest metinler karta dönüştürülür.
-- =====================================================================

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  tax_number text,
  contact_name text,
  phone text,
  email text,
  address text,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index suppliers_name_unique on public.suppliers (lower(btrim(name)));

create trigger suppliers_updated_at before update on public.suppliers
  for each row execute function private.set_updated_at();

alter table public.suppliers enable row level security;
create policy suppliers_select on public.suppliers for select to authenticated
  using ((select public.is_app_member()));
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check ((select public.is_admin()));
create policy suppliers_update on public.suppliers for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy suppliers_delete on public.suppliers for delete to authenticated
  using ((select public.is_admin()));

alter table public.material_movements
  add column if not exists supplier_id uuid references public.suppliers (id) on delete restrict;
create index if not exists material_movements_supplier_idx
  on public.material_movements (supplier_id) where supplier_id is not null;

-- Mevcut serbest metin tedarikçiler → tedarikçi kartı
insert into public.suppliers (name)
select distinct on (lower(btrim(supplier))) btrim(supplier)
  from public.material_movements
 where supplier is not null and btrim(supplier) <> ''
 order by lower(btrim(supplier)), btrim(supplier)
on conflict do nothing;

-- Yalnız bağlantı kurulur; satırdaki tedarikçi metni ve diğer tüm değerler olduğu gibi kalır.
update public.material_movements m
   set supplier_id = s.id
  from public.suppliers s
 where m.supplier_id is null and m.supplier is not null and lower(btrim(m.supplier)) = lower(btrim(s.name));

-- Tedarikçi adı değişince hareketlerdeki ad kopyası güncellenir.
create or replace function private.sync_supplier_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.material_movements set supplier = new.name where supplier_id = new.id;
  return new;
end
$$;

create trigger suppliers_sync_name after update of name on public.suppliers
  for each row when (old.name is distinct from new.name) execute function private.sync_supplier_name();

-- Seçilen tedarikçiyi doğrular (iç kullanım). Boşsa null.
create or replace function private.resolve_supplier(p_supplier_id uuid)
returns public.suppliers
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.suppliers;
begin
  if p_supplier_id is null then
    return null;
  end if;
  select * into v from public.suppliers where id = p_supplier_id;
  if not found then
    raise exception 'Tedarikçi bulunamadı.';
  end if;
  return v;
end
$$;

-- ---------------------------------------------------------------------
-- Stok girişi: serbest metin yerine tedarikçi kimliği
-- ---------------------------------------------------------------------
drop function if exists public.receive_material(uuid, numeric, text, numeric, text, bigint, date, text, text, uuid);

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
  p_request_id uuid default null
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
    fx_rate_id, fx_rate, supplier_id, supplier, note, balance_qty_after, balance_value_try_after, request_id
  ) values (
    p_material_id, 'purchase', v_date, v_qty_base, v_value_try, v_value_usd,
    v_value_try / v_qty_base, v_value_usd / v_qty_base, p_qty, p_unit, p_currency, p_unit_price, v_total,
    v_fx.id, v_fx.rate, v_supplier.id, v_supplier.name, nullif(btrim(p_note), ''),
    v_balance.qty + v_qty_base, v_balance.value_try + v_value_try, p_request_id
  ) returning id into v_id;

  return v_id;
end
$$;

-- ---------------------------------------------------------------------
-- Alış düzenleme: serbest metin yerine tedarikçi kimliği
-- ---------------------------------------------------------------------
drop function if exists public.update_material_purchase(bigint, numeric, text, numeric, text, bigint, date, text, text);

create or replace function public.update_material_purchase(
  p_movement_id bigint,
  p_qty numeric,
  p_unit text,
  p_unit_price numeric,
  p_currency text,
  p_fx_rate_id bigint,
  p_received_on date,
  p_supplier_id uuid default null,
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
  v_supplier public.suppliers;
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
  v_supplier := private.resolve_supplier(p_supplier_id);

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
         supplier_id = v_supplier.id,
         supplier = v_supplier.name,
         note = nullif(btrim(p_note), ''),
         balance_qty_after = balance_qty_after + (v_qty_base - v_orig.qty),
         balance_value_try_after = balance_value_try_after + (v_value_try - v_orig.value_try),
         corrected_at = now()
   where id = v_orig.id;

  return v_orig.id;
end
$$;

comment on function public.update_material_purchase(bigint, numeric, text, numeric, text, bigint, date, uuid, text) is
  'Hammadde alışını yerinde düzenler; bakiye ve sonraki bakiye sütunları farkla güncellenir. Sonrasında tüketim/fire varsa reddeder.';

-- ---------------------------------------------------------------------
-- Tedarikçi listesi: alış sayısı ve ödenen tutar (alış günü kuruyla TL; USD bilgi)
-- ---------------------------------------------------------------------
create or replace view public.v_supplier_list with (security_invoker = true) as
select s.*,
       coalesce(a.purchase_count, 0) as purchase_count,
       coalesce(a.material_count, 0) as material_count,
       coalesce(a.total_try, 0) as total_try,
       coalesce(a.total_usd, 0) as total_usd,
       a.last_purchase_date
  from public.suppliers s
  left join (
    select supplier_id,
           count(*) as purchase_count,
           count(distinct material_id) as material_count,
           round(sum(value_try), 2) as total_try,
           round(sum(value_usd), 2) as total_usd,
           max(movement_date) as last_purchase_date
      from public.material_movements
     where movement_type = 'purchase' and supplier_id is not null
     group by supplier_id
  ) a on a.supplier_id = s.id;

comment on view public.v_supplier_list is 'Tedarikçiler ve toplam alış tutarları (alış günü kuruyla TL; USD bilgi amaçlı).';

do $$ begin perform private.lock_down_public_functions(); end $$;
do $$ begin perform private.lock_down_public_views(); end $$;
