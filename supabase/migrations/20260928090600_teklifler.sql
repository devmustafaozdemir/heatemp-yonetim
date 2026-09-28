-- =====================================================================
-- Heatemp ERP — 7/8 Kurumsal toplu satış teklifleri
-- Teklif stok düşürmez. "Satışa Dönüştür" güncel Mekonsis stoğunu yeniden
-- kontrol ederek aynı satış iş akışını tam bir kez çalıştırır.
-- =====================================================================

create sequence public.quote_no_seq;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_no text not null unique,
  customer_id uuid not null references public.customers (id) on delete restrict,
  quote_date date not null default public.today_tr(),
  valid_until date,
  currency text not null default 'USD' check (currency in ('USD', 'TRY')),
  status text not null default 'open' check (status in ('open', 'converted', 'cancelled')),
  sale_id uuid references public.sales (id),
  note text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_converted_sale check ((status = 'converted') = (sale_id is not null)),
  constraint quotes_validity check (valid_until is null or valid_until >= quote_date)
);

create index quotes_customer_idx on public.quotes (customer_id);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(18, 4) not null check (unit_price > 0),
  note text,
  created_at timestamptz not null default now(),
  unique (quote_id, variant_id)
);

alter table public.sales
  add constraint sales_quote_fk foreign key (quote_id) references public.quotes (id);

create or replace function private.quotes_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.quote_no := private.next_doc_no('TKL', 'public.quote_no_seq');
  new.status := 'open';
  new.sale_id := null;
  return new;
end
$$;

create trigger quotes_before_insert before insert on public.quotes
  for each row execute function private.quotes_before_insert();

-- Dönüştürülmüş teklif kilitlidir; "dönüştürüldü" durumu yalnızca RPC ile verilir.
create or replace function private.quotes_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_sync boolean := coalesce(current_setting('app.quote_sync', true), '') = 'on';
begin
  if not v_sync then
    if old.status = 'converted' then
      raise exception 'Satışa dönüştürülmüş teklif değiştirilemez.';
    end if;
    if new.status = 'converted' then
      raise exception 'Teklif yalnızca "Satışa Dönüştür" işlemiyle satışa dönüştürülebilir.';
    end if;
    if new.sale_id is distinct from old.sale_id then
      raise exception 'Teklifin satış bağlantısı elle değiştirilemez.';
    end if;
  end if;
  new.quote_no := old.quote_no;
  new.updated_at := now();
  return new;
end
$$;

create trigger quotes_guard before update on public.quotes
  for each row execute function private.quotes_guard();

create or replace function private.quote_items_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status from public.quotes
   where id = case when tg_op = 'DELETE' then old.quote_id else new.quote_id end;
  if v_status is not null and v_status <> 'open' then
    raise exception 'Yalnızca açık teklifin kalemleri değiştirilebilir.';
  end if;
  if tg_op = 'UPDATE' and new.quote_id <> old.quote_id then
    raise exception 'Teklif kalemi başka teklife taşınamaz.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create trigger quote_items_guard before insert or update or delete on public.quote_items
  for each row execute function private.quote_items_guard();

-- Satış iptal edilirse bağlı teklif yeniden açılır (tekrar dönüştürülebilir).
create or replace function private.sales_reopen_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' and new.quote_id is not null then
    perform set_config('app.quote_sync', 'on', true);
    update public.quotes set status = 'open', sale_id = null
     where id = new.quote_id and sale_id = new.id;
    perform set_config('app.quote_sync', 'off', true);
  end if;
  return new;
end
$$;

create trigger sales_reopen_quote after update of status on public.sales
  for each row execute function private.sales_reopen_quote();

