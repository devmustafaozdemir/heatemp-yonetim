-- =====================================================================
-- Heatemp ERP — 5/8 Kurumsal müşteriler ve Mekonsis satışları
-- Satış yalnızca Mekonsis rafındaki stoktan yapılır. Miktar ve maliyet,
-- satış tarihinde rafta bulunan parti katmanlarından FIFO ile tahsis edilir.
-- Gelir satış günündeki kurla TRY'ye çevrilir; maliyet partinin kayıtlı
-- TRY maliyetidir. Satış fiyatının tamamı Heatemp geliridir (komisyon yok).
-- =====================================================================

create table public.customers (
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

create unique index customers_name_unique on public.customers (lower(btrim(name)));

create trigger customers_updated_at before update on public.customers
  for each row execute function private.set_updated_at();

create sequence public.sale_no_seq;

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_no text not null unique,
  sold_on date not null,
  customer_id uuid references public.customers (id) on delete restrict,
  currency text not null check (currency in ('USD', 'TRY')),
  fx_rate_id bigint not null references public.fx_rates (id),
  fx_rate numeric(18, 6) not null check (fx_rate > 0),
  total_quantity integer not null default 0 check (total_quantity >= 0),
  total_amount numeric(20, 4) not null default 0 check (total_amount >= 0),
  revenue_try numeric(20, 4) not null default 0 check (revenue_try >= 0),
  revenue_usd numeric(20, 4) not null default 0 check (revenue_usd >= 0),
  cogs_try numeric(24, 6) not null default 0 check (cogs_try >= 0),
  cogs_usd numeric(24, 6) not null default 0 check (cogs_usd >= 0),
  gross_profit_try numeric(24, 6) not null default 0,
  gross_profit_usd numeric(24, 6) not null default 0,
  quote_id uuid,
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id) on delete set null,
  cancel_reason text,
  note text,
  request_id uuid unique,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint sales_cancelled check ((status = 'cancelled') = (cancelled_at is not null))
);

create index sales_sold_on_idx on public.sales (sold_on) where status = 'completed';
create unique index sales_quote_active on public.sales (quote_id) where quote_id is not null and status = 'completed';

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete restrict,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(18, 4) not null check (unit_price > 0),
  line_total numeric(20, 4) not null check (line_total > 0),
  revenue_try numeric(20, 4) not null default 0 check (revenue_try >= 0),
  revenue_usd numeric(20, 4) not null default 0 check (revenue_usd >= 0),
  cogs_try numeric(24, 6) not null default 0 check (cogs_try >= 0),
  cogs_usd numeric(24, 6) not null default 0 check (cogs_usd >= 0),
  gross_profit_try numeric(24, 6) not null default 0,
  gross_profit_usd numeric(24, 6) not null default 0,
  list_price numeric(18, 4),
  list_currency text,
  unique (sale_id, variant_id)
);

create index sale_items_variant_idx on public.sale_items (variant_id);

