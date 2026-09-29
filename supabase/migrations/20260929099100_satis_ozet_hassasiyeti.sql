-- =====================================================================
-- Heatemp ERP — 19 Günlük/aylık satış özetinde yuvarlama hassasiyeti
-- v_sales_daily ve v_sales_monthly her günü/ayı 2 ondalığa yuvarlıyordu; dönem
-- toplamı bu yuvarlanmış değerlerin toplamı olunca kalem bazlı toplamlardan
-- (Kasa, Satışlar) birkaç kuruş sapabiliyordu. Değerler artık 4 ondalıkla
-- tutulur (diğer rapor görünümleriyle aynı); ekranda 2 ondalığa yuvarlanır.
-- Sütun adları, sırası ve türleri değişmez.
-- =====================================================================

create or replace view public.v_sales_daily with (security_invoker = true) as
select
  s.sold_on as day,
  count(*)::integer as sale_count,
  sum(s.total_quantity)::integer as quantity,
  round(sum(s.revenue_try), 4) as revenue_try,
  round(sum(s.cogs_try), 4) as cogs_try,
  round(sum(s.gross_profit_try), 4) as gross_profit_try
from public.sales s
where s.status = 'completed'
group by s.sold_on;

create or replace view public.v_sales_monthly with (security_invoker = true) as
select
  date_trunc('month', s.sold_on)::date as month,
  count(*)::integer as sale_count,
  sum(s.total_quantity)::integer as quantity,
  round(sum(s.revenue_try), 4) as revenue_try,
  round(sum(s.cogs_try), 4) as cogs_try,
  round(sum(s.gross_profit_try), 4) as gross_profit_try
from public.sales s
where s.status = 'completed'
group by date_trunc('month', s.sold_on);

do $$ begin perform private.lock_down_public_views(); end $$;