-- ---------------------------------------------------------------------
-- Teklif tahmini: ciro (güncel kurla), FIFO maliyet önizlemesi, brüt kâr, marj
-- ---------------------------------------------------------------------
create or replace function private.fifo_preview(p_variant_id uuid, p_qty integer)
returns table (available integer, allocated integer, cost_try numeric, cost_usd numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with layers as (
    select l.qty_remaining, l.unit_cost_try, l.unit_cost_usd,
           sum(l.qty_remaining) over (order by l.received_on, l.fifo_seq) - l.qty_remaining as before_qty
      from public.stock_layers l
     where l.variant_id = p_variant_id and l.location = 'mekonsis' and l.qty_out < l.qty_in
  ),
  taken as (
    select greatest(0, least(qty_remaining, p_qty - before_qty)) as take, unit_cost_try, unit_cost_usd, qty_remaining
      from layers
  )
  select coalesce(sum(qty_remaining), 0)::integer,
         coalesce(sum(take), 0)::integer,
         coalesce(sum(take * unit_cost_try), 0),
         coalesce(sum(take * unit_cost_usd), 0)
    from taken
$$;

create or replace function public.quote_estimate(p_quote_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_fx record;
  v_lines jsonb;
  v_totals record;
begin
  perform private.assert_member();
  select * into v_quote from public.quotes where id = p_quote_id;
  if not found then
    raise exception 'Teklif bulunamadı.';
  end if;
  select * into v_fx from public.fx_rate_for_date(public.today_tr());

  with items as (
    select
      qi.id,
      qi.variant_id,
      v.display_name,
      qi.quantity,
      qi.unit_price,
      v.sale_price as list_price,
      v.currency as list_currency,
      round(qi.quantity * qi.unit_price, 4) as line_total,
      fp.available,
      fp.allocated,
      fp.cost_try as fifo_cost_try,
      fp.cost_usd as fifo_cost_usd,
      lb.unit_cost_try as last_unit_cost_try,
      lb.unit_cost_usd as last_unit_cost_usd
    from public.quote_items qi
    join public.v_variants v on v.id = qi.variant_id
    cross join lateral private.fifo_preview(qi.variant_id, qi.quantity) fp
    left join lateral (
      select b.unit_cost_try, b.unit_cost_usd from public.production_batches b
       where b.variant_id = qi.variant_id and b.status = 'completed'
       order by b.completed_at desc limit 1
    ) lb on true
    where qi.quote_id = p_quote_id
  ),
  calc as (
    select i.*,
      i.quantity - i.allocated as shortage,
      case when v_fx.rate is null then null
           when v_quote.currency = 'TRY' then i.line_total
           else round(i.line_total * v_fx.rate, 4) end as revenue_try,
      case when v_quote.currency = 'USD' then i.line_total
           when v_fx.rate is null then null
           else round(i.line_total / v_fx.rate, 4) end as revenue_usd,
      i.fifo_cost_try + (i.quantity - i.allocated) * coalesce(i.last_unit_cost_try, 0) as cost_try,
      i.fifo_cost_usd + (i.quantity - i.allocated) * coalesce(i.last_unit_cost_usd, 0) as cost_usd,
      (i.quantity - i.allocated) > 0 and i.last_unit_cost_try is null as cost_unknown,
      case when i.list_price > 0 and i.list_currency = v_quote.currency
           then round((i.list_price - i.unit_price) / i.list_price * 100, 2) end as discount_pct
    from items i
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'variant_id', c.variant_id,
      'display_name', c.display_name,
      'quantity', c.quantity,
      'unit_price', c.unit_price,
      'list_price', c.list_price,
      'list_currency', c.list_currency,
      'discount_pct', c.discount_pct,
      'line_total', c.line_total,
      'mekonsis_available', c.available,
      'shortage', c.shortage,
      'revenue_try', c.revenue_try,
      'revenue_usd', c.revenue_usd,
      'cost_try', round(c.cost_try, 4),
      'cost_usd', round(c.cost_usd, 4),
      'cost_unknown', c.cost_unknown,
      'gross_profit_try', round(c.revenue_try - c.cost_try, 4),
      'margin_pct', case when c.revenue_try > 0 then round((c.revenue_try - c.cost_try) / c.revenue_try * 100, 2) end
    ) order by c.display_name), '[]'::jsonb)
  into v_lines
  from calc c;

  select
    coalesce(sum((l->>'line_total')::numeric), 0) as amount,
    sum((l->>'revenue_try')::numeric) as revenue_try,
    sum((l->>'revenue_usd')::numeric) as revenue_usd,
    coalesce(sum((l->>'cost_try')::numeric), 0) as cost_try,
    coalesce(sum((l->>'cost_usd')::numeric), 0) as cost_usd,
    coalesce(bool_or((l->>'shortage')::integer > 0), false) as has_shortage,
    coalesce(bool_or((l->>'cost_unknown')::boolean), false) as cost_unknown
  into v_totals
  from jsonb_array_elements(v_lines) l;

  return jsonb_build_object(
    'quote_id', v_quote.id,
    'currency', v_quote.currency,
    'fx', case when v_fx.id is null then null else jsonb_build_object(
      'id', v_fx.id, 'rate', v_fx.rate, 'rate_date', v_fx.rate_date, 'source', v_fx.source,
      'is_valid', v_fx.is_valid) end,
    'lines', v_lines,
    'total_amount', v_totals.amount,
    'revenue_try', v_totals.revenue_try,
    'revenue_usd', v_totals.revenue_usd,
    'cost_try', round(v_totals.cost_try, 4),
    'cost_usd', round(v_totals.cost_usd, 4),
    'gross_profit_try', round(v_totals.revenue_try - v_totals.cost_try, 4),
    'margin_pct', case when v_totals.revenue_try > 0
                       then round((v_totals.revenue_try - v_totals.cost_try) / v_totals.revenue_try * 100, 2) end,
    'has_shortage', v_totals.has_shortage,
    'cost_unknown', v_totals.cost_unknown
  );
