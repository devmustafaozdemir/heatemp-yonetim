-- =====================================================================
-- Heatemp ERP — 3/8 Üretim simülasyonu, üretim partileri, mamul stok katmanları
-- Başlat: hammadde ortalama maliyetle düşer, birim maliyetler partiye sabitlenir.
-- Tamamla: parti Heatemp rafına tek bir stok katmanı olarak girer.
-- İptal (yalnızca üretimdeyken): tüketilen malzeme aynı maliyetle bir kez iade edilir.
-- =====================================================================

create sequence public.production_batch_no_seq;

create or replace function private.next_doc_no(p_prefix text, p_seq regclass)
returns text
language sql
volatile
set search_path = ''
as $$
  select p_prefix || '-' || to_char(public.today_tr(), 'YYYY') || '-' || lpad(nextval(p_seq)::text, 5, '0')
$$;

create table public.production_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no text not null unique,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  status text not null default 'in_production' check (status in ('in_production', 'completed', 'cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  unit_production_minutes numeric(10, 2) not null check (unit_production_minutes >= 0),
  estimated_minutes numeric(14, 2) not null check (estimated_minutes >= 0),
  actual_minutes numeric(14, 2),
  fx_rate_id bigint not null references public.fx_rates (id),
  fx_rate numeric(18, 6) not null check (fx_rate > 0),
  total_cost_try numeric(24, 6) not null default 0 check (total_cost_try >= 0),
  total_cost_usd numeric(24, 6) not null default 0 check (total_cost_usd >= 0),
  unit_cost_try numeric(24, 8) not null default 0 check (unit_cost_try >= 0),
  unit_cost_usd numeric(24, 8) not null default 0 check (unit_cost_usd >= 0),
  sale_price_snapshot numeric(18, 4),
  sale_currency_snapshot text,
  note text,
  request_id uuid unique,
  started_by uuid default auth.uid() references auth.users (id) on delete set null,
  completed_by uuid references auth.users (id) on delete set null,
  cancelled_by uuid references auth.users (id) on delete set null,
  unique (id, variant_id),
  constraint production_batches_completed check ((status = 'completed') = (completed_at is not null)),
  constraint production_batches_cancelled check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint production_batches_times check (completed_at is null or completed_at >= started_at)
);

create index production_batches_variant_idx on public.production_batches (variant_id, completed_at);
create index production_batches_status_idx on public.production_batches (status);

alter table public.material_movements
  add constraint material_movements_batch_fk foreign key (batch_id)
  references public.production_batches (id) on delete restrict;

-- Durum geçişleri: Üretimde → Tamamlandı | İptal. Başka geçiş yoktur.
create or replace function private.production_batches_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if old.status <> 'in_production' then
      raise exception 'Parti % durumu "%" iken değiştirilemez.', old.batch_no,
        case old.status when 'completed' then 'Tamamlandı' else 'İptal' end;
    end if;
  end if;
  if new.variant_id <> old.variant_id or new.quantity <> old.quantity or new.batch_no <> old.batch_no
     or new.started_at <> old.started_at or new.fx_rate_id <> old.fx_rate_id then
    raise exception 'Parti kimlik bilgileri değiştirilemez.';
  end if;
  if old.status <> 'in_production' and (
       new.total_cost_try <> old.total_cost_try or new.unit_cost_try <> old.unit_cost_try
       or new.total_cost_usd <> old.total_cost_usd or new.unit_cost_usd <> old.unit_cost_usd) then
    raise exception 'Kapanmış partinin maliyeti değiştirilemez.';
  end if;
  return new;
end
$$;

create trigger production_batches_guard before update on public.production_batches
  for each row execute function private.production_batches_guard();

create table public.production_consumptions (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.production_batches (id) on delete restrict,
  material_id uuid not null references public.raw_materials (id) on delete restrict,
  qty_per_unit numeric(24, 6) not null check (qty_per_unit > 0),
  qty numeric(24, 6) not null check (qty > 0),
  unit_cost_try numeric(24, 8) not null check (unit_cost_try >= 0),
  unit_cost_usd numeric(24, 8) not null check (unit_cost_usd >= 0),
  total_try numeric(24, 6) not null check (total_try >= 0),
  total_usd numeric(24, 6) not null check (total_usd >= 0),
  consume_movement_id bigint not null unique references public.material_movements (id),
  return_movement_id bigint unique references public.material_movements (id),
  unique (batch_id, material_id)
);

-- ---------------------------------------------------------------------
-- Mamul stok katmanları: her katman bir partinin belirli bir raftaki payıdır.
-- Heatemp katmanı parti tamamlanınca, Mekonsis katmanı teslimatla oluşur.
-- ---------------------------------------------------------------------
create table public.stock_layers (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null,
  batch_id uuid not null,
  location text not null check (location in ('heatemp', 'mekonsis')),
  delivery_id uuid,
  source_layer_id uuid references public.stock_layers (id),
  qty_in integer not null check (qty_in > 0),
  qty_out integer not null default 0 check (qty_out >= 0),
  qty_remaining integer generated always as (qty_in - qty_out) stored,
  unit_cost_try numeric(24, 8) not null check (unit_cost_try >= 0),
  unit_cost_usd numeric(24, 8) not null check (unit_cost_usd >= 0),
  received_on date not null,
  received_at timestamptz not null default now(),
  -- FIFO sırası: aynı gün/aynı işlemde oluşan katmanlar oluşturulma sırasıyla tüketilir.
  fifo_seq bigint generated always as identity,
  constraint stock_layers_no_negative check (qty_out <= qty_in),
  constraint stock_layers_batch_variant foreign key (batch_id, variant_id)
    references public.production_batches (id, variant_id),
  constraint stock_layers_location_refs check (
    (location = 'heatemp' and delivery_id is null and source_layer_id is null)
    or (location = 'mekonsis' and delivery_id is not null and source_layer_id is not null)
  )
);

create unique index stock_layers_heatemp_batch on public.stock_layers (batch_id) where location = 'heatemp';
create index stock_layers_fifo on public.stock_layers (variant_id, location, received_on, fifo_seq)
  where qty_out < qty_in;

create table public.stock_movements (
  id bigint generated always as identity primary key,
  layer_id uuid not null references public.stock_layers (id) on delete restrict,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  batch_id uuid not null references public.production_batches (id) on delete restrict,
  location text not null check (location in ('heatemp', 'mekonsis')),
  movement_type text not null
    check (movement_type in ('production_in', 'delivery_out', 'delivery_in', 'sale_out', 'sale_return')),
  qty integer not null,
  unit_cost_try numeric(24, 8) not null,
  unit_cost_usd numeric(24, 8) not null,
  movement_date date not null,
  delivery_id uuid,
  sale_id uuid,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint stock_movements_sign check (
    (movement_type in ('production_in', 'delivery_in', 'sale_return') and qty > 0)
    or (movement_type in ('delivery_out', 'sale_out') and qty < 0)
  ),
  constraint stock_movements_location check (
    (movement_type in ('production_in', 'delivery_out') and location = 'heatemp')
    or (movement_type in ('delivery_in', 'sale_out', 'sale_return') and location = 'mekonsis')
  )
);

create index stock_movements_layer_idx on public.stock_movements (layer_id);
create index stock_movements_variant_idx on public.stock_movements (variant_id, movement_date);

-- ---------------------------------------------------------------------
-- Üretim simülasyonu (stok düşürmez)
-- ---------------------------------------------------------------------
create or replace function public.simulate_production(p_variant_id uuid, p_quantity integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_variant public.v_variants;
  v_result jsonb;
begin
  perform private.assert_member();
  select * into v_variant from public.v_variants where id = p_variant_id;
  if not found then
    raise exception 'Varyant bulunamadı.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Adet sıfırdan büyük olmalıdır.';
  end if;

  with lines as (
    select
      b.material_id,
      m.code,
      m.name,
      m.kind,
      bu.code as base_unit,
      m.display_unit,
      du.factor_to_base as display_factor,
      b.qty_per_unit,
      b.qty_per_unit * p_quantity as required,
      bal.qty as available,
      greatest(b.qty_per_unit * p_quantity - bal.qty, 0) as shortage,
      floor(bal.qty / b.qty_per_unit) as max_units,
      case when bal.qty > 0 then bal.value_try / bal.qty else lp.unit_cost_try end as unit_cost_try,
      case when bal.qty > 0 then bal.value_usd / bal.qty else lp.unit_cost_usd end as unit_cost_usd,
      case when bal.qty > 0 then 'average' when lp.unit_cost_try is not null then 'last_purchase' else 'none' end
        as cost_basis
    from public.bom_items b
    join public.raw_materials m on m.id = b.material_id
    join public.material_balances bal on bal.material_id = m.id
    join public.units bu on bu.kind = m.unit_kind and bu.is_base
    join public.units du on du.code = m.display_unit
    left join lateral (
      select mm.unit_cost_try, mm.unit_cost_usd
        from public.material_movements mm
       where mm.material_id = m.id and mm.movement_type = 'purchase'
       order by mm.movement_date desc, mm.id desc
       limit 1
    ) lp on true
    where b.variant_id = p_variant_id
  ),
  costed as (
    select l.*,
           l.required * l.unit_cost_try as line_cost_try,
           l.required * l.unit_cost_usd as line_cost_usd
      from lines l
  )
  select jsonb_build_object(
    'variant', jsonb_build_object(
      'id', v_variant.id,
      'display_name', v_variant.display_name,
      'product_name', v_variant.product_name,
      'variant_name', v_variant.variant_name,
      'sale_price', v_variant.sale_price,
      'currency', v_variant.currency,
      'is_active', v_variant.is_active
    ),
    'quantity', p_quantity,
    'unit_production_minutes', v_variant.unit_production_minutes,
    'estimated_minutes', v_variant.unit_production_minutes * p_quantity,
    'has_bom', count(*) > 0,
    'max_producible', coalesce(min(max_units), 0),
    'all_available', coalesce(bool_and(shortage = 0), false),
    'can_start', count(*) > 0 and coalesce(bool_and(shortage = 0), false) and v_variant.is_active,
    'cost_complete', coalesce(bool_and(cost_basis <> 'none'), false),
    'total_cost_try', round(sum(line_cost_try), 4),
    'total_cost_usd', round(sum(line_cost_usd), 4),
    'unit_cost_try', round(sum(line_cost_try) / p_quantity, 4),
    'unit_cost_usd', round(sum(line_cost_usd) / p_quantity, 4),
    'lines', coalesce(jsonb_agg(jsonb_build_object(
      'material_id', material_id,
      'code', code,
      'name', name,
      'kind', kind,
      'base_unit', base_unit,
      'display_unit', display_unit,
      'display_factor', display_factor,
      'qty_per_unit', qty_per_unit,
      'required', required,
      'available', available,
      'shortage', shortage,
      'max_units', max_units,
      'unit_cost_try', unit_cost_try,
      'unit_cost_usd', unit_cost_usd,
      'cost_basis', cost_basis,
      'line_cost_try', round(line_cost_try, 4),
      'line_cost_usd', round(line_cost_usd, 4)
    ) order by name), '[]'::jsonb)
  ) into v_result
  from costed;

  return v_result;
end
$$;

-- ---------------------------------------------------------------------
-- Üretimi başlat
-- ---------------------------------------------------------------------
create or replace function public.start_production(
  p_variant_id uuid,
  p_quantity integer,
  p_fx_rate_id bigint,
  p_note text default null,
  p_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant public.v_variants;
  v_fx public.fx_rates;
  v_batch_id uuid;
  v_line record;
  v_issue record;
  v_shortages text;
  v_total_try numeric := 0;
  v_total_usd numeric := 0;
begin
  perform private.assert_admin();
  perform private.claim_request(p_request_id);
  if p_request_id is not null then
    select id into v_batch_id from public.production_batches where request_id = p_request_id;
    if found then
      return v_batch_id;
    end if;
  end if;

  select * into v_variant from public.v_variants where id = p_variant_id;
  if not found then
    raise exception 'Varyant bulunamadı.';
  end if;
  if not v_variant.is_active then
    raise exception '% pasif durumda; üretim başlatılamaz.', v_variant.display_name;
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Üretim adedi sıfırdan büyük olmalıdır.';
  end if;
  if not exists (select 1 from public.bom_items where variant_id = p_variant_id) then
    raise exception '% için reçete (BOM) tanımlı değil.', v_variant.display_name;
  end if;
  v_fx := private.resolve_fx(p_fx_rate_id, public.today_tr());

  -- Malzeme bakiyelerini sabit sırayla kilitle (kilitlenme ve çift tüketime karşı).
  perform 1
     from public.material_balances bal
    where bal.material_id in (select material_id from public.bom_items where variant_id = p_variant_id)
    order by bal.material_id
      for update;

  select string_agg(format('%s (gerekli %s %s, mevcut %s %s)',
                           m.name,
                           private.fmt_num(b.qty_per_unit * p_quantity / du.factor_to_base), m.display_unit,
                           private.fmt_num(bal.qty / du.factor_to_base), m.display_unit), '; ' order by m.name)
    into v_shortages
    from public.bom_items b
    join public.raw_materials m on m.id = b.material_id
    join public.material_balances bal on bal.material_id = b.material_id
    join public.units du on du.code = m.display_unit
   where b.variant_id = p_variant_id
     and bal.qty < b.qty_per_unit * p_quantity;

  if v_shortages is not null then
    raise exception 'Yetersiz hammadde: %', v_shortages;
  end if;

  insert into public.production_batches (
    batch_no, variant_id, quantity, unit_production_minutes, estimated_minutes,
    fx_rate_id, fx_rate, sale_price_snapshot, sale_currency_snapshot, note, request_id
  ) values (
    private.next_doc_no('PRT', 'public.production_batch_no_seq'), p_variant_id, p_quantity,
    v_variant.unit_production_minutes, v_variant.unit_production_minutes * p_quantity,
    v_fx.id, v_fx.rate, v_variant.sale_price, v_variant.currency, nullif(btrim(p_note), ''), p_request_id
  ) returning id into v_batch_id;

  for v_line in
    select b.material_id, b.qty_per_unit, b.qty_per_unit * p_quantity as qty
      from public.bom_items b
     where b.variant_id = p_variant_id
     order by b.material_id
  loop
    select * into v_issue
      from private.issue_material(v_line.material_id, v_line.qty, 'production_consume', v_batch_id, null, null);

    insert into public.production_consumptions (
      batch_id, material_id, qty_per_unit, qty, unit_cost_try, unit_cost_usd, total_try, total_usd,
      consume_movement_id
    ) values (
      v_batch_id, v_line.material_id, v_line.qty_per_unit, v_line.qty, v_issue.out_unit_cost_try,
      v_issue.out_unit_cost_usd, v_issue.out_value_try, v_issue.out_value_usd, v_issue.out_movement_id
    );

    v_total_try := v_total_try + v_issue.out_value_try;
    v_total_usd := v_total_usd + v_issue.out_value_usd;
  end loop;

  update public.production_batches
     set total_cost_try = v_total_try,
         total_cost_usd = v_total_usd,
         unit_cost_try = v_total_try / p_quantity,
         unit_cost_usd = v_total_usd / p_quantity
   where id = v_batch_id;

  return v_batch_id;
end
$$;

-- ---------------------------------------------------------------------
-- Üretimi tamamla → Heatemp rafı
-- ---------------------------------------------------------------------
create or replace function public.complete_production(p_batch_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.production_batches;
  v_layer_id uuid;
  v_now timestamptz := now();
begin
  perform private.assert_admin();
  select * into v_batch from public.production_batches where id = p_batch_id for update;
  if not found then
    raise exception 'Parti bulunamadı.';
  end if;
  if v_batch.status = 'completed' then
    raise exception 'Parti % zaten tamamlanmış.', v_batch.batch_no;
  end if;
  if v_batch.status = 'cancelled' then
    raise exception 'Parti % iptal edilmiş; tamamlanamaz.', v_batch.batch_no;
  end if;

  perform private.lock_variant_stock(v_batch.variant_id);

  update public.production_batches
     set status = 'completed',
         completed_at = v_now,
         completed_by = auth.uid(),
         actual_minutes = round((extract(epoch from (v_now - started_at)) / 60)::numeric, 2)
   where id = p_batch_id;

  insert into public.stock_layers (
    variant_id, batch_id, location, qty_in, unit_cost_try, unit_cost_usd, received_on, received_at
  ) values (
    v_batch.variant_id, v_batch.id, 'heatemp', v_batch.quantity, v_batch.unit_cost_try,
    v_batch.unit_cost_usd, public.today_tr(), v_now
  ) returning id into v_layer_id;

  insert into public.stock_movements (
    layer_id, variant_id, batch_id, location, movement_type, qty, unit_cost_try, unit_cost_usd, movement_date
  ) values (
    v_layer_id, v_batch.variant_id, v_batch.id, 'heatemp', 'production_in', v_batch.quantity,
    v_batch.unit_cost_try, v_batch.unit_cost_usd, public.today_tr()
  );

  return p_batch_id;
end
$$;

-- ---------------------------------------------------------------------
-- Üretimi iptal et → tüketilen malzeme bir kez, tüketildiği maliyetle iade edilir
-- ---------------------------------------------------------------------
create or replace function public.cancel_production(p_batch_id uuid, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.production_batches;
  v_line record;
  v_balance public.material_balances;
  v_movement_id bigint;
begin
  perform private.assert_admin();
  select * into v_batch from public.production_batches where id = p_batch_id for update;
  if not found then
    raise exception 'Parti bulunamadı.';
  end if;
  if v_batch.status = 'cancelled' then
    raise exception 'Parti % zaten iptal edilmiş; malzeme iadesi daha önce yapıldı.', v_batch.batch_no;
  end if;
  if v_batch.status = 'completed' then
    raise exception 'Parti % tamamlanmış; tamamlanan parti iptal edilemez.', v_batch.batch_no;
  end if;

  perform 1
     from public.material_balances bal
    where bal.material_id in (select material_id from public.production_consumptions where batch_id = p_batch_id)
    order by bal.material_id
      for update;

  for v_line in
    select * from public.production_consumptions
     where batch_id = p_batch_id
     order by material_id
  loop
    if v_line.return_movement_id is not null then
      raise exception 'Bu partinin malzemesi zaten iade edilmiş.';
    end if;

    select * into v_balance from public.material_balances where material_id = v_line.material_id;

    update public.material_balances
       set qty = qty + v_line.qty,
           value_try = value_try + v_line.total_try,
           value_usd = value_usd + v_line.total_usd,
           updated_at = now()
     where material_id = v_line.material_id;

    insert into public.material_movements (
      material_id, movement_type, qty, value_try, value_usd, unit_cost_try, unit_cost_usd,
      batch_id, note, balance_qty_after, balance_value_try_after
    ) values (
      v_line.material_id, 'production_return', v_line.qty, v_line.total_try, v_line.total_usd,
      v_line.unit_cost_try, v_line.unit_cost_usd, p_batch_id, 'Parti iptali: ' || v_batch.batch_no,
      v_balance.qty + v_line.qty, v_balance.value_try + v_line.total_try
    ) returning id into v_movement_id;

    update public.production_consumptions set return_movement_id = v_movement_id where id = v_line.id;
  end loop;

  update public.production_batches
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancel_reason = nullif(btrim(p_reason), '')
   where id = p_batch_id;

  return p_batch_id;
end
$$;

-- ---------------------------------------------------------------------
-- Görünümler
-- ---------------------------------------------------------------------
create view public.v_batches with (security_invoker = true) as
with completed as (
  select
    b.id,
    lag(b.batch_no) over w as prev_batch_no,
    lag(b.unit_cost_usd) over w as prev_unit_cost_usd,
    lag(b.unit_cost_try) over w as prev_unit_cost_try
  from public.production_batches b
  where b.status = 'completed'
  window w as (partition by b.variant_id order by b.completed_at, b.batch_no)
)
select
  b.id,
  b.batch_no,
  b.variant_id,
  v.product_id,
  v.product_code,
  v.product_name,
  v.variant_code,
  v.variant_name,
  v.display_name,
  v.sale_price as current_sale_price,
  v.currency as current_currency,
  b.quantity,
  b.status,
  b.started_at,
  b.completed_at,
  b.cancelled_at,
  b.cancel_reason,
  b.unit_production_minutes,
  b.estimated_minutes,
  coalesce(b.actual_minutes, round((extract(epoch from (now() - b.started_at)) / 60)::numeric, 2)) as elapsed_minutes,
  b.actual_minutes,
  b.fx_rate_id,
  b.fx_rate,
  b.total_cost_try,
  b.total_cost_usd,
  b.unit_cost_try,
  b.unit_cost_usd,
  b.sale_price_snapshot,
  b.sale_currency_snapshot,
  b.note,
  c.prev_batch_no,
  c.prev_unit_cost_usd,
  c.prev_unit_cost_try,
  case when c.prev_unit_cost_usd > 0
       then round((b.unit_cost_usd - c.prev_unit_cost_usd) / c.prev_unit_cost_usd * 100, 2) end
    as unit_cost_usd_change_pct,
  case when c.prev_unit_cost_try > 0
       then round((b.unit_cost_try - c.prev_unit_cost_try) / c.prev_unit_cost_try * 100, 2) end
    as unit_cost_try_change_pct,
  hl.qty_remaining as heatemp_remaining
from public.production_batches b
join public.v_variants v on v.id = b.variant_id
left join completed c on c.id = b.id
left join public.stock_layers hl on hl.batch_id = b.id and hl.location = 'heatemp';

create view public.v_batch_consumptions with (security_invoker = true) as
select
  c.id,
  c.batch_id,
  c.material_id,
  m.code as material_code,
  m.name as material_name,
  m.display_unit,
  du.factor_to_base as display_factor,
  bu.code as base_unit,
  c.qty_per_unit,
  c.qty,
  c.unit_cost_try,
  c.unit_cost_usd,
  c.total_try,
  c.total_usd,
  c.return_movement_id is not null as returned
from public.production_consumptions c
join public.raw_materials m on m.id = c.material_id
join public.units du on du.code = m.display_unit
join public.units bu on bu.kind = m.unit_kind and bu.is_base;

create view public.v_heatemp_shelf with (security_invoker = true) as
select
  l.id as layer_id,
  l.variant_id,
  v.product_id,
  v.product_code,
  v.product_name,
  v.variant_code,
  v.variant_name,
  v.display_name,
  l.batch_id,
  b.batch_no,
  b.completed_at,
  l.qty_in as produced_qty,
  l.qty_out as delivered_qty,
  l.qty_remaining,
  l.unit_cost_try,
  l.unit_cost_usd,
  round(l.qty_remaining * l.unit_cost_try, 4) as value_try,
  round(l.qty_remaining * l.unit_cost_usd, 4) as value_usd,
  l.received_on
from public.stock_layers l
join public.production_batches b on b.id = l.batch_id
join public.v_variants v on v.id = l.variant_id
where l.location = 'heatemp';

-- ---------------------------------------------------------------------
-- Satır düzeyi güvenlik: bu tablolar yalnızca işlem fonksiyonlarıyla yazılır.
-- ---------------------------------------------------------------------
alter table public.production_batches enable row level security;
alter table public.production_consumptions enable row level security;
alter table public.stock_layers enable row level security;
alter table public.stock_movements enable row level security;

create policy production_batches_select on public.production_batches for select to authenticated
  using ((select public.is_app_member()));
create policy production_consumptions_select on public.production_consumptions for select to authenticated
  using ((select public.is_app_member()));
create policy stock_layers_select on public.stock_layers for select to authenticated
  using ((select public.is_app_member()));
create policy stock_movements_select on public.stock_movements for select to authenticated
  using ((select public.is_app_member()));

revoke all on public.production_batches, public.production_consumptions, public.stock_layers,
  public.stock_movements, public.v_batches, public.v_batch_consumptions, public.v_heatemp_shelf from anon;
revoke insert, update, delete, truncate on public.production_batches, public.production_consumptions,
  public.stock_layers, public.stock_movements from authenticated;
revoke all on sequence public.production_batch_no_seq from anon, authenticated;

do $$ begin perform private.lock_down_public_functions(); end $$;
