-- =====================================================================
-- Heatemp ERP — 11 Panel raporları (salt okunur)
-- Dashboard ve Kasa'nın seçilen tarih aralığına göre çalışabilmesi için
-- satış kalemlerini satış tarihi ve durumuyla birlikte sunan bir görünüm ve
-- dönem içindeki satışları varyant bazında toplayan bir fonksiyon.
-- Yeni tablo veya yazma yetkisi yoktur; RLS ve mevcut yetkiler aynen geçerlidir
-- (görünüm security_invoker, fonksiyon security invoker).
-- =====================================================================

create or replace view public.v_sale_lines with (security_invoker = true) as
select
  si.id,
  si.sale_id,
  s.sale_no,
  s.sold_on,
  s.status,
  s.customer_id,
  c.name as customer_name,
  s.currency,
  s.fx_rate,
  si.variant_id,
  v.product_id,
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
  si.gross_profit_usd
from public.sale_items si
join public.sales s on s.id = si.sale_id
join public.v_variants v on v.id = si.variant_id
left join public.customers c on c.id = s.customer_id;

comment on view public.v_sale_lines is
  'Satış kalemleri + satış tarihi/durumu. Ciro ve kâr yalnızca status = completed satırlardan hesaplanır; teslimatlar satış değildir.';

-- Seçilen aralıktaki (her iki uç dahil) tamamlanmış satışların varyant bazında toplamı.
create or replace function public.sales_by_variant(p_from date, p_to date)
returns table (
  variant_id uuid,
  product_id uuid,
  product_code text,
  product_name text,
  variant_code text,
  variant_name text,
  display_name text,
  sale_count integer,
  quantity integer,
  revenue_try numeric,
  revenue_usd numeric,
  cogs_try numeric,
  cogs_usd numeric,
  gross_profit_try numeric,
  gross_profit_usd numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    l.variant_id,
    l.product_id,
    l.product_code,
    l.product_name,
    l.variant_code,
    l.variant_name,
    l.display_name,
    count(distinct l.sale_id)::integer,
    sum(l.quantity)::integer,
    round(sum(l.revenue_try), 4),
    round(sum(l.revenue_usd), 4),
    round(sum(l.cogs_try), 4),
    round(sum(l.cogs_usd), 4),
    round(sum(l.gross_profit_try), 4),
    round(sum(l.gross_profit_usd), 4)
  from public.v_sale_lines l
  where l.status = 'completed'
    and l.sold_on between p_from and p_to
  group by l.variant_id, l.product_id, l.product_code, l.product_name, l.variant_code, l.variant_name, l.display_name
$$;

revoke all on public.v_sale_lines from anon;
grant select on public.v_sale_lines to authenticated;

do $$ begin perform private.lock_down_public_functions(); end $$;
