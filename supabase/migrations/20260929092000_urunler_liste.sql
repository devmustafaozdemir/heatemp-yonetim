-- =====================================================================
-- Heatemp ERP — Ürünler ekranı raporları (salt okunur)
-- 1) v_variant_recipe_cost: varyant başına 1 adetlik TAHMİNİ reçete maliyeti.
--    simulate_production ile aynı kural: malzemenin güncel hareketli ağırlıklı
--    ortalama maliyeti; stok yoksa son alış maliyeti. Gerçekleşmiş parti
--    maliyeti DEĞİLDİR (o, üretim başlatılınca partiye sabitlenir).
-- 2) v_product_list: ürün listesi için varyant özetleri (sayılar, kodlar,
--    stok, en kötü stok durumu, maliyet aralıkları). Liste sunucu tarafında
--    filtrelenip sıralanabilsin diye tek görünümde toplanır.
-- Yeni tablo, sütun, RLS veya yazma yetkisi yoktur; görünümler security_invoker
-- olduğundan mevcut satır erişimi aynen geçerlidir.
-- =====================================================================

create or replace view public.v_variant_recipe_cost with (security_invoker = true) as
with lines as (
  select
    b.variant_id,
    b.qty_per_unit,
    case when bal.qty > 0 then bal.value_try / bal.qty else lp.unit_cost_try end as unit_cost_try,
    case when bal.qty > 0 then bal.value_usd / bal.qty else lp.unit_cost_usd end as unit_cost_usd
  from public.bom_items b
  join public.material_balances bal on bal.material_id = b.material_id
  left join lateral (
    select mm.unit_cost_try, mm.unit_cost_usd
      from public.material_movements mm
     where mm.material_id = b.material_id and mm.movement_type = 'purchase'
     order by mm.movement_date desc, mm.id desc
     limit 1
  ) lp on true
)
select
  v.id as variant_id,
  v.product_id,
  count(l.variant_id)::integer as bom_line_count,
  coalesce(bool_and(l.unit_cost_try is not null) filter (where l.variant_id is not null), false) as cost_complete,
  round(sum(l.qty_per_unit * l.unit_cost_try), 4) as est_unit_cost_try,
  round(sum(l.qty_per_unit * l.unit_cost_usd), 4) as est_unit_cost_usd
from public.product_variants v
left join lines l on l.variant_id = v.id
group by v.id, v.product_id;

comment on view public.v_variant_recipe_cost is
  'Varyant başına 1 adetlik tahmini reçete maliyeti (güncel ortalama malzeme maliyeti). Gerçekleşmiş parti maliyeti değildir.';

