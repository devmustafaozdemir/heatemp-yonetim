-- =====================================================================
-- Heatemp ERP — 26 Kur her zaman otomatik
-- Önerilen / güncel kur: süresi geçmemiş otomatik kur (TCMB, ECB) varsa, aynı gün veya
-- daha yeni tarihli elle girilmiş kurdan önce gelir. Elle girilen kur yalnız bir işlemde
-- açıkça seçildiğinde kullanılır. Geçerli otomatik kur yoksa eski davranış (en yeni kur).
-- =====================================================================

create or replace function public.fx_rate_for_date(p_date date default null)
returns table (
  id bigint,
  rate numeric,
  rate_date date,
  source text,
  rate_type text,
  fetched_at timestamptz,
  age_days integer,
  is_valid boolean,
  max_age_days integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_date date := coalesce(p_date, public.today_tr());
  v_settings public.app_settings;
begin
  perform private.assert_member();
  select * into v_settings from public.app_settings where app_settings.id;
  return query
    select f.id, f.rate, f.rate_date, f.source, f.rate_type, f.fetched_at,
           (v_date - f.rate_date)::integer,
           (v_date - f.rate_date) <= v_settings.fx_max_age_days,
           v_settings.fx_max_age_days
      from public.fx_rates f
     where f.rate_date <= v_date
       and (f.source <> 'TCMB' or f.rate_type = v_settings.fx_tcmb_rate_type)
     order by
              -- Süresi geçmemiş otomatik kur (TCMB/ECB) her zaman önce: elle girilen kur yalnız
              -- girildiği işlemde (açıkça seçilerek) kullanılır, genel kuru ezmez.
              (f.source <> 'MANUAL' and (v_date - f.rate_date) <= v_settings.fx_max_age_days) desc,
              f.rate_date desc,
              (f.source = v_settings.fx_primary_source) desc,
              (f.source <> 'MANUAL') desc,
              f.fetched_at desc
     limit 1;
end
$$;


do $$ begin perform private.lock_down_public_functions(); end $$;
