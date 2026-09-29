-- =====================================================================
-- Heatemp ERP — Kurumsal müşteriler ekranı (salt okunur)
-- v_customer_list     : müşteri listesi; teklif sayıları (açık / dönüşen / iptal),
--                       açık teklif tutarları (para birimine göre ayrı), gerçekleşmiş
--                       satış özeti (yalnız status = completed; iptaller ayrı sayılır).
--                       Liste sunucu tarafında aranıp sıralanabilsin diye tek görünümde.
-- customers_overview  : liste ekranı grafikleri için aylık ciro serisi (kurumsal müşterili
--                       satışlar ve müşterisiz satışlar ayrı), seri dönemi toplamları ve toplam ciro.
-- customer_summary    : müşteri detayı için aylık ciro / brüt kâr serisi ve en çok alınan
--                       ürün-varyantlar (yalnız gerçekleşmiş satışlar).
-- quote_estimates     : birden çok açık teklifin tahmini kâr özeti tek çağrıda
--                       (mevcut quote_estimate kuralıyla).
-- quote_item_options  : teklif kalemi formu önizlemesi için varyant başına FIFO katmanları
--                       ve son parti maliyeti.
-- Teslimatlar satış değildir; bu görünüm ve fonksiyonlar yalnız sales tablosunu okur.
-- Yeni tablo, sütun, RLS veya yazma yetkisi yoktur; görünüm security_invoker,
-- fonksiyonlar security invoker olduğundan mevcut okuma kuralları aynen geçerlidir.
-- =====================================================================

create or replace view public.v_customer_list with (security_invoker = true) as
with q as (
  select
    q.customer_id,
    count(*)::integer as quote_count,
    count(*) filter (where q.status = 'open')::integer as open_quote_count,
    count(*) filter (where q.status = 'converted')::integer as converted_quote_count,
    count(*) filter (where q.status = 'cancelled')::integer as cancelled_quote_count,
    max(q.quote_date) as last_quote_date
  from public.quotes q
  group by q.customer_id
),
qa as (
  select
    q.customer_id,
    round(sum(qi.quantity * qi.unit_price) filter (where q.currency = 'USD'), 4) as open_amount_usd,
    round(sum(qi.quantity * qi.unit_price) filter (where q.currency = 'TRY'), 4) as open_amount_try
  from public.quotes q
  join public.quote_items qi on qi.quote_id = q.id
  where q.status = 'open'
  group by q.customer_id
),
s as (
  select
    s.customer_id,
    count(*) filter (where s.status = 'completed')::integer as sale_count,
    count(*) filter (where s.status = 'cancelled')::integer as cancelled_sale_count,
    coalesce(sum(s.total_quantity) filter (where s.status = 'completed'), 0)::integer as sold_qty,
    coalesce(round(sum(s.revenue_try) filter (where s.status = 'completed'), 4), 0) as revenue_try,
    coalesce(round(sum(s.revenue_usd) filter (where s.status = 'completed'), 4), 0) as revenue_usd,
    coalesce(round(sum(s.cogs_try) filter (where s.status = 'completed'), 4), 0) as cogs_try,
    coalesce(round(sum(s.gross_profit_try) filter (where s.status = 'completed'), 4), 0) as gross_profit_try,
    min(s.sold_on) filter (where s.status = 'completed') as first_sold_on,
    max(s.sold_on) filter (where s.status = 'completed') as last_sold_on
  from public.sales s
  where s.customer_id is not null
  group by s.customer_id
)
select
  c.id,
  c.name,
  c.tax_number,
  c.contact_name,
  c.phone,
  c.email,
  c.address,
  c.note,
  c.is_active,
  c.created_at,
  coalesce(q.quote_count, 0) as quote_count,
  coalesce(q.open_quote_count, 0) as open_quote_count,
  coalesce(q.converted_quote_count, 0) as converted_quote_count,
  coalesce(q.cancelled_quote_count, 0) as cancelled_quote_count,
  q.last_quote_date,
  qa.open_amount_usd,
  qa.open_amount_try,
  coalesce(s.sale_count, 0) as sale_count,
  coalesce(s.cancelled_sale_count, 0) as cancelled_sale_count,
  coalesce(s.sold_qty, 0) as sold_qty,
  coalesce(s.revenue_try, 0) as revenue_try,
  coalesce(s.revenue_usd, 0) as revenue_usd,
  coalesce(s.cogs_try, 0) as cogs_try,
  coalesce(s.gross_profit_try, 0) as gross_profit_try,
  case when s.revenue_try > 0 then round(s.gross_profit_try / s.revenue_try * 100, 2) end as margin_pct,
  s.first_sold_on,
  s.last_sold_on