create table public.sale_allocations (
  id bigint generated always as identity primary key,
  sale_id uuid not null references public.sales (id) on delete restrict,
  sale_item_id uuid not null references public.sale_items (id) on delete restrict,
  layer_id uuid not null references public.stock_layers (id) on delete restrict,
  batch_id uuid not null references public.production_batches (id) on delete restrict,
  delivery_id uuid not null references public.deliveries (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_cost_try numeric(24, 8) not null check (unit_cost_try >= 0),
  unit_cost_usd numeric(24, 8) not null check (unit_cost_usd >= 0),
  cost_try numeric(24, 6) not null check (cost_try >= 0),
  cost_usd numeric(24, 6) not null check (cost_usd >= 0)
);

create index sale_allocations_item_idx on public.sale_allocations (sale_item_id);
create index sale_allocations_layer_idx on public.sale_allocations (layer_id);

alter table public.stock_movements
  add constraint stock_movements_sale_fk foreign key (sale_id) references public.sales (id);

-- ---------------------------------------------------------------------
-- Satış çekirdeği (yetki kontrolü çağıran fonksiyondadır)
-- p_items: [{"variant_id": "...", "quantity": 10, "unit_price": 125.5}, ...]
-- ---------------------------------------------------------------------
create or replace function private.create_sale(
  p_sold_on date,
  p_currency text,
  p_fx_rate_id bigint,
  p_items jsonb,
  p_customer_id uuid,
  p_note text,
  p_request_id uuid,
  p_quote_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sold_on date := coalesce(p_sold_on, public.today_tr());
  v_fx public.fx_rates;
  v_sale_id uuid;
  v_item record;
  v_variant public.v_variants;
  v_item_id uuid;
  v_layer record;
  v_available integer;
  v_available_any_date integer;
  v_left integer;
  v_take integer;
  v_line_total numeric;
  v_rev_try numeric;
  v_rev_usd numeric;
  v_cogs_try numeric;
  v_cogs_usd numeric;
  v_cost_try numeric;
  v_cost_usd numeric;
begin
  if p_currency is null or p_currency not in ('USD', 'TRY') then
    raise exception 'Para birimi USD veya TRY olmalıdır.';
  end if;
  if v_sold_on > public.today_tr() then
    raise exception 'Gelecek tarihli satış girilemez.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Satışta en az bir kalem olmalıdır.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(variant_id uuid, quantity integer, unit_price numeric)
     where x.variant_id is null or x.quantity is null or x.quantity <= 0
        or x.unit_price is null or x.unit_price <= 0
  ) then
    raise exception 'Her satış kaleminde varyant, sıfırdan büyük adet ve sıfırdan büyük birim fiyat olmalıdır.';
  end if;
  if (select count(*) from jsonb_to_recordset(p_items) as x(variant_id uuid))
     <> (select count(distinct x.variant_id) from jsonb_to_recordset(p_items) as x(variant_id uuid)) then
    raise exception 'Aynı varyant satışta birden fazla satırda yer alamaz; adetleri tek satırda birleştirin.';
  end if;
  if p_customer_id is not null and not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Müşteri bulunamadı.';
  end if;

  v_fx := private.resolve_fx(p_fx_rate_id, v_sold_on);

  insert into public.sales (sale_no, sold_on, customer_id, currency, fx_rate_id, fx_rate, quote_id, note, request_id)
  values (private.next_doc_no('SAT', 'public.sale_no_seq'), v_sold_on, p_customer_id, p_currency, v_fx.id,
          v_fx.rate, p_quote_id, nullif(btrim(p_note), ''), p_request_id)
  returning id into v_sale_id;

  -- Varyantları sabit sırada kilitle (kilitlenmeye karşı).
  for v_item in
    select x.variant_id, x.quantity, x.unit_price
      from jsonb_to_recordset(p_items) as x(variant_id uuid, quantity integer, unit_price numeric)
     order by x.variant_id
  loop
    select * into v_variant from public.v_variants where id = v_item.variant_id;
    if not found then
      raise exception 'Varyant bulunamadı.';
    end if;

    perform private.lock_variant_stock(v_item.variant_id);

    select coalesce(sum(l.qty_remaining), 0),
           coalesce(sum(l.qty_remaining) filter (where l.received_on <= v_sold_on), 0)
      into v_available_any_date, v_available
      from public.stock_layers l
     where l.variant_id = v_item.variant_id
       and l.location = 'mekonsis'
       and l.qty_out < l.qty_in;

    if v_available < v_item.quantity then
      if v_available_any_date >= v_item.quantity then
        raise exception 'Satış tarihi (%) itibarıyla Mekonsis rafında yeterli stok yok: % için % adet var, % adet satılmak istendi. Bu tarihten sonra teslim edilen ürünler bu satışta kullanılamaz.',
          private.fmt_date(v_sold_on), v_variant.display_name, v_available, v_item.quantity;
      end if;
      raise exception 'Mekonsis rafında yeterli stok yok: % için mevcut % adet, satılmak istenen % adet.',
        v_variant.display_name, v_available, v_item.quantity;
    end if;

    v_line_total := round(v_item.quantity * v_item.unit_price, 4);
    if p_currency = 'TRY' then
      v_rev_try := v_line_total;
      v_rev_usd := round(v_line_total / v_fx.rate, 4);
    else
      v_rev_usd := v_line_total;
      v_rev_try := round(v_line_total * v_fx.rate, 4);
    end if;

    insert into public.sale_items (
      sale_id, variant_id, quantity, unit_price, line_total, revenue_try, revenue_usd, list_price, list_currency
    ) values (
      v_sale_id, v_item.variant_id, v_item.quantity, v_item.unit_price, v_line_total, v_rev_try, v_rev_usd,
      v_variant.sale_price, v_variant.currency
    ) returning id into v_item_id;

    v_left := v_item.quantity;
    v_cogs_try := 0;
    v_cogs_usd := 0;

    for v_layer in
      select l.*
        from public.stock_layers l
       where l.variant_id = v_item.variant_id
         and l.location = 'mekonsis'
         and l.qty_out < l.qty_in
         and l.received_on <= v_sold_on
       order by l.received_on, l.fifo_seq
         for update
    loop
      exit when v_left = 0;
      v_take := least(v_layer.qty_remaining, v_left);
      v_cost_try := round(v_take * v_layer.unit_cost_try, 6);
      v_cost_usd := round(v_take * v_layer.unit_cost_usd, 6);

      update public.stock_layers set qty_out = qty_out + v_take where id = v_layer.id;

      insert into public.sale_allocations (
        sale_id, sale_item_id, layer_id, batch_id, delivery_id, quantity, unit_cost_try, unit_cost_usd,
        cost_try, cost_usd
      ) values (
        v_sale_id, v_item_id, v_layer.id, v_layer.batch_id, v_layer.delivery_id, v_take,
        v_layer.unit_cost_try, v_layer.unit_cost_usd, v_cost_try, v_cost_usd
      );

      insert into public.stock_movements (
        layer_id, variant_id, batch_id, location, movement_type, qty, unit_cost_try, unit_cost_usd,
        movement_date, sale_id
      ) values (
        v_layer.id, v_item.variant_id, v_layer.batch_id, 'mekonsis', 'sale_out', -v_take,
        v_layer.unit_cost_try, v_layer.unit_cost_usd, v_sold_on, v_sale_id
      );

      v_cogs_try := v_cogs_try + v_cost_try;
      v_cogs_usd := v_cogs_usd + v_cost_usd;
      v_left := v_left - v_take;
    end loop;

    if v_left <> 0 then
      raise exception 'FIFO tahsisi tamamlanamadı; satış geri alındı.';
    end if;

    update public.sale_items
       set cogs_try = v_cogs_try,
           cogs_usd = v_cogs_usd,
           gross_profit_try = v_rev_try - v_cogs_try,
           gross_profit_usd = v_rev_usd - v_cogs_usd
     where id = v_item_id;
  end loop;

  update public.sales s
     set total_quantity = t.qty,
         total_amount = t.amount,
         revenue_try = t.rev_try,
         revenue_usd = t.rev_usd,
         cogs_try = t.cogs_try,
         cogs_usd = t.cogs_usd,
         gross_profit_try = t.rev_try - t.cogs_try,
         gross_profit_usd = t.rev_usd - t.cogs_usd
    from (
      select sum(quantity)::integer as qty, sum(line_total) as amount, sum(revenue_try) as rev_try,
             sum(revenue_usd) as rev_usd, sum(cogs_try) as cogs_try, sum(cogs_usd) as cogs_usd
        from public.sale_items where sale_id = v_sale_id
    ) t
   where s.id = v_sale_id;

  return v_sale_id;
end
$$;

create or replace function public.record_sale(
  p_sold_on date,
  p_currency text,
  p_fx_rate_id bigint,
  p_items jsonb,
  p_customer_id uuid default null,
  p_note text default null,
  p_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale_id uuid;
begin
  perform private.assert_admin();
  perform private.claim_request(p_request_id);
  if p_request_id is not null then
    select id into v_sale_id from public.sales where request_id = p_request_id;
    if found then
      return v_sale_id;
    end if;
  end if;
  return private.create_sale(p_sold_on, p_currency, p_fx_rate_id, p_items, p_customer_id, p_note, p_request_id, null);
end
$$;

-- Hatalı satışı iptal eder: FIFO tahsisleri aynı katmanlara bir kez geri döner.
create or replace function public.cancel_sale(p_sale_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_variant_id uuid;
  v_alloc record;
begin
  perform private.assert_admin();
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Satış iptali için gerekçe yazılmalıdır.';
  end if;
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Satış bulunamadı.';
  end if;
  if v_sale.status = 'cancelled' then
    raise exception 'Satış % zaten iptal edilmiş.', v_sale.sale_no;
  end if;

  for v_variant_id in
    select distinct variant_id from public.sale_items where sale_id = p_sale_id order by variant_id
  loop
    perform private.lock_variant_stock(v_variant_id);
  end loop;

  for v_alloc in
    select a.*, si.variant_id
      from public.sale_allocations a
      join public.sale_items si on si.id = a.sale_item_id
     where a.sale_id = p_sale_id
     order by a.layer_id
  loop
    update public.stock_layers set qty_out = qty_out - v_alloc.quantity where id = v_alloc.layer_id;
    insert into public.stock_movements (
      layer_id, variant_id, batch_id, location, movement_type, qty, unit_cost_try, unit_cost_usd,
      movement_date, sale_id
    ) values (
      v_alloc.layer_id, v_alloc.variant_id, v_alloc.batch_id, 'mekonsis', 'sale_return', v_alloc.quantity,
      v_alloc.unit_cost_try, v_alloc.unit_cost_usd, public.today_tr(), p_sale_id
    );
  end loop;

  update public.sales
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
   where id = p_sale_id;

  return p_sale_id;
end
$$;

-- Kapanmış satışın değiştirilmesini engeller (yalnızca iptal geçişine izin verir).
create or replace function private.sales_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'cancelled' then
    raise exception 'İptal edilmiş satış değiştirilemez.';
  end if;
  if old.revenue_try <> 0 and (
       new.revenue_try <> old.revenue_try or new.cogs_try <> old.cogs_try
       or new.sold_on <> old.sold_on or new.fx_rate <> old.fx_rate or new.currency <> old.currency) then
    raise exception 'Kaydedilmiş satışın tutarları değiştirilemez; gerekirse satışı iptal edip yeniden girin.';
  end if;
  return new;
end
$$;

create trigger sales_guard before update on public.sales
  for each row execute function private.sales_guard();

-- ---------------------------------------------------------------------
-- Görünümler
-- ---------------------------------------------------------------------
create view public.v_sales with (security_invoker = true) as
select
  s.id,
  s.sale_no,
  s.sold_on,
  s.customer_id,
  c.name as customer_name,
  s.currency,
  s.fx_rate_id,
  s.fx_rate,
  f.source as fx_source,
  f.rate_date as fx_rate_date,
  s.total_quantity,
  s.total_amount,
  s.revenue_try,
  s.revenue_usd,
  s.cogs_try,
  s.cogs_usd,
  s.gross_profit_try,
  s.gross_profit_usd,
  case when s.revenue_try > 0 then round(s.gross_profit_try / s.revenue_try * 100, 2) end as margin_pct,
  s.quote_id,
  s.status,
  s.cancelled_at,
  s.cancel_reason,
  s.note,
  s.created_at,
  (select string_agg(v.display_name || ' × ' || si.quantity, ', ' order by v.display_name)
     from public.sale_items si join public.v_variants v on v.id = si.variant_id
    where si.sale_id = s.id) as items_summary
from public.sales s
join public.fx_rates f on f.id = s.fx_rate_id
left join public.customers c on c.id = s.customer_id;

create view public.v_sale_items with (security_invoker = true) as
select
  si.id,
  si.sale_id,
  si.variant_id,
  v.product_code,
  v.product_name,
  v.variant_code,
  v.variant_name,
  v.display_name,
  si.quantity,
  si.unit_price,
  si.line_total,
  si.revenue_try,
  si.revenue_usd,
  si.cogs_try,
  si.cogs_usd,
  si.gross_profit_try,
  si.gross_profit_usd,
  si.list_price,
  si.list_currency
from public.sale_items si
join public.v_variants v on v.id = si.variant_id;

create view public.v_sale_allocations with (security_invoker = true) as
select
  a.id,
  a.sale_id,
  a.sale_item_id,
  si.variant_id,
  a.batch_id,
  b.batch_no,
  a.delivery_id,
  d.delivery_no,
  d.delivered_on,
  a.quantity,
  a.unit_cost_try,
  a.unit_cost_usd,
  a.cost_try,
  a.cost_usd
from public.sale_allocations a
join public.sale_items si on si.id = a.sale_item_id
join public.production_batches b on b.id = a.batch_id
join public.deliveries d on d.id = a.delivery_id;

-- ---------------------------------------------------------------------
-- Satır düzeyi güvenlik
-- ---------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_allocations enable row level security;

create policy customers_select on public.customers for select to authenticated
  using ((select public.is_app_member()));
create policy customers_insert on public.customers for insert to authenticated
  with check ((select public.is_admin()));
create policy customers_update on public.customers for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy customers_delete on public.customers for delete to authenticated
  using ((select public.is_admin()));

create policy sales_select on public.sales for select to authenticated
  using ((select public.is_app_member()));
create policy sale_items_select on public.sale_items for select to authenticated
  using ((select public.is_app_member()));
create policy sale_allocations_select on public.sale_allocations for select to authenticated
  using ((select public.is_app_member()));

revoke all on public.customers, public.sales, public.sale_items, public.sale_allocations,
  public.v_sales, public.v_sale_items, public.v_sale_allocations from anon;
revoke truncate on public.customers from authenticated;
revoke insert, update, delete, truncate on public.sales, public.sale_items, public.sale_allocations from authenticated;
revoke all on sequence public.sale_no_seq from anon, authenticated;

do $$ begin perform private.lock_down_public_functions(); end $$;
