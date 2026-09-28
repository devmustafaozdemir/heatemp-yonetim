-- =====================================================================
-- Heatemp ERP — Hammadde ekranı özetleri (salt okunur)
-- v_material_list: malzeme bakiyesi + aktif reçete kullanımı + stok durumu.
--   "Kritik" tanımı (gerçek veriye dayalı; malzemede minimum eşik alanı yoktur):
--     out_used : stok 0 ve en az bir aktif reçetede kullanılıyor
--     short    : stok var ama bir aktif reçetenin 1 adetlik ihtiyacını bile karşılamıyor
--     out      : stok 0, aktif reçetede kullanılmıyor
--     ok       : stokta
-- material_monthly_flows: aylık malzeme hareket toplamları (hareket türü bazında).
-- Yeni tablo, kolon, RLS veya yazma yetkisi yoktur (görünüm security_invoker,
-- fonksiyon security invoker); mevcut okuma kuralları aynen geçerlidir.
-- =====================================================================

create or replace view public.v_material_list with (security_invoker = true) as
select
  s.*,
  case s.stock_state when 'out_used' then 1 when 'short' then 2 when 'out' then 3 else 4 end as state_rank
from (
  select
    m.id,
    m.code,
    m.name,
    m.kind,
    m.unit_kind,
    m.base_unit,
    m.display_unit,
    m.display_factor,
    m.notes,
    m.is_active,
    m.qty,
    m.qty_display,
    m.value_try,
    m.value_usd,
    m.avg_cost_try,
    m.avg_cost_usd,
    m.avg_cost_try_display,
    m.avg_cost_usd_display,
    m.last_purchase_on,
    m.created_at,
    r.active_bom_count,
    r.max_qty_per_unit,
    case when r.max_qty_per_unit > 0 then floor(m.qty / r.max_qty_per_unit) end as min_units_coverable,
    case
      when m.qty <= 0 and r.active_bom_count > 0 then 'out_used'
      when r.active_bom_count > 0 and m.qty < r.max_qty_per_unit then 'short'
      when m.qty <= 0 then 'out'
      else 'ok'
    end as stock_state
  from public.v_materials m
  cross join lateral (
    select
      count(*)::integer as active_bom_count,
      max(bi.qty_per_unit) as max_qty_per_unit
    from public.bom_items bi
    join public.product_variants v on v.id = bi.variant_id
    join public.products p on p.id = v.product_id
    where bi.material_id = m.id
      and v.is_active
      and p.is_active
  ) r
) s;

comment on view public.v_material_list is
  'Hammadde listesi: bakiye, ortalama maliyet, aktif reçete kullanımı ve stok durumu (out_used / short / out / ok). min_units_coverable: mevcut stok, bu malzemeyi en çok kullanan aktif reçetede (yalnız bu malzeme dikkate alınarak) kaç adete yeter.';

-- Aylık malzeme hareketleri: tür bazında adet, miktar (temel birim) ve değer.
-- p_from boşsa tüm geçmiş; p_material_id boşsa tüm malzemeler (miktar toplamı
-- farklı birimleri karıştırır, bu durumda yalnız değer sütunları anlamlıdır).
create or replace function public.material_monthly_flows(p_from date default null, p_material_id uuid default null)
returns table (
  month_start date,
  movement_type text,
  movement_count integer,
  qty numeric,
  value_try numeric,
  value_usd numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    date_trunc('month', mm.movement_date)::date,
    mm.movement_type,
    count(*)::integer,
    sum(mm.qty),
    round(sum(mm.value_try), 4),
    round(sum(mm.value_usd), 4)
  from public.material_movements mm
  where (p_from is null or mm.movement_date >= p_from)
    and (p_material_id is null or mm.material_id = p_material_id)
  group by 1, 2
  order by 1, 2
$$;

revoke all on public.v_material_list from anon;
grant select on public.v_material_list to authenticated;

do $$ begin perform private.lock_down_public_functions(); end $$;
