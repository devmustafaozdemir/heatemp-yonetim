-- =====================================================================
-- Heatemp ERP — 31 Teslimat tarihi düzeltilirken partiler teslimattan 1 gün önceye
-- Üretim teslimattan önceki gün biter: p_move_batches = true iken teslim edilen parti
-- Heatemp rafına teslimat günü veya sonrasında girdiyse tamamlanma günü teslimat gününden
-- 1 gün önceye alınır (saat ve üretim süresi korunur). Daha önce biten partilere dokunulmaz.
-- p_move_batches = false iken kural aynı: parti teslimattan SONRA rafa girdiyse reddedilir.
-- =====================================================================

create or replace function public.update_delivery_date(p_delivery_id uuid, p_date date, p_move_batches boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.deliveries;
  v_first_sale date;
  r record;
  v_new_done timestamptz;
begin
  perform private.assert_admin();
  select * into v_delivery from public.deliveries where id = p_delivery_id for update;
  if not found then
    raise exception 'Teslimat bulunamadı.';
  end if;
  if v_delivery.status = 'cancelled' then
    raise exception 'Geri alınmış teslimatın tarihi değiştirilemez.';
  end if;
  if p_date is null then
    raise exception 'Teslimat tarihi girilmelidir.';
  end if;
  if p_date > public.today_tr() then
    raise exception 'Teslimat tarihi gelecekte olamaz.';
  end if;

  -- Bu teslimatın Mekonsis katmanlarından yapılan ilk satış
  select min(sm.movement_date) into v_first_sale
    from public.stock_movements sm
    join public.stock_layers l on l.id = sm.layer_id
   where l.delivery_id = p_delivery_id and sm.movement_type = 'sale_out';
  if v_first_sale is not null and p_date > v_first_sale then
    raise exception 'Bu teslimattan % tarihinde satış yapıldı; teslimat günü bundan sonra olamaz.',
      to_char(v_first_sale, 'DD.MM.YYYY');
  end if;

  -- Teslim edilen partiler teslimat günü veya sonrasında rafa girdiyse
  for r in
    select distinct b.id, b.batch_no, b.started_at, b.completed_at, hl.received_on
      from public.stock_layers ml
      join public.stock_layers hl on hl.id = ml.source_layer_id
      join public.production_batches b on b.id = hl.batch_id
     where ml.delivery_id = p_delivery_id and hl.received_on >= p_date
  loop
    if not p_move_batches then
      if r.received_on > p_date then
        raise exception 'Parti % Heatemp rafına % tarihinde girdi; teslimat bundan önce olamaz. Önce parti tarihini düzeltin veya partileri teslimattan önceki güne çekme seçeneğini işaretleyin.',
          r.batch_no, to_char(r.received_on, 'DD.MM.YYYY');
      end if;
      continue;
    end if;
    v_new_done := (((p_date - 1)::text || ' ' || to_char(r.completed_at at time zone 'Europe/Istanbul', 'HH24:MI:SS'))::timestamp
                   at time zone 'Europe/Istanbul');
    perform public.update_batch_dates(r.id, r.started_at - (r.completed_at - v_new_done), v_new_done);
  end loop;

  update public.deliveries set delivered_on = p_date where id = p_delivery_id;
  update public.stock_layers
     set received_on = p_date,
         received_at = ((p_date::text || ' ' || to_char(received_at at time zone 'Europe/Istanbul', 'HH24:MI:SS'))::timestamp
                        at time zone 'Europe/Istanbul')
   where delivery_id = p_delivery_id;
  update public.stock_movements
     set movement_date = p_date
   where delivery_id = p_delivery_id and movement_type in ('delivery_out', 'delivery_in');
end
$$;

comment on function public.update_delivery_date(uuid, date, boolean) is
  'Teslimat gününü düzeltir (teslimat, Mekonsis katmanları, raf hareketleri); gerekirse teslim edilen partileri teslimattan önceki güne çeker.';

do $$ begin perform private.lock_down_public_functions(); end $$;
