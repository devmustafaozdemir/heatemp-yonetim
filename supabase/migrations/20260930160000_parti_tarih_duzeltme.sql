-- =====================================================================
-- Heatemp ERP — 27 Üretim partisi tarih düzeltmesi
-- Partinin başlama / tamamlanma zamanı geriye (veya ileriye) alınır; ilgili tüm kayıtlar
-- birlikte güncellenir: parti, Heatemp raf katmanı (rafa giriş günü), üretim girişi raf
-- hareketi ve hammadde tüketim hareketleri. Maliyet, kur ve adetler değişmez.
-- Kurallar: gelecek tarih olmaz; tamamlanma başlamadan önce olamaz; partiden teslimat
-- yapıldıysa tamamlanma günü ilk teslimat gününden sonra olamaz; iptal edilen parti düzeltilmez.
-- =====================================================================

-- Koruma tetikleyicisi: başlama zamanı yalnız bu düzeltme fonksiyonunun işlemi içinde değişebilir.
create or replace function private.production_batches_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if old.status <> 'in_production' then
      raise exception 'Parti % durumu "%" iken değiştirilemez.', old.batch_no,
        case old.status when 'completed' then 'Tamamlandı' else 'İptal' end;
    end if;
  end if;
  if new.variant_id <> old.variant_id or new.quantity <> old.quantity or new.batch_no <> old.batch_no
     or new.fx_rate_id <> old.fx_rate_id then
    raise exception 'Parti kimlik bilgileri değiştirilemez.';
  end if;
  if new.started_at <> old.started_at and coalesce(current_setting('heatemp.batch_date_fix', true), '') <> 'on' then
    raise exception 'Parti kimlik bilgileri değiştirilemez.';
  end if;
  if old.status <> 'in_production' and (
       new.total_cost_try <> old.total_cost_try or new.unit_cost_try <> old.unit_cost_try
       or new.total_cost_usd <> old.total_cost_usd or new.unit_cost_usd <> old.unit_cost_usd) then
    raise exception 'Kapanmış partinin maliyeti değiştirilemez.';
  end if;
  return new;
end
$$;

create or replace function public.update_batch_dates(
  p_batch_id uuid,
  p_started_at timestamptz,
  p_completed_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.production_batches;
  v_start_day date;
  v_done_day date;
  v_first_delivery date;
begin
  perform private.assert_admin();
  select * into v_batch from public.production_batches where id = p_batch_id for update;
  if not found then
    raise exception 'Parti bulunamadı.';
  end if;
  if v_batch.status = 'cancelled' then
    raise exception 'İptal edilmiş partinin tarihleri değiştirilemez.';
  end if;
  if p_started_at is null then
    raise exception 'Başlama zamanı girilmelidir.';
  end if;
  if p_started_at > now() then
    raise exception 'Başlama zamanı gelecekte olamaz.';
  end if;
  v_start_day := (p_started_at at time zone 'Europe/Istanbul')::date;

  if v_batch.status = 'completed' then
    if p_completed_at is null then
      raise exception 'Tamamlanmış partinin tamamlanma zamanı girilmelidir.';
    end if;
    if p_completed_at > now() then
      raise exception 'Tamamlanma zamanı gelecekte olamaz.';
    end if;
    if p_completed_at < p_started_at then
      raise exception 'Tamamlanma zamanı başlama zamanından önce olamaz.';
    end if;
    v_done_day := (p_completed_at at time zone 'Europe/Istanbul')::date;
    select min(movement_date) into v_first_delivery
      from public.stock_movements
     where batch_id = p_batch_id and movement_type = 'delivery_out';
    if v_first_delivery is not null and v_done_day > v_first_delivery then
      raise exception 'Bu partiden % tarihinde Mekonsis''e teslimat yapıldı; tamamlanma günü bundan sonra olamaz.',
        to_char(v_first_delivery, 'DD.MM.YYYY');
    end if;
  elsif p_completed_at is not null then
    raise exception 'Üretimdeki partinin tamamlanma zamanı yoktur; yalnız başlama zamanı düzeltilebilir.';
  end if;

  perform set_config('heatemp.batch_date_fix', 'on', true);
  update public.production_batches
     set started_at = p_started_at,
         completed_at = case when status = 'completed' then p_completed_at else completed_at end,
         actual_minutes = case when status = 'completed'
                               then round((extract(epoch from (p_completed_at - p_started_at)) / 60)::numeric, 2)
                               else actual_minutes end
   where id = p_batch_id;
  perform set_config('heatemp.batch_date_fix', 'off', true);

  -- Hammadde tüketimi başlama gününde
  update public.material_movements
     set movement_date = v_start_day
   where batch_id = p_batch_id and movement_type = 'production_consume';

  if v_batch.status = 'completed' then
    -- Heatemp rafına giriş tamamlanma gününde (teslimat sırası bu tarihe göredir)
    update public.stock_layers
       set received_on = v_done_day, received_at = p_completed_at
     where batch_id = p_batch_id and location = 'heatemp';
    update public.stock_movements
       set movement_date = v_done_day
     where batch_id = p_batch_id and movement_type = 'production_in';
  end if;
end
$$;

comment on function public.update_batch_dates(uuid, timestamptz, timestamptz) is
  'Üretim partisinin başlama/tamamlanma zamanını düzeltir; raf katmanı, raf hareketi ve hammadde tüketim tarihleri birlikte güncellenir.';

do $$ begin perform private.lock_down_public_functions(); end $$;
