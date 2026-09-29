-- =====================================================================
-- Heatemp ERP — Satışlar ekranı (salt okunur)
-- sales_filtered       : satış listesinin tek filtre kaynağı (dönem, arama, ürün,
--                        varyant, müşteri, durum). setof v_sales döndürür; PostgREST
--                        üzerinden sıralama, sayfalama ve count=exact uygulanır.
-- sales_list_summary   : aynı filtrelerle özet kartları ve grafikler için toplamlar
--                        (yalnız status = completed; iptaller ayrı sayılır). Ürün veya
--                        varyant filtresinde tutarlar (iptal tutarı dahil) yalnız ilgili
--                        kalemlerden toplanır.
-- v_sale_fifo_layers   : yeni satış formundaki tahmini FIFO maliyet önizlemesi için
--                        Mekonsis rafındaki açık parti katmanları (record_sale ile aynı
--                        sıra: received_on, fifo_seq).
-- Yeni tablo, sütun, RLS veya yazma yetkisi yoktur; görünüm security_invoker,
-- fonksiyonlar security invoker olduğundan mevcut okuma kuralları aynen geçerlidir.
-- =====================================================================

create or replace function public.sales_filtered(
  p_from date default null,
  p_to date default null,
  p_q text default null,
  p_product_id uuid default null,
  p_variant_id uuid default null,
  p_customer_id uuid default null,
  p_no_customer boolean default false,
  p_status text default null
)
returns setof public.v_sales
language sql
stable
security invoker
set search_path = ''
as $$
  select s.*
  from public.v_sales s
  where (p_from is null or s.sold_on >= p_from)
    and (p_to is null or s.sold_on <= p_to)
    and (p_status is null or s.status = p_status)
    and (p_customer_id is null or s.customer_id = p_customer_id)
    and (not coalesce(p_no_customer, false) or s.customer_id is null)
    and (
      p_q is null
      or s.sale_no ilike p_q
      or s.items_summary ilike p_q
      or s.customer_name ilike p_q
    )
    and (
      p_variant_id is null
      or exists (select 1 from public.sale_items si where si.sale_id = s.id and si.variant_id = p_variant_id)
    )
    and (
      p_product_id is null
      or exists (
        select 1
          from public.sale_items si
          join public.product_variants pv on pv.id = si.variant_id
         where si.sale_id = s.id and pv.product_id = p_product_id
      )
    )
$$;

comment on function public.sales_filtered(date, date, text, uuid, uuid, uuid, boolean, text) is
  'Satış listesi filtresi. p_q bir ILIKE desenidir (%metin%). p_no_customer = true: müşterisi olmayan (perakende) satışlar.';

create or replace function public.sales_list_summary(
  p_from date default null,
  p_to date default null,
  p_q text default null,
  p_product_id uuid default null,
  p_variant_id uuid default null,
  p_customer_id uuid default null,
  p_no_customer boolean default false,
  p_monthly boolean default true
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (
    select f.id, f.status
      from public.sales_filtered(p_from, p_to, p_q, p_product_id, p_variant_id, p_customer_id, p_no_customer, null) f
  ),
  -- Filtreyle eşleşen kalemler (ürün/varyant filtresinde yalnız ilgili kalemler);
  -- toplamlar ve iptal tutarı aynı kalem tabanından hesaplanır.
  fl as (
    select l.*
      from public.v_sale_lines l
      join s on s.id = l.sale_id
     where (p_product_id is null or l.product_id = p_product_id)
       and (p_variant_id is null or l.variant_id = p_variant_id)
  ),
  l as (
    select fl.* from fl where fl.status = 'completed'
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'sale_count', count(distinct l.sale_id),
        'quantity', coalesce(sum(l.quantity), 0),
        'revenue_try', coalesce(round(sum(l.revenue_try), 2), 0),
        'revenue_usd', coalesce(round(sum(l.revenue_usd), 2), 0),
        'cogs_try', coalesce(round(sum(l.cogs_try), 2), 0),
        'gross_profit_try', coalesce(round(sum(l.gross_profit_try), 2), 0),
        'customer_count', count(distinct l.customer_id),
        'first_day', min(l.sold_on),
        'last_day', max(l.sold_on)
      )
      from l
    ),
    'cancelled', (
      select jsonb_build_object('sale_count', count(distinct fl.sale_id), 'revenue_try', coalesce(round(sum(fl.revenue_try), 2), 0))
        from fl
       where fl.status = 'cancelled'
    ),
    'series', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.bucket), '[]'::jsonb)
        from (
          select
            case when coalesce(p_monthly, true) then date_trunc('month', l.sold_on)::date else l.sold_on end as bucket,
            count(distinct l.sale_id)::integer as sale_count,
            sum(l.quantity)::integer as quantity,
            round(sum(l.revenue_try), 2) as revenue_try,
            round(sum(l.cogs_try), 2) as cogs_try,
            round(sum(l.gross_profit_try), 2) as gross_profit_try
          from l
          group by 1
        ) x
    ),
    'by_customer', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.revenue_try desc), '[]'::jsonb)
        from (
          select
            l.customer_id,
            max(l.customer_name) as customer_name,
            count(distinct l.sale_id)::integer as sale_count,
            sum(l.quantity)::integer as quantity,
            round(sum(l.revenue_try), 2) as revenue_try,
            round(sum(l.gross_profit_try), 2) as gross_profit_try
          from l
          group by l.customer_id
        ) x
    ),
    'by_variant', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.revenue_try desc), '[]'::jsonb)
        from (
          select
            l.variant_id,
            l.product_id,
            l.display_name,
            count(distinct l.sale_id)::integer as sale_count,
            sum(l.quantity)::integer as quantity,
            round(sum(l.revenue_try), 2) as revenue_try,
            round(sum(l.gross_profit_try), 2) as gross_profit_try
          from l
          group by l.variant_id, l.product_id, l.display_name
        ) x
    )
  )
$$;

comment on function public.sales_list_summary(date, date, text, uuid, uuid, uuid, boolean, boolean) is
  'Satışlar ekranı özeti: yalnız gerçekleşmiş satışların toplamları, dönem serisi, müşteri ve varyant kırılımı; iptaller ayrı sayılır.';

create or replace view public.v_sale_fifo_layers with (security_invoker = true) as
select
  l.id as layer_id,
  l.variant_id,
  l.batch_id,
  b.batch_no,
  b.kind as batch_kind,
  l.delivery_id,
  d.delivery_no,
  l.received_on,
  l.fifo_seq,
  l.qty_remaining,
  l.unit_cost_try,
  l.unit_cost_usd
from public.stock_layers l
join public.production_batches b on b.id = l.batch_id
join public.deliveries d on d.id = l.delivery_id
where l.location = 'mekonsis'
  and l.qty_out < l.qty_in;

comment on view public.v_sale_fifo_layers is
  'Mekonsis rafındaki açık parti katmanları (FIFO sırası: received_on, fifo_seq). Yalnız tahmini maliyet önizlemesi içindir; kesin maliyet record_sale içinde hesaplanır.';

revoke all on public.v_sale_fifo_layers from anon;
grant select on public.v_sale_fifo_layers to authenticated;

do $$ begin perform private.lock_down_public_functions(); end $$;