from public.customers c
left join q on q.customer_id = c.id
left join qa on qa.customer_id = c.id
left join s on s.customer_id = c.id;

comment on view public.v_customer_list is
  'Kurumsal müşteri listesi: teklif sayıları, açık teklif tutarları (para birimine göre) ve yalnız gerçekleşmiş (completed) satışlardan ciro / brüt kâr.';

-- Liste ekranı: son p_months ay (ilk satış ayından önce başlamaz) için aylık ciro;
-- kurumsal müşterili ve müşterisiz satışlar ayrı. Yalnız gerçekleşmiş satışlar.
-- 'customers' ve 'top' özet kartlarını besler: tüm müşteri satırları istemciye
-- taşınmadan (PostgREST max_rows sınırına takılmadan) SQL'de toplanır.
create or replace function public.customers_overview(p_months integer default 12)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (
    select s.sold_on, s.customer_id, s.revenue_try, s.gross_profit_try
      from public.sales s
     where s.status = 'completed'
  ),
  bounds as (
    select
      greatest(
        (date_trunc('month', public.today_tr()) - make_interval(months => greatest(coalesce(p_months, 12), 1) - 1))::date,
        coalesce(date_trunc('month', (select min(sold_on) from s))::date, date_trunc('month', public.today_tr())::date)
      ) as first_month,
      date_trunc('month', public.today_tr())::date as last_month
  ),
  months as (
    select gs::date as month
      from bounds b, generate_series(b.first_month, b.last_month, interval '1 month') gs
  ),
  agg as (
    select
      date_trunc('month', s.sold_on)::date as month,
      round(coalesce(sum(s.revenue_try) filter (where s.customer_id is not null), 0), 4) as customer_revenue_try,
      round(coalesce(sum(s.revenue_try) filter (where s.customer_id is null), 0), 4) as other_revenue_try,
      round(coalesce(sum(s.gross_profit_try) filter (where s.customer_id is not null), 0), 4) as customer_profit_try,
      count(*) filter (where s.customer_id is not null)::integer as customer_sale_count,
      count(*) filter (where s.customer_id is null)::integer as other_sale_count
    from s
    group by 1
  )
  select jsonb_build_object(
    'customers', (
      select jsonb_build_object(
        'customer_count', count(*),
        'active_count', count(*) filter (where c.is_active),
        'buyer_count', count(*) filter (where c.sale_count > 0),
        'quote_count', coalesce(sum(c.quote_count), 0),
        'open_quote_count', coalesce(sum(c.open_quote_count), 0),
        'converted_quote_count', coalesce(sum(c.converted_quote_count), 0),
        'cancelled_quote_count', coalesce(sum(c.cancelled_quote_count), 0),
        'open_amount_usd', sum(c.open_amount_usd),
        'open_amount_try', sum(c.open_amount_try),
        'revenue_try', coalesce(sum(c.revenue_try), 0)
      )
      from public.v_customer_list c
    ),
    'top', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.revenue_try desc, t.name), '[]'::jsonb)
        from (
          select c.id, c.name, c.sale_count, c.revenue_try, c.gross_profit_try, c.margin_pct
            from public.v_customer_list c
           where c.revenue_try > 0
           order by c.revenue_try desc, c.name
           limit 6
        ) t
    ),
    'totals', (
      select jsonb_build_object(
        'revenue_try', coalesce(round(sum(s.revenue_try), 4), 0),
        'customer_revenue_try', coalesce(round(sum(s.revenue_try) filter (where s.customer_id is not null), 4), 0),
        'customer_profit_try', coalesce(round(sum(s.gross_profit_try) filter (where s.customer_id is not null), 4), 0),
        'sale_count', count(*),
        'customer_sale_count', count(*) filter (where s.customer_id is not null)
      )
      from s
    ),
    'period', (
      select jsonb_build_object(
        'customer_revenue_try', coalesce(round(sum(s.revenue_try) filter (where s.customer_id is not null), 4), 0),
        'other_revenue_try', coalesce(round(sum(s.revenue_try) filter (where s.customer_id is null), 4), 0),
        'customer_sale_count', count(*) filter (where s.customer_id is not null),
        'other_sale_count', count(*) filter (where s.customer_id is null)
      )
      from s, bounds b
      where s.sold_on >= b.first_month
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'month', to_char(m.month, 'YYYY-MM'),
          'customer_revenue_try', coalesce(a.customer_revenue_try, 0),
          'other_revenue_try', coalesce(a.other_revenue_try, 0),
          'customer_profit_try', coalesce(a.customer_profit_try, 0),
          'customer_sale_count', coalesce(a.customer_sale_count, 0),
          'other_sale_count', coalesce(a.other_sale_count, 0)
        ) order by m.month), '[]'::jsonb)
      from months m
      left join agg a on a.month = m.month
    )
  )
