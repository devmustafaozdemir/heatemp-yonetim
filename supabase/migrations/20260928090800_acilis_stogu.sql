-- =====================================================================
-- Heatemp ERP — 9 Açılış stoğu (sistem öncesi üretilmiş mamul)
-- Uygulamaya geçişte eldeki mamul stoğu, gerçek birim maliyetiyle ve açıkça
-- işaretlenmiş bir "açılış partisi" olarak Heatemp rafına girilir. Hammadde
-- tüketmez; üretim maliyeti karşılaştırmalarına ve "üretime harcanan"
-- toplamına katılmaz. Mekonsis'teki mevcut stok için ardından normal teslimat
-- kaydı yapılır. Otomatik içe aktarma yoktur; her giriş yöneticinin işlemidir.
-- =====================================================================

alter table public.production_batches
  add column kind text not null default 'production' check (kind in ('production', 'opening'));

create or replace function public.record_opening_stock(
  p_variant_id uuid,
  p_quantity integer,
  p_unit_cost numeric,
  p_currency text,
  p_fx_rate_id bigint,
  p_stock_date date,
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
  v_layer_id uuid;
  v_unit_try numeric;
  v_unit_usd numeric;
  v_now timestamptz := now();
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
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Açılış adedi sıfırdan büyük olmalıdır.';
  end if;
  if p_unit_cost is null or p_unit_cost <= 0 then
    raise exception 'Açılış stoğunun birim maliyeti sıfırdan büyük olmalıdır.';
  end if;
  if p_currency not in ('USD', 'TRY') then
    raise exception 'Para birimi USD veya TRY olmalıdır.';
  end if;
  if p_stock_date is null or p_stock_date > public.today_tr() then
    raise exception 'Açılış tarihi boş veya gelecekte olamaz.';
  end if;
  if p_note is null or btrim(p_note) = '' then
    raise exception 'Açılış stoğu için kaynak/açıklama yazılmalıdır (ör. "Excel sayımı 30.09.2026").';
  end if;

  v_fx := private.resolve_fx(p_fx_rate_id, p_stock_date);
  if p_currency = 'TRY' then
    v_unit_try := p_unit_cost;
    v_unit_usd := p_unit_cost / v_fx.rate;
  else
    v_unit_usd := p_unit_cost;
    v_unit_try := p_unit_cost * v_fx.rate;
  end if;

  perform private.lock_variant_stock(p_variant_id);

  insert into public.production_batches (
    batch_no, variant_id, quantity, status, kind, started_at, completed_at, unit_production_minutes,
    estimated_minutes, actual_minutes, fx_rate_id, fx_rate, total_cost_try, total_cost_usd, unit_cost_try,
    unit_cost_usd, sale_price_snapshot, sale_currency_snapshot, note, request_id, completed_by
  ) values (
    private.next_doc_no('ACL', 'public.production_batch_no_seq'), p_variant_id, p_quantity, 'completed', 'opening',
    v_now, v_now, 0, 0, 0, v_fx.id, v_fx.rate, round(v_unit_try * p_quantity, 6), round(v_unit_usd * p_quantity, 6),
    v_unit_try, v_unit_usd, v_variant.sale_price, v_variant.currency, btrim(p_note), p_request_id, auth.uid()
  ) returning id into v_batch_id;

  insert into public.stock_layers (
    variant_id, batch_id, location, qty_in, unit_cost_try, unit_cost_usd, received_on, received_at
  ) values (
    p_variant_id, v_batch_id, 'heatemp', p_quantity, v_unit_try, v_unit_usd, p_stock_date, v_now
  ) returning id into v_layer_id;

  insert into public.stock_movements (
    layer_id, variant_id, batch_id, location, movement_type, qty, unit_cost_try, unit_cost_usd, movement_date
  ) values (
    v_layer_id, p_variant_id, v_batch_id, 'heatemp', 'production_in', p_quantity, v_unit_try, v_unit_usd, p_stock_date
  );

  return v_batch_id;
end
$$;

-- Parti görünümü: maliyet karşılaştırması yalnızca gerçek üretim partileri arasında.
create or replace view public.v_batches with (security_invoker = true) as
with completed as (
  select
    b.id,
    lag(b.batch_no) over w as prev_batch_no,
    lag(b.unit_cost_usd) over w as prev_unit_cost_usd,
    lag(b.unit_cost_try) over w as prev_unit_cost_try
  from public.production_batches b
  where b.status = 'completed' and b.kind = 'production'
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
  hl.qty_remaining as heatemp_remaining,
  b.kind
from public.production_batches b
join public.v_variants v on v.id = b.variant_id
left join completed c on c.id = b.id
left join public.stock_layers hl on hl.batch_id = b.id and hl.location = 'heatemp';

-- Genel bakış: açılış stoğu üretim sayılmaz, ayrı sütunlarda izlenir.
create or replace view public.v_variant_overview with (security_invoker = true) as
with prod as (
  select
    b.variant_id,
    sum(b.quantity) filter (where b.status = 'completed' and b.kind = 'production') as produced_qty,
    sum(b.quantity) filter (where b.status = 'in_production') as in_production_qty,
    sum(b.total_cost_try) filter (where b.status in ('completed', 'in_production') and b.kind = 'production') as production_spend_try,
    sum(b.total_cost_usd) filter (where b.status in ('completed', 'in_production') and b.kind = 'production') as production_spend_usd,
    sum(b.total_cost_try) filter (where b.status = 'in_production') as wip_value_try,
    sum(b.total_cost_usd) filter (where b.status = 'in_production') as wip_value_usd,
    sum(b.actual_minutes) filter (where b.status = 'completed' and b.kind = 'production') as production_minutes,
    sum(b.quantity) filter (where b.kind = 'opening') as opening_qty,
    sum(b.total_cost_try) filter (where b.kind = 'opening') as opening_value_try
  from public.production_batches b
  group by b.variant_id
),
stock as (
  select
    l.variant_id,
    sum(l.qty_remaining) filter (where l.location = 'heatemp') as heatemp_qty,
    sum(l.qty_remaining * l.unit_cost_try) filter (where l.location = 'heatemp') as heatemp_value_try,
    sum(l.qty_remaining * l.unit_cost_usd) filter (where l.location = 'heatemp') as heatemp_value_usd,
    sum(l.qty_remaining) filter (where l.location = 'mekonsis') as mekonsis_qty,
    sum(l.qty_remaining * l.unit_cost_try) filter (where l.location = 'mekonsis') as mekonsis_value_try,
    sum(l.qty_remaining * l.unit_cost_usd) filter (where l.location = 'mekonsis') as mekonsis_value_usd
  from public.stock_layers l
  group by l.variant_id
),
deliv as (
  select d.variant_id, sum(d.quantity) as delivered_qty
  from public.deliveries d
  where d.status = 'active'
  group by d.variant_id
),
sold as (
  select
    si.variant_id,
    sum(si.quantity) as sold_qty,
    sum(si.revenue_try) as revenue_try,
    sum(si.revenue_usd) as revenue_usd,
    sum(si.cogs_try) as cogs_try,
    sum(si.cogs_usd) as cogs_usd,
    sum(si.gross_profit_try) as gross_profit_try,
    sum(si.gross_profit_usd) as gross_profit_usd,
    max(s.sold_on) as last_sold_on
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.status = 'completed'
  group by si.variant_id
),
last_batch as (
  select distinct on (b.variant_id)
    b.variant_id,
    b.batch_no as last_batch_no,
    b.completed_at as last_completed_at,
    b.unit_cost_usd as last_unit_cost_usd,
    b.unit_cost_try as last_unit_cost_try,
    b.prev_batch_no,
    b.prev_unit_cost_usd,
    b.prev_unit_cost_try,
    b.unit_cost_usd_change_pct,
    b.unit_cost_try_change_pct
  from public.v_batches b
  where b.status = 'completed' and b.kind = 'production'
  order by b.variant_id, b.completed_at desc, b.batch_no desc
)
select
  v.id as variant_id,
  v.product_id,
  v.product_code,
  v.product_name,
  v.variant_code,
  v.variant_name,
  v.display_name,
  v.is_active,
  v.sale_price,
  v.currency,
  v.unit_production_minutes,
  v.critical_stock,
  v.min_stock,
  v.target_stock,
  coalesce(p.produced_qty, 0)::integer as produced_qty,
  coalesce(p.in_production_qty, 0)::integer as in_production_qty,
  coalesce(d.delivered_qty, 0)::integer as delivered_qty,
  coalesce(so.sold_qty, 0)::integer as sold_qty,
  coalesce(st.heatemp_qty, 0)::integer as heatemp_qty,
  coalesce(st.mekonsis_qty, 0)::integer as mekonsis_qty,
  (coalesce(st.heatemp_qty, 0) + coalesce(st.mekonsis_qty, 0))::integer as total_remaining,
  case
    when coalesce(st.heatemp_qty, 0) + coalesce(st.mekonsis_qty, 0) <= v.critical_stock then 'critical'
    when coalesce(st.heatemp_qty, 0) + coalesce(st.mekonsis_qty, 0) <= v.min_stock then 'low'
    when coalesce(st.heatemp_qty, 0) + coalesce(st.mekonsis_qty, 0) < v.target_stock then 'below_target'
    else 'ok'
  end as stock_status,
  round(coalesce(st.heatemp_value_try, 0), 4) as heatemp_value_try,
  round(coalesce(st.heatemp_value_usd, 0), 4) as heatemp_value_usd,
  round(coalesce(st.mekonsis_value_try, 0), 4) as mekonsis_value_try,
  round(coalesce(st.mekonsis_value_usd, 0), 4) as mekonsis_value_usd,
  round(coalesce(st.heatemp_value_try, 0) + coalesce(st.mekonsis_value_try, 0), 4) as finished_value_try,
  round(coalesce(st.heatemp_value_usd, 0) + coalesce(st.mekonsis_value_usd, 0), 4) as finished_value_usd,
  round(coalesce(p.production_spend_try, 0), 4) as production_spend_try,
  round(coalesce(p.production_spend_usd, 0), 4) as production_spend_usd,
  round(coalesce(p.wip_value_try, 0), 4) as wip_value_try,
  round(coalesce(p.wip_value_usd, 0), 4) as wip_value_usd,
  coalesce(p.production_minutes, 0) as production_minutes,
  round(coalesce(so.revenue_try, 0), 4) as revenue_try,
  round(coalesce(so.revenue_usd, 0), 4) as revenue_usd,
  round(coalesce(so.cogs_try, 0), 4) as cogs_try,
  round(coalesce(so.cogs_usd, 0), 4) as cogs_usd,
  round(coalesce(so.gross_profit_try, 0), 4) as gross_profit_try,
  round(coalesce(so.gross_profit_usd, 0), 4) as gross_profit_usd,
  case when so.revenue_try > 0 then round(so.gross_profit_try / so.revenue_try * 100, 2) end as margin_pct,
  so.last_sold_on,
  lb.last_batch_no,
  lb.last_completed_at,
  lb.last_unit_cost_usd,
  lb.last_unit_cost_try,
  lb.prev_batch_no,
  lb.prev_unit_cost_usd,
  lb.prev_unit_cost_try,
  lb.unit_cost_usd_change_pct,
  lb.unit_cost_try_change_pct,
  coalesce(p.opening_qty, 0)::integer as opening_qty,
  round(coalesce(p.opening_value_try, 0), 4) as opening_value_try
from public.v_variants v
left join prod p on p.variant_id = v.id
left join stock st on st.variant_id = v.id
left join deliv d on d.variant_id = v.id
left join sold so on so.variant_id = v.id
left join last_batch lb on lb.variant_id = v.id;

create or replace view public.v_financial_summary with (security_invoker = true) as
select
  coalesce(sum(o.revenue_try), 0) as revenue_try,
  coalesce(sum(o.cogs_try), 0) as cogs_try,
  coalesce(sum(o.gross_profit_try), 0) as gross_profit_try,
  case when sum(o.revenue_try) > 0 then round(sum(o.gross_profit_try) / sum(o.revenue_try) * 100, 2) end
    as margin_pct,
  coalesce(sum(o.revenue_usd), 0) as revenue_usd,
  coalesce(sum(o.cogs_usd), 0) as cogs_usd,
  coalesce(sum(o.gross_profit_usd), 0) as gross_profit_usd,
  coalesce(sum(o.production_spend_try), 0) as production_spend_try,
  coalesce(sum(o.production_spend_usd), 0) as production_spend_usd,
  coalesce(sum(o.wip_value_try), 0) as wip_value_try,
  coalesce(sum(o.heatemp_value_try), 0) as heatemp_value_try,
  coalesce(sum(o.heatemp_value_usd), 0) as heatemp_value_usd,
  coalesce(sum(o.mekonsis_value_try), 0) as mekonsis_value_try,
  coalesce(sum(o.mekonsis_value_usd), 0) as mekonsis_value_usd,
  coalesce(sum(o.finished_value_try), 0) as finished_value_try,
  coalesce(sum(o.finished_value_usd), 0) as finished_value_usd,
  (select coalesce(round(sum(b.value_try), 4), 0) from public.material_balances b) as material_value_try,
  (select coalesce(round(sum(b.value_usd), 4), 0) from public.material_balances b) as material_value_usd,
  coalesce(sum(o.produced_qty), 0)::integer as produced_qty,
  coalesce(sum(o.sold_qty), 0)::integer as sold_qty,
  coalesce(sum(o.heatemp_qty), 0)::integer as heatemp_qty,
  coalesce(sum(o.mekonsis_qty), 0)::integer as mekonsis_qty,
  coalesce(sum(o.in_production_qty), 0)::integer as in_production_qty,
  coalesce(sum(o.opening_value_try), 0) as opening_value_try
from public.v_variant_overview o;

revoke all on public.v_batches, public.v_variant_overview, public.v_financial_summary from anon;

do $$ begin perform private.lock_down_public_functions(); end $$;
