-- =====================================================================
-- Heatemp ERP — 2/8 Ürünler, varyantlar, hammaddeler, reçete (BOM)
-- Hammadde değerleme: hareketli ağırlıklı ortalama. Her giriş kendi günündeki
-- kurla hem TRY hem USD olarak değerlenir; bakiye yalnızca hareketlerle değişir.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ürünler ve varyantlar
-- Ürün düzeyindeki fiyat, süre ve eşikler varsayılandır; varyant isterse
-- kendi değerleriyle geçersiz kılar (NULL = ürünün değeri kullanılır).
-- ---------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  description text,
  image_path text,
  default_sale_price numeric(18, 4) check (default_sale_price >= 0),
  default_currency text not null default 'USD' check (default_currency in ('USD', 'TRY')),
  unit_production_minutes numeric(10, 2) not null default 0 check (unit_production_minutes >= 0),
  critical_stock integer not null default 0 check (critical_stock >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  target_stock integer not null default 0 check (target_stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_thresholds_order check (critical_stock <= min_stock and min_stock <= target_stock)
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  code text not null unique check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  sale_price numeric(18, 4) check (sale_price >= 0),
  currency text check (currency in ('USD', 'TRY')),
  unit_production_minutes numeric(10, 2) check (unit_production_minutes >= 0),
  critical_stock integer check (critical_stock >= 0),
  min_stock integer check (min_stock >= 0),
  target_stock integer check (target_stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, name),
  constraint product_variants_price_currency check ((sale_price is null) = (currency is null)),
  constraint product_variants_thresholds check (
    (critical_stock is null and min_stock is null and target_stock is null)
    or (critical_stock is not null and min_stock is not null and target_stock is not null
        and critical_stock <= min_stock and min_stock <= target_stock)
  )
);

create index product_variants_product_idx on public.product_variants (product_id);

create trigger products_updated_at before update on public.products
  for each row execute function private.set_updated_at();
create trigger product_variants_updated_at before update on public.product_variants
  for each row execute function private.set_updated_at();

-- Her ürün "Standart" adlı bir varyantla başlar; varyantı olmayan ürün olmaz.
create or replace function private.create_default_variant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.product_variants (product_id, code, name)
  values (new.id, new.code, 'Standart');
  return new;
end
$$;

create trigger products_default_variant after insert on public.products
  for each row execute function private.create_default_variant();

-- Varyantın geçerli (ürün varsayılanıyla birleşmiş) değerleri.
create view public.v_variants with (security_invoker = true) as
select
  v.id,
  v.product_id,
  p.code as product_code,
  p.name as product_name,
  v.code as variant_code,
  v.name as variant_name,
  p.name || ' — ' || v.name as display_name,
  p.image_path,
  coalesce(v.sale_price, p.default_sale_price) as sale_price,
  case when v.sale_price is not null then v.currency else p.default_currency end as currency,
  coalesce(v.unit_production_minutes, p.unit_production_minutes) as unit_production_minutes,
  coalesce(v.critical_stock, p.critical_stock) as critical_stock,
  coalesce(v.min_stock, p.min_stock) as min_stock,
  coalesce(v.target_stock, p.target_stock) as target_stock,
  v.sale_price is not null as price_overridden,
  v.unit_production_minutes is not null as minutes_overridden,
  v.critical_stock is not null as thresholds_overridden,
  v.is_active and p.is_active as is_active,
  v.is_active as variant_is_active,
  p.is_active as product_is_active,
  v.created_at
from public.product_variants v
join public.products p on p.id = v.product_id;

-- ---------------------------------------------------------------------
-- Hammaddeler ve henüz monte edilmemiş komponentler
-- ---------------------------------------------------------------------
create table public.raw_materials (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  kind text not null default 'raw' check (kind in ('raw', 'component')),
  unit_kind text not null check (unit_kind in ('count', 'mass', 'length', 'area', 'volume')),
  display_unit text not null references public.units (code),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.raw_materials.kind is 'raw = hammadde, component = rafta bekleyen, henüz ürüne monte edilmemiş parça';
comment on column public.raw_materials.display_unit is 'Ekranda gösterim ve varsayılan giriş birimi. Stok her zaman temel birimde tutulur.';

create trigger raw_materials_updated_at before update on public.raw_materials
  for each row execute function private.set_updated_at();

-- Bakiye: yalnızca hareket fonksiyonları tarafından, hareketle aynı işlemde güncellenir.
create table public.material_balances (
  material_id uuid primary key references public.raw_materials (id) on delete cascade,
  qty numeric(24, 6) not null default 0 check (qty >= 0),
  value_try numeric(24, 6) not null default 0 check (value_try >= 0),
  value_usd numeric(24, 6) not null default 0 check (value_usd >= 0),
  updated_at timestamptz not null default now(),
  check (qty > 0 or (value_try = 0 and value_usd = 0))
);

create table public.material_movements (
  id bigint generated always as identity primary key,
  material_id uuid not null references public.raw_materials (id) on delete restrict,
  movement_type text not null
    check (movement_type in ('purchase', 'production_consume', 'production_return', 'write_off')),
  movement_date date not null default public.today_tr(),
  qty numeric(24, 6) not null,
  value_try numeric(24, 6) not null,
  value_usd numeric(24, 6) not null,
  unit_cost_try numeric(24, 8) not null check (unit_cost_try >= 0),
  unit_cost_usd numeric(24, 8) not null check (unit_cost_usd >= 0),
  entry_qty numeric(24, 6),
  entry_unit text references public.units (code),
  currency text check (currency in ('USD', 'TRY')),
  unit_price numeric(18, 6) check (unit_price > 0),
  total_amount numeric(20, 4) check (total_amount > 0),
  fx_rate_id bigint references public.fx_rates (id),
  fx_rate numeric(18, 6) check (fx_rate > 0),
  supplier text,
  note text,
  batch_id uuid,
  balance_qty_after numeric(24, 6) not null,
  balance_value_try_after numeric(24, 6) not null,
  request_id uuid unique,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint material_movements_sign check (
    (movement_type in ('purchase', 'production_return') and qty > 0 and value_try >= 0 and value_usd >= 0)
    or (movement_type in ('production_consume', 'write_off') and qty < 0 and value_try <= 0 and value_usd <= 0)
  ),
  constraint material_movements_purchase_fields check (
    movement_type <> 'purchase'
    or (entry_qty > 0 and entry_unit is not null and currency is not null and unit_price is not null
        and total_amount is not null and fx_rate_id is not null and fx_rate is not null)
  )
);

create index material_movements_material_idx on public.material_movements (material_id, id desc);
create index material_movements_batch_idx on public.material_movements (batch_id) where batch_id is not null;

-- Yeni malzemenin bakiye satırı; birim türü ile gösterim birimi tutarlılığı.
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
  if tg_op = 'UPDATE' and new.unit_kind <> old.unit_kind then
    if exists (select 1 from public.material_movements where material_id = new.id)
       or exists (select 1 from public.bom_items where material_id = new.id) then
      raise exception 'Hareketi veya reçetesi olan malzemenin birim türü değiştirilemez.';
    end if;
  end if;
  return new;
end
$$;

create or replace function private.raw_materials_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.material_balances (material_id) values (new.id);
  return new;
end
$$;

create trigger raw_materials_after_insert after insert on public.raw_materials
  for each row execute function private.raw_materials_after_insert();

-- ---------------------------------------------------------------------
-- Reçete: bir adet varyant için gereken malzeme miktarı (temel birimde)
-- ---------------------------------------------------------------------
create table public.bom_items (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  material_id uuid not null references public.raw_materials (id) on delete restrict,
  entry_qty numeric(24, 6) not null check (entry_qty > 0),
  entry_unit text not null references public.units (code),
  qty_per_unit numeric(24, 6) not null check (qty_per_unit > 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (variant_id, material_id)
);

create index bom_items_material_idx on public.bom_items (material_id);

-- Hammadde tetikleyicisi bom_items tablosuna baktığı için tablo oluştuktan sonra bağlanır.
create trigger raw_materials_before_write before insert or update on public.raw_materials
  for each row execute function private.raw_materials_before_write();

create or replace function private.bom_items_normalize()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
begin
  select unit_kind into v_kind from public.raw_materials where id = new.material_id;
  if v_kind is null then
    raise exception 'Malzeme bulunamadı.';
  end if;
  new.qty_per_unit := private.to_base_qty(new.entry_qty, new.entry_unit, v_kind);
  if new.qty_per_unit <= 0 then
    raise exception 'Reçete miktarı çok küçük; daha büyük bir birim kullanın.';
  end if;
  new.updated_at := now();
  return new;
end
$$;

create trigger bom_items_normalize before insert or update on public.bom_items
  for each row execute function private.bom_items_normalize();

-- Başka bir varyantın reçetesini kopyalar (mevcut reçete satırlarını değiştirir).
create or replace function public.copy_bom(p_from_variant_id uuid, p_to_variant_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform private.assert_admin();
  if p_from_variant_id = p_to_variant_id then
    raise exception 'Kaynak ve hedef varyant aynı olamaz.';
  end if;
  if not exists (select 1 from public.bom_items where variant_id = p_from_variant_id) then
    raise exception 'Kaynak varyantın reçetesi boş.';
  end if;
  delete from public.bom_items where variant_id = p_to_variant_id;
  insert into public.bom_items (variant_id, material_id, entry_qty, entry_unit, qty_per_unit, note)
  select p_to_variant_id, material_id, entry_qty, entry_unit, qty_per_unit, note
    from public.bom_items where variant_id = p_from_variant_id;
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- ---------------------------------------------------------------------
-- Hammadde girişi (alış)
-- ---------------------------------------------------------------------
create or replace function public.receive_material(
  p_material_id uuid,
  p_qty numeric,
  p_unit text,
  p_unit_price numeric,
  p_currency text,
  p_fx_rate_id bigint,
  p_received_on date default null,
  p_supplier text default null,
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
    fx_rate_id, fx_rate, supplier, note, balance_qty_after, balance_value_try_after, request_id
  ) values (
    p_material_id, 'purchase', v_date, v_qty_base, v_value_try, v_value_usd,
    v_value_try / v_qty_base, v_value_usd / v_qty_base, p_qty, p_unit, p_currency, p_unit_price, v_total,
    v_fx.id, v_fx.rate, nullif(btrim(p_supplier), ''), nullif(btrim(p_note), ''),
    v_balance.qty + v_qty_base, v_balance.value_try + v_value_try, p_request_id
  ) returning id into v_id;

  return v_id;
end
$$;

-- Malzemeden ağırlıklı ortalama maliyetle çıkış yapar (iç kullanım).
-- Bakiye satırı çağıran tarafından kilitlenmiş olmalıdır.
create or replace function private.issue_material(
  p_material_id uuid,
  p_qty_base numeric,
  p_movement_type text,
  p_batch_id uuid,
  p_note text,
  p_request_id uuid
)
returns table (out_movement_id bigint, out_unit_cost_try numeric, out_unit_cost_usd numeric, out_value_try numeric, out_value_usd numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance public.material_balances;
  v_value_try numeric;
  v_value_usd numeric;
  v_movement_id bigint;
begin
  select * into v_balance from public.material_balances where material_id = p_material_id for update;
  if not found then
    raise exception 'Malzeme bakiyesi bulunamadı.';
  end if;
  if v_balance.qty < p_qty_base then
    raise exception 'Yetersiz stok (mevcut %, istenen %).', private.fmt_num(v_balance.qty), private.fmt_num(p_qty_base);
  end if;

  if v_balance.qty = p_qty_base then
    v_value_try := v_balance.value_try;
    v_value_usd := v_balance.value_usd;
  else
    v_value_try := least(round(v_balance.value_try * p_qty_base / v_balance.qty, 6), v_balance.value_try);
    v_value_usd := least(round(v_balance.value_usd * p_qty_base / v_balance.qty, 6), v_balance.value_usd);
  end if;

  update public.material_balances
     set qty = qty - p_qty_base,
         value_try = value_try - v_value_try,
         value_usd = value_usd - v_value_usd,
         updated_at = now()
   where material_id = p_material_id;

  insert into public.material_movements (
    material_id, movement_type, qty, value_try, value_usd, unit_cost_try, unit_cost_usd,
    batch_id, note, balance_qty_after, balance_value_try_after, request_id
  ) values (
    p_material_id, p_movement_type, -p_qty_base, -v_value_try, -v_value_usd,
    v_value_try / p_qty_base, v_value_usd / p_qty_base,
    p_batch_id, p_note, v_balance.qty - p_qty_base, v_balance.value_try - v_value_try, p_request_id
  ) returning id into v_movement_id;

  return query select v_movement_id, v_value_try / p_qty_base, v_value_usd / p_qty_base, v_value_try, v_value_usd;
end
$$;

-- Fire / sayım eksiği: ortalama maliyetle stoktan düşer, gerekçe zorunludur.
create or replace function public.write_off_material(
  p_material_id uuid,
  p_qty numeric,
  p_unit text,
  p_reason text,
  p_request_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_material public.raw_materials;
  v_qty_base numeric;
  v_available numeric;
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
    raise exception 'Düşülecek miktar sıfırdan büyük olmalıdır.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Stok düşümü için gerekçe yazılmalıdır.';
  end if;
  v_qty_base := private.to_base_qty(p_qty, p_unit, v_material.unit_kind);
  select qty into v_available from public.material_balances where material_id = p_material_id for update;
  if v_available < v_qty_base then
    raise exception 'Yetersiz stok: % için mevcut %, düşülmek istenen %.',
      v_material.name, private.fmt_num(v_available), private.fmt_num(v_qty_base);
  end if;
  select i.out_movement_id into v_id
    from private.issue_material(p_material_id, v_qty_base, 'write_off', null, btrim(p_reason), p_request_id) i;
  return v_id;
end
$$;

-- Malzeme listesi: bakiye, ortalama maliyet ve değerler.
create view public.v_materials with (security_invoker = true) as
select
  m.id,
  m.code,
  m.name,
  m.kind,
  m.unit_kind,
  bu.code as base_unit,
  m.display_unit,
  du.factor_to_base as display_factor,
  m.notes,
  m.is_active,
  b.qty,
  b.qty / du.factor_to_base as qty_display,
  b.value_try,
  b.value_usd,
  case when b.qty > 0 then b.value_try / b.qty end as avg_cost_try,
  case when b.qty > 0 then b.value_usd / b.qty end as avg_cost_usd,
  case when b.qty > 0 then b.value_try / b.qty * du.factor_to_base end as avg_cost_try_display,
  case when b.qty > 0 then b.value_usd / b.qty * du.factor_to_base end as avg_cost_usd_display,
  (select max(mm.movement_date) from public.material_movements mm
    where mm.material_id = m.id and mm.movement_type = 'purchase') as last_purchase_on,
  m.created_at
from public.raw_materials m
join public.material_balances b on b.material_id = m.id
join public.units bu on bu.kind = m.unit_kind and bu.is_base
join public.units du on du.code = m.display_unit;

-- ---------------------------------------------------------------------
-- Satır düzeyi güvenlik
-- ---------------------------------------------------------------------
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.raw_materials enable row level security;
alter table public.material_balances enable row level security;
alter table public.material_movements enable row level security;
alter table public.bom_items enable row level security;

-- Okuma: uygulama üyeleri. Ana veri yazma: yalnızca yönetici.
create policy products_select on public.products for select to authenticated
  using ((select public.is_app_member()));
create policy products_insert on public.products for insert to authenticated
  with check ((select public.is_admin()));
create policy products_update on public.products for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy products_delete on public.products for delete to authenticated
  using ((select public.is_admin()));

create policy product_variants_select on public.product_variants for select to authenticated
  using ((select public.is_app_member()));
create policy product_variants_insert on public.product_variants for insert to authenticated
  with check ((select public.is_admin()));
create policy product_variants_update on public.product_variants for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy product_variants_delete on public.product_variants for delete to authenticated
  using ((select public.is_admin()));

create policy raw_materials_select on public.raw_materials for select to authenticated
  using ((select public.is_app_member()));
create policy raw_materials_insert on public.raw_materials for insert to authenticated
  with check ((select public.is_admin()));
create policy raw_materials_update on public.raw_materials for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy raw_materials_delete on public.raw_materials for delete to authenticated
  using ((select public.is_admin()));

create policy bom_items_select on public.bom_items for select to authenticated
  using ((select public.is_app_member()));
create policy bom_items_insert on public.bom_items for insert to authenticated
  with check ((select public.is_admin()));
create policy bom_items_update on public.bom_items for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy bom_items_delete on public.bom_items for delete to authenticated
  using ((select public.is_admin()));

-- Bakiye ve hareket defteri: yalnızca okuma. Yazma sadece işlem fonksiyonlarıyla.
create policy material_balances_select on public.material_balances for select to authenticated
  using ((select public.is_app_member()));
create policy material_movements_select on public.material_movements for select to authenticated
  using ((select public.is_app_member()));

revoke all on public.products, public.product_variants, public.raw_materials, public.material_balances,
  public.material_movements, public.bom_items, public.v_variants, public.v_materials from anon;
revoke insert, update, delete, truncate on public.material_balances, public.material_movements from authenticated;
revoke truncate on public.products, public.product_variants, public.raw_materials, public.bom_items from authenticated;

do $$ begin perform private.lock_down_public_functions(); end $$;