$$;

comment on function public.customers_overview(integer) is
  'Kurumsal müşteriler ekranı: aylık ciro serisi (müşterili / müşterisiz ayrı) ve toplamlar. Yalnız gerçekleşmiş satışlar.';

-- Müşteri detayı: aylık ciro / brüt kâr serisi (son p_months ay, ilk satış ayından
-- önce başlamaz) ve en çok alınan varyantlar. Yalnız gerçekleşmiş satışlar.
create or replace function public.customer_summary(p_customer_id uuid, p_months integer default 12)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (
    select s.id, s.sold_on, s.total_quantity, s.revenue_try, s.gross_profit_try
      from public.sales s
     where s.status = 'completed' and s.customer_id = p_customer_id
  ),
  bounds as (
    select
      greatest(
        (date_trunc('month', public.today_tr()) - make_interval(months => greatest(coalesce(p_months, 12), 1) - 1))::date,
        coalesce(date_trunc('month', (select min(sold_on) from s))::date, date_trunc('month', public.today_tr())::date)
      ) as first_month,
      date_trunc('month', public.today_tr())::date as last_month
  ),
  months as (
    select gs::date as month
      from bounds b, generate_series(b.first_month, b.last_month, interval '1 month') gs
  ),
  agg as (
    select
      date_trunc('month', s.sold_on)::date as month,
      count(*)::integer as sale_count,
      sum(s.total_quantity)::integer as quantity,
      round(sum(s.revenue_try), 4) as revenue_try,
      round(sum(s.gross_profit_try), 4) as gross_profit_try
    from s
    group by 1
  ),
  lines as (
    select l.variant_id, l.product_id, l.display_name, l.sale_id, l.quantity, l.revenue_try, l.gross_profit_try
      from public.v_sale_lines l
     where l.status = 'completed' and l.customer_id = p_customer_id
  )
  select jsonb_build_object(
    'period', (
      select jsonb_build_object(
        'sale_count', count(*),
        'quantity', coalesce(sum(s.total_quantity), 0),
        'revenue_try', coalesce(round(sum(s.revenue_try), 4), 0),
        'gross_profit_try', coalesce(round(sum(s.gross_profit_try), 4), 0)
      )
      from s, bounds b
      where s.sold_on >= b.first_month
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'month', to_char(m.month, 'YYYY-MM'),
          'sale_count', coalesce(a.sale_count, 0),
          'quantity', coalesce(a.quantity, 0),
          'revenue_try', coalesce(a.revenue_try, 0),
          'gross_profit_try', coalesce(a.gross_profit_try, 0)
        ) order by m.month), '[]'::jsonb)
      from months m
      left join agg a on a.month = m.month
    ),
    'by_variant', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.revenue_try desc, x.display_name), '[]'::jsonb)
        from (
          select
            l.variant_id,
            l.product_id,
            l.display_name,
            count(distinct l.sale_id)::integer as sale_count,
            sum(l.quantity)::integer as quantity,
            round(sum(l.revenue_try), 4) as revenue_try,
            round(sum(l.gross_profit_try), 4) as gross_profit_try
          from lines l
          group by l.variant_id, l.product_id, l.display_name
          order by sum(l.revenue_try) desc, l.display_name
          limit 8
        ) x
    ),
    'variant_count', (select count(distinct l.variant_id) from lines l)
  )