end
$$;

-- ---------------------------------------------------------------------
-- Satışa dönüştür: tam bir kez satış oluşturur
-- ---------------------------------------------------------------------
create or replace function public.convert_quote_to_sale(
  p_quote_id uuid,
  p_sold_on date,
  p_fx_rate_id bigint,
  p_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_items jsonb;
  v_sale_id uuid;
begin
  perform private.assert_admin();
  perform private.claim_request(p_request_id);

  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'Teklif bulunamadı.';
  end if;
  if v_quote.status = 'converted' then
    -- Aynı teklif ikinci kez dönüştürülmez; mevcut satış döndürülür.
    return v_quote.sale_id;
  end if;
  if v_quote.status = 'cancelled' then
    raise exception 'İptal edilmiş teklif satışa dönüştürülemez.';
  end if;

  select jsonb_agg(jsonb_build_object('variant_id', variant_id, 'quantity', quantity, 'unit_price', unit_price))
    into v_items
    from public.quote_items where quote_id = p_quote_id;
  if v_items is null then
    raise exception 'Teklifte kalem yok.';
  end if;

  v_sale_id := private.create_sale(
    p_sold_on, v_quote.currency, p_fx_rate_id, v_items, v_quote.customer_id,
    'Teklif ' || v_quote.quote_no || coalesce(' — ' || v_quote.note, ''), p_request_id, v_quote.id
  );

  perform set_config('app.quote_sync', 'on', true);
  update public.quotes set status = 'converted', sale_id = v_sale_id where id = p_quote_id;
  perform set_config('app.quote_sync', 'off', true);

  return v_sale_id;
end
$$;

create view public.v_quotes with (security_invoker = true) as
select
  q.id,
  q.quote_no,
  q.customer_id,
  c.name as customer_name,
  q.quote_date,
  q.valid_until,
  q.currency,
  q.status,
  q.sale_id,
  s.sale_no,
  q.note,
  q.created_at,
  coalesce(sum(qi.quantity), 0)::integer as total_quantity,
  coalesce(round(sum(qi.quantity * qi.unit_price), 4), 0) as total_amount,
  count(qi.id)::integer as item_count
from public.quotes q
join public.customers c on c.id = q.customer_id
left join public.sales s on s.id = q.sale_id
left join public.quote_items qi on qi.quote_id = q.id
group by q.id, c.name, s.sale_no;

alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;

create policy quotes_select on public.quotes for select to authenticated
  using ((select public.is_app_member()));
create policy quotes_insert on public.quotes for insert to authenticated
  with check ((select public.is_admin()));
create policy quotes_update on public.quotes for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy quotes_delete on public.quotes for delete to authenticated
  using ((select public.is_admin()) and status <> 'converted');

create policy quote_items_select on public.quote_items for select to authenticated
  using ((select public.is_app_member()));
create policy quote_items_insert on public.quote_items for insert to authenticated
  with check ((select public.is_admin()));
create policy quote_items_update on public.quote_items for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy quote_items_delete on public.quote_items for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.quotes, public.quote_items, public.v_quotes from anon;
revoke truncate on public.quotes, public.quote_items from authenticated;
revoke all on sequence public.quote_no_seq from anon, authenticated;

do $$ begin perform private.lock_down_public_functions(); end $$;