create or replace view public.v_product_list with (security_invoker = true) as
with vv as (
  select
    o.product_id,
    o.variant_id,
    pv.is_active as variant_active,
    o.variant_code,
    o.total_remaining,
    o.heatemp_qty,
    o.mekonsis_qty,
    o.opening_qty,
    o.critical_stock,
    o.min_stock,
    o.target_stock,
    o.stock_status,
    case o.stock_status when 'critical' then 3 when 'low' then 2 when 'below_target' then 1 else 0 end as severity,
    o.last_unit_cost_usd,
    o.last_unit_cost_try,
    o.last_completed_at,
    pv.sale_price is not null as price_overridden,
    pv.unit_production_minutes is not null as minutes_overridden,
    rc.bom_line_count,
    rc.est_unit_cost_usd,
    rc.est_unit_cost_try
  from public.v_variant_overview o
  join public.product_variants pv on pv.id = o.variant_id
  left join public.v_variant_recipe_cost rc on rc.variant_id = o.variant_id
),
agg as (
  select
    vv.product_id,
    count(*)::integer as variant_count,
    (count(*) filter (where vv.variant_active))::integer as active_variant_count,
    string_agg(vv.variant_code, ', ' order by vv.variant_code) as variant_codes,
    sum(vv.total_remaining)::integer as total_remaining,
    sum(vv.heatemp_qty)::integer as heatemp_qty,
    sum(vv.mekonsis_qty)::integer as mekonsis_qty,
    sum(vv.opening_qty)::integer as opening_qty,
    (count(*) filter (where vv.variant_active and vv.stock_status = 'critical'))::integer as critical_variant_count,
    (count(*) filter (where vv.variant_active and vv.stock_status = 'low'))::integer as low_variant_count,
    (count(*) filter (where vv.variant_active and vv.stock_status = 'below_target'))::integer as below_target_variant_count,
    (count(*) filter (where vv.variant_active and vv.stock_status = 'ok'))::integer as ok_variant_count,
    (count(*) filter (where vv.variant_active and coalesce(vv.bom_line_count, 0) = 0))::integer as no_bom_variant_count,
    (count(*) filter (where vv.price_overridden))::integer as price_override_count,
    (count(*) filter (where vv.minutes_overridden))::integer as minutes_override_count,
    min(vv.est_unit_cost_usd) as est_cost_usd_min,
    max(vv.est_unit_cost_usd) as est_cost_usd_max,
    min(vv.est_unit_cost_try) as est_cost_try_min,
    max(vv.est_unit_cost_try) as est_cost_try_max,
    min(vv.last_unit_cost_usd) as last_cost_usd_min,
    max(vv.last_unit_cost_usd) as last_cost_usd_max,
    min(vv.last_unit_cost_try) as last_cost_try_min,
    max(vv.last_unit_cost_try) as last_cost_try_max,
    max(vv.last_completed_at) as last_completed_at
  from vv
  group by vv.product_id
),
worst as (
  select distinct on (vv.product_id)
    vv.product_id,
    vv.variant_code,
    vv.stock_status,
    vv.severity,
    vv.total_remaining,
    vv.critical_stock,
    vv.min_stock,
    vv.target_stock
  from vv
  where vv.variant_active
  order by vv.product_id, vv.severity desc, vv.total_remaining, vv.variant_code
)
select
  p.id,
  p.code,
  p.name,
  p.description,
  p.image_path,
  p.default_sale_price,
  p.default_currency,
  p.unit_production_minutes,
  p.critical_stock,
  p.min_stock,
  p.target_stock,
  p.is_active,
  p.created_at,
  coalesce(a.variant_count, 0) as variant_count,
  coalesce(a.active_variant_count, 0) as active_variant_count,
  a.variant_codes,
  coalesce(a.total_remaining, 0) as total_remaining,
  coalesce(a.heatemp_qty, 0) as heatemp_qty,
  coalesce(a.mekonsis_qty, 0) as mekonsis_qty,
  coalesce(a.opening_qty, 0) as opening_qty,
  coalesce(a.critical_variant_count, 0) as critical_variant_count,
  coalesce(a.low_variant_count, 0) as low_variant_count,
  coalesce(a.below_target_variant_count, 0) as below_target_variant_count,
  coalesce(a.ok_variant_count, 0) as ok_variant_count,
  coalesce(a.no_bom_variant_count, 0) as no_bom_variant_count,
  coalesce(a.price_override_count, 0) as price_override_count,
  coalesce(a.minutes_override_count, 0) as minutes_override_count,
  a.est_cost_usd_min,
  a.est_cost_usd_max,
  a.est_cost_try_min,
  a.est_cost_try_max,
  a.last_cost_usd_min,
  a.last_cost_usd_max,
  a.last_cost_try_min,
  a.last_cost_try_max,
  a.last_completed_at,
  w.variant_code as worst_variant_code,
  w.stock_status as worst_stock_status,
  w.severity as worst_severity,
  w.total_remaining as worst_total_remaining,
  w.critical_stock as worst_critical_stock,
  w.min_stock as worst_min_stock,
  w.target_stock as worst_target_stock
from public.products p
left join agg a on a.product_id = p.id
left join worst w on w.product_id = p.id;

comment on view public.v_product_list is
  'Ürün listesi: varyant sayıları/kodları, Heatemp + Mekonsis stok, en kötü aktif varyant stok durumu, tahmini reçete ve son gerçekleşmiş parti maliyeti aralıkları.';

revoke all on public.v_variant_recipe_cost from anon;
revoke all on public.v_product_list from anon;
grant select on public.v_variant_recipe_cost to authenticated;
grant select on public.v_product_list to authenticated;

do $$ begin perform private.lock_down_public_functions(); end $$;