$$;

comment on function public.customer_summary(uuid, integer) is
  'Müşteri detayı: aylık ciro / brüt kâr serisi ve en çok alınan varyantlar. Yalnız gerçekleşmiş satışlar.';

-- Müşteri detayı, Teklifler sekmesi: sayfadaki açık tekliflerin tahmini kârı tek
-- çağrıda (teklif başına ayrı RPC yerine). Her teklif için mevcut quote_estimate
-- kuralı aynen kullanılır; kalem ayrıntısı döndürülmez. En fazla 100 teklif.
create or replace function public.quote_estimates(p_quote_ids uuid[])
returns table (
  quote_id uuid,
  revenue_try numeric,
  cost_try numeric,
  gross_profit_try numeric,
  margin_pct numeric,
  has_shortage boolean,
  cost_unknown boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    q.id,
    (e.est ->> 'revenue_try')::numeric,
    (e.est ->> 'cost_try')::numeric,
    (e.est ->> 'gross_profit_try')::numeric,
    (e.est ->> 'margin_pct')::numeric,
    coalesce((e.est ->> 'has_shortage')::boolean, false),
    coalesce((e.est ->> 'cost_unknown')::boolean, false)
  from public.quotes q
  cross join lateral public.quote_estimate(q.id) as e(est)
  where q.id = any(coalesce(p_quote_ids[1:100], '{}'::uuid[]))
$$;

comment on function public.quote_estimates(uuid[]) is
  'Birden çok teklifin tahmini ciro / FIFO maliyet / brüt kâr özeti (quote_estimate ile aynı kural), tek çağrıda. Stok düşürmez.';

-- Teklif kalemi formu önizlemesi: varyant başına tek satır. Mekonsis rafındaki açık
-- katmanlar FIFO sırasıyla ([kalan adet, birim maliyet TL]) ve son tamamlanan partinin
-- birim maliyeti — quote_estimate / fifo_preview ile aynı kural. Tüm katman ve parti
-- satırları istemciye taşınmadığı için PostgREST max_rows sınırı önizlemeyi bozmaz.
-- Aktif varyantlar ile p_quote_id teklifinde bulunan (sonradan pasifleşmiş olabilecek) varyantlar.
create or replace function public.quote_item_options(p_quote_id uuid default null)
returns table (
  variant_id uuid,
  display_name text,
  is_active boolean,
  sale_price numeric,
  currency text,
  mekonsis_qty integer,
  layers jsonb,
  last_unit_cost_try numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    v.id,
    v.display_name,
    v.is_active,
    v.sale_price,
    v.currency,
    coalesce(ly.qty, 0),
    coalesce(ly.layers, '[]'::jsonb),
    lb.unit_cost_try
  from public.v_variants v
  left join lateral (
    select
      sum(l.qty_remaining)::integer as qty,
      jsonb_agg(jsonb_build_array(l.qty_remaining, l.unit_cost_try) order by l.received_on, l.fifo_seq) as layers
    from public.stock_layers l
    where l.variant_id = v.id and l.location = 'mekonsis' and l.qty_out < l.qty_in
  ) ly on true
  left join lateral (
    select b.unit_cost_try
      from public.production_batches b
     where b.variant_id = v.id and b.status = 'completed'
     order by b.completed_at desc
     limit 1
  ) lb on true
  where v.is_active
     or exists (select 1 from public.quote_items qi where qi.quote_id = p_quote_id and qi.variant_id = v.id)
  order by v.display_name
$$;

comment on function public.quote_item_options(uuid) is
  'Teklif kalemi formu: varyant seçenekleri, Mekonsis FIFO katmanları ve son parti birim maliyeti (quote_estimate ile aynı kural). Salt okunur.';

revoke all on public.v_customer_list from anon;
grant select on public.v_customer_list to authenticated;

do $$ begin perform private.lock_down_public_functions(); end $$;
