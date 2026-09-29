-- =====================================================================
-- Heatemp ERP — Raf ve teslimat ekranı özetleri (salt okunur)
-- shelf_monthly_movements : bir raftaki (heatemp | mekonsis) mamul hareketlerinin
--                           ay, hareket türü ve parti türüne (üretim / açılış) göre toplamı.
-- delivery_daily_summary  : seçilen aralıktaki teslimatların gün bazında toplamı
--                           (aktif ve geri alınanlar ayrı; isteğe bağlı ürün filtresi).
-- delivery_by_variant     : seçilen aralıktaki aktif teslimatların varyant bazında toplamı.
-- Teslimat satış değildir: bu özetler ciro veya kâr üretmez, yalnız adet ve
-- parti maliyeti (TL) taşır. Açılış stoğu (kind = 'opening') batch_kind ile ayrılır.
-- Yeni tablo, sütun, RLS veya yazma yetkisi yoktur; fonksiyonlar security invoker
-- olduğundan mevcut okuma kuralları aynen geçerlidir.
-- =====================================================================

create or replace function public.shelf_monthly_movements(p_location text, p_from date, p_to date)
returns table (
  month_start date,
  movement_type text,
  batch_kind text,
  movement_count integer,
  qty integer,
  value_try numeric,
  value_usd numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    date_trunc('month', m.movement_date)::date,
    m.movement_type,
    b.kind,
    count(*)::integer,
    sum(m.qty)::integer,
    round(sum(m.qty * m.unit_cost_try), 4),
    round(sum(m.qty * m.unit_cost_usd), 4)
  from public.stock_movements m
  join public.production_batches b on b.id = m.batch_id
  where m.location = p_location
    and m.movement_date between p_from and p_to
  group by 1, 2, 3
$$;

comment on function public.shelf_monthly_movements(text, date, date) is
  'Raf hareketlerinin aylık özeti. qty işaretlidir (giriş +, çıkış −). batch_kind = opening satırları açılış stoğudur, üretim sayılmaz.';

create or replace function public.delivery_daily_summary(p_from date, p_to date, p_product_id uuid default null)
returns table (
  delivered_on date,
  delivery_count integer,
  quantity integer,
  cost_try numeric,
  sold_qty integer,
  remaining_qty integer,
  cancelled_count integer,
  cancelled_qty integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    d.delivered_on,
    count(*) filter (where d.status = 'active')::integer,
    coalesce(sum(d.quantity) filter (where d.status = 'active'), 0)::integer,
    round(coalesce(sum(d.delivered_cost_try) filter (where d.status = 'active'), 0), 4),
    coalesce(sum(d.sold_qty) filter (where d.status = 'active'), 0)::integer,
    coalesce(sum(d.remaining_qty) filter (where d.status = 'active'), 0)::integer,
    count(*) filter (where d.status = 'cancelled')::integer,
    coalesce(sum(d.quantity) filter (where d.status = 'cancelled'), 0)::integer
  from public.v_deliveries d
  where d.delivered_on between p_from and p_to
    and (p_product_id is null or d.product_id = p_product_id)
  group by d.delivered_on
$$;

comment on function public.delivery_daily_summary(date, date, uuid) is
  'Teslimatların gün bazında özeti (satış değildir). Aktif teslimatlar ile geri alınanlar ayrı sütunlardadır.';

create or replace function public.delivery_by_variant(p_from date, p_to date, p_product_id uuid default null)
returns table (
  variant_id uuid,
  product_id uuid,
  display_name text,
  delivery_count integer,
  quantity integer,
  cost_try numeric,
  sold_qty integer,
  remaining_qty integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    d.variant_id,
    d.product_id,
    d.display_name,
    count(*)::integer,
    sum(d.quantity)::integer,
    round(sum(d.delivered_cost_try), 4),
    sum(d.sold_qty)::integer,
    sum(d.remaining_qty)::integer
  from public.v_deliveries d
  where d.status = 'active'
    and d.delivered_on between p_from and p_to
    and (p_product_id is null or d.product_id = p_product_id)
  group by d.variant_id, d.product_id, d.display_name
$$;

comment on function public.delivery_by_variant(date, date, uuid) is
  'Aktif teslimatların varyant bazında özeti (satış değildir; ciro/kâr içermez).';

do $$ begin perform private.lock_down_public_functions(); end $$;
