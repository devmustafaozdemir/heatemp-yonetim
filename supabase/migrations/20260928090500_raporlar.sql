-- =====================================================================
-- Heatemp ERP — 6/8 Dashboard ve Kasa görünümleri
-- Dashboard ve Kasa aynı görünümden (v_variant_overview) beslenir; böylece
-- iki ekrandaki rakamlar aynı satış ve stok kayıtlarından türetilir.
-- Finansal toplamların temeli TRY işlem günü değeridir. USD alanları yalnızca
-- bilgi amaçlıdır (her işlem kendi günündeki kurla çevrilmiştir).
-- =====================================================================

create view public.v_variant_overview with (security_invoker = true) as
with prod as (
  select
    b.variant_id,
    sum(b.quantity) filter (where b.status = 'completed') as produced_qty,
    sum(b.quantity) filter (where b.status = 'in_production') as in_production_qty,
    sum(b.total_cost_try) filter (where b.status in ('completed', 'in_production')) as production_spend_try,
    sum(b.total_cost_usd) filter (where b.status in ('completed', 'in_production')) as production_spend_usd,
    sum(b.total_cost_try) filter (where b.status = 'in_production') as wip_value_try,
    sum(b.total_cost_usd) filter (where b.status = 'in_production') as wip_value_usd,
    sum(b.actual_minutes) filter (where b.status = 'completed') as production_minutes
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
  where b.status = 'completed'
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
  lb.unit_cost_try_change_pct
from public.v_variants v
left join prod p on p.variant_id = v.id
left join stock st on st.variant_id = v.id
left join deliv d on d.variant_id = v.id
left join sold so on so.variant_id = v.id
left join last_batch lb on lb.variant_id = v.id;

-- Kasa: finansal özet (gerçek nakit bakiyesi değildir)
create view public.v_financial_summary with (security_invoker = true) as
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
  coalesce(sum(o.in_production_qty), 0)::integer as in_production_qty
from public.v_variant_overview o;

create view public.v_sales_daily with (security_invoker = true) as
select
  s.sold_on as day,
  count(*)::integer as sale_count,
  sum(s.total_quantity)::integer as quantity,
  round(sum(s.revenue_try), 2) as revenue_try,
  round(sum(s.cogs_try), 2) as cogs_try,
  round(sum(s.gross_profit_try), 2) as gross_profit_try
from public.sales s
where s.status = 'completed'
group by s.sold_on;

create view public.v_sales_monthly with (security_invoker = true) as
select
  date_trunc('month', s.sold_on)::date as month,
  count(*)::integer as sale_count,
  sum(s.total_quantity)::integer as quantity,
  round(sum(s.revenue_try), 2) as revenue_try,
  round(sum(s.cogs_try), 2) as cogs_try,
  round(sum(s.gross_profit_try), 2) as gross_profit_try
from public.sales s
where s.status = 'completed'
group by date_trunc('month', s.sold_on);

-- Defter tutarlılık kontrolü: bakiyeler hareketlerin toplamına eşit olmalı.
-- Boş sonuç = tutarlı. (Testlerde ve yönetim kontrolünde kullanılır.)
create or replace function public.ledger_inconsistencies()
returns table (area text, ref_id text, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_member();
  return query
    select 'hammadde'::text, b.material_id::text,
           format('bakiye %s, hareket toplamı %s', b.qty, coalesce(m.qty, 0))
      from public.material_balances b
      left join (select material_id, sum(qty) as qty, sum(value_try) as value_try
                   from public.material_movements group by material_id) m on m.material_id = b.material_id
     where b.qty <> coalesce(m.qty, 0) or abs(b.value_try - coalesce(m.value_try, 0)) > 0.01;
  return query
    select 'mamul'::text, l.id::text,
           format('katman kalan %s, hareket toplamı %s', l.qty_remaining, coalesce(sm.qty, 0))
      from public.stock_layers l
      left join (select layer_id, sum(qty) as qty from public.stock_movements group by layer_id) sm
        on sm.layer_id = l.id
     where l.qty_remaining <> coalesce(sm.qty, 0);
  return query
    select 'satış'::text, si.id::text,
           format('kalem adedi %s, FIFO tahsis toplamı %s', si.quantity, coalesce(a.qty, 0))
      from public.sale_items si
      left join (select sale_item_id, sum(quantity) as qty from public.sale_allocations group by sale_item_id) a
        on a.sale_item_id = si.id
     where si.quantity <> coalesce(a.qty, 0);
end
$$;

revoke all on public.v_variant_overview, public.v_financial_summary, public.v_sales_daily,
  public.v_sales_monthly from anon;

do $$ begin perform private.lock_down_public_functions(); end $$;
