-- =====================================================================
-- Heatemp ERP — Üretim ekranı özetleri (salt okunur)
-- v_batch_summary        : parti durumlarına göre sayılar, adetler ve değerler (tek satır).
-- production_monthly     : gerçek üretim partilerinin aylık özeti (Türkiye saatiyle ay).
-- production_by_variant  : seçilen aralıkta tamamlanan üretim partilerinin varyant bazında toplamı.
-- Açılış stoğu (kind = 'opening') ÜRETİM SAYILMAZ: üretim toplamlarına katılmaz,
-- v_batch_summary'de ayrı sütunlarda verilir.
-- Yeni tablo, sütun, RLS veya yazma yetkisi yoktur (görünüm security_invoker,
-- fonksiyonlar security invoker); mevcut okuma kuralları aynen geçerlidir.
-- =====================================================================

create or replace view public.v_batch_summary with (security_invoker = true) as
select
  count(*)::integer as all_batches,
  count(*) filter (where b.status = 'in_production')::integer as in_production_batches,
  coalesce(sum(b.quantity) filter (where b.status = 'in_production'), 0)::integer as in_production_qty,
  round(coalesce(sum(b.total_cost_try) filter (where b.status = 'in_production'), 0), 4) as wip_value_try,
  round(coalesce(sum(b.total_cost_usd) filter (where b.status = 'in_production'), 0), 4) as wip_value_usd,
  count(*) filter (where b.status = 'completed' and b.kind = 'production')::integer as completed_batches,
  coalesce(sum(b.quantity) filter (where b.status = 'completed' and b.kind = 'production'), 0)::integer as produced_qty,
  count(*) filter (where b.status = 'cancelled')::integer as cancelled_batches,
  count(*) filter (where b.kind = 'opening')::integer as opening_batches,
  coalesce(sum(b.quantity) filter (where b.kind = 'opening'), 0)::integer as opening_qty,
  round(coalesce(sum(b.total_cost_try) filter (where b.kind = 'opening'), 0), 4) as opening_value_try,
  round(coalesce(sum(b.total_cost_usd) filter (where b.kind = 'opening'), 0), 4) as opening_value_usd
from public.production_batches b;

comment on view public.v_batch_summary is
  'Parti durum özeti. completed_* ve produced_qty yalnız gerçek üretim partileridir; açılış stoğu opening_* sütunlarındadır.';

-- Aylık özet (yalnız kind = production). Ay, olayın kendi zamanına göre belirlenir:
-- başlatma → started_at, tamamlama → completed_at, iptal → cancelled_at (Europe/Istanbul).
create or replace function public.production_monthly(p_from date default null)
returns table (
  month_start date,
  started_batches integer,
  started_qty integer,
  completed_batches integer,
  completed_qty integer,
  completed_cost_try numeric,
  completed_cost_usd numeric,
  completed_estimated_minutes numeric,
  completed_actual_minutes numeric,
  cancelled_batches integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ev as (
    select date_trunc('month', b.started_at at time zone 'Europe/Istanbul')::date as m,
           'start'::text as t, b.quantity, 0::numeric as c_try, 0::numeric as c_usd,
           0::numeric as est, 0::numeric as act
      from public.production_batches b
     where b.kind = 'production'
    union all
    select date_trunc('month', b.completed_at at time zone 'Europe/Istanbul')::date,
           'complete', b.quantity, b.total_cost_try, b.total_cost_usd,
           b.estimated_minutes, coalesce(b.actual_minutes, 0)
      from public.production_batches b
     where b.kind = 'production' and b.status = 'completed'
    union all
    select date_trunc('month', b.cancelled_at at time zone 'Europe/Istanbul')::date,
           'cancel', b.quantity, 0, 0, 0, 0
      from public.production_batches b
     where b.kind = 'production' and b.status = 'cancelled'
  )
  select
    ev.m,
    count(*) filter (where ev.t = 'start')::integer,
    coalesce(sum(ev.quantity) filter (where ev.t = 'start'), 0)::integer,
    count(*) filter (where ev.t = 'complete')::integer,
    coalesce(sum(ev.quantity) filter (where ev.t = 'complete'), 0)::integer,
    round(coalesce(sum(ev.c_try) filter (where ev.t = 'complete'), 0), 4),
    round(coalesce(sum(ev.c_usd) filter (where ev.t = 'complete'), 0), 4),
    coalesce(sum(ev.est) filter (where ev.t = 'complete'), 0),
    coalesce(sum(ev.act) filter (where ev.t = 'complete'), 0),
    count(*) filter (where ev.t = 'cancel')::integer
  from ev
  where p_from is null or ev.m >= date_trunc('month', p_from)::date
  group by ev.m
  order by ev.m
$$;

-- Seçilen aralıkta (her iki uç dahil, Türkiye günü) tamamlanan üretim partileri, varyant bazında.
create or replace function public.production_by_variant(p_from date, p_to date)
returns table (
  variant_id uuid,
  product_id uuid,
  product_name text,
  variant_name text,
  display_name text,
  batches integer,
  quantity integer,
  cost_try numeric,
  cost_usd numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    b.variant_id,
    v.product_id,
    v.product_name,
    v.variant_name,
    v.display_name,
    count(*)::integer,
    sum(b.quantity)::integer,
    round(sum(b.total_cost_try), 4),
    round(sum(b.total_cost_usd), 4)
  from public.production_batches b
  join public.v_variants v on v.id = b.variant_id
  where b.kind = 'production'
    and b.status = 'completed'
    and (b.completed_at at time zone 'Europe/Istanbul')::date between p_from and p_to
  group by b.variant_id, v.product_id, v.product_name, v.variant_name, v.display_name
  order by sum(b.quantity) desc, v.display_name
$$;

-- Parti listesi: v_batches + liste tarihi. Açılış partisinin "başlama"sı kayıt zamanı
-- değil, stok (açılış) tarihidir: stock_layers.received_on, Türkiye günü başı olarak.
-- Listedeki tarih filtresi ve sıralama list_started_at ile yapılır; üretim partilerinde
-- list_started_at = started_at.
create or replace view public.v_batch_list with (security_invoker = true) as
select
  b.*,
  case when b.kind = 'opening' then hl.received_on end as opening_date,
  case when b.kind = 'opening' and hl.received_on is not null
       then hl.received_on::timestamp at time zone 'Europe/Istanbul'
       else b.started_at end as list_started_at
from public.v_batches b
left join public.stock_layers hl on hl.batch_id = b.id and hl.location = 'heatemp';

comment on view public.v_batch_list is
  'Parti listesi. opening_date: açılış partisinin stok tarihi; list_started_at: açılışta stok tarihi (Türkiye günü başı), üretimde started_at.';

revoke all on public.v_batch_summary from anon;
grant select on public.v_batch_summary to authenticated;
revoke all on public.v_batch_list from anon;
grant select on public.v_batch_list to authenticated;

do $$ begin perform private.lock_down_public_functions(); end $$;
