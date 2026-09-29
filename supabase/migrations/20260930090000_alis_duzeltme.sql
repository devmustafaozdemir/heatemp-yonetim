-- =====================================================================
-- Heatemp ERP — 20 Hammadde alışı düzeltme / iptal
-- Stok defteri değiştirilmez (denetim izi korunur): hatalı alış, tutarı ve
-- miktarı birebir ters bir "purchase_reversal" hareketiyle kapatılır; düzeltmede
-- doğru değerlerle yeni bir alış kaydı açılır.
-- Güvenlik kuralı: alıştan SONRA malzeme üretimde tüketildiyse veya fire
-- yazıldıysa düzeltme yapılamaz (o çıkışların ağırlıklı ortalama maliyeti bu
-- alışa dayanır ve partilere/fire kayıtlarına sabitlenmiştir).
-- =====================================================================

alter table public.material_movements
  add column if not exists reverses_movement_id bigint references public.material_movements (id);

create unique index if not exists material_movements_reverses_unique
  on public.material_movements (reverses_movement_id) where reverses_movement_id is not null;

alter table public.material_movements drop constraint if exists material_movements_movement_type_check;
alter table public.material_movements add constraint material_movements_movement_type_check
  check (movement_type in ('purchase', 'purchase_reversal', 'production_consume', 'production_return', 'write_off'));

alter table public.material_movements drop constraint if exists material_movements_sign;
alter table public.material_movements add constraint material_movements_sign check (
  (movement_type in ('purchase', 'production_return') and qty > 0 and value_try >= 0 and value_usd >= 0)
  or (movement_type in ('production_consume', 'write_off', 'purchase_reversal') and qty < 0 and value_try <= 0 and value_usd <= 0)
);

alter table public.material_movements drop constraint if exists material_movements_reversal_link;
alter table public.material_movements add constraint material_movements_reversal_link
  check ((movement_type = 'purchase_reversal') = (reverses_movement_id is not null));

comment on column public.material_movements.reverses_movement_id is
  'purchase_reversal hareketinin kapattığı alış hareketi (düzeltme/iptal izi).';

-- Alışı düzelt (yeni değerler verilirse) veya iptal et (p_qty null).
-- Döner: düzeltmede yeni alış hareketinin id'si, iptalde ters kaydın id'si.
create or replace function public.correct_material_purchase(
  p_movement_id bigint,
  p_reason text,
  p_qty numeric default null,
  p_unit text default null,
  p_unit_price numeric default null,
  p_currency text default null,
  p_fx_rate_id bigint default null,
  p_received_on date default null,
  p_supplier text default null,
  p_note text default null,
  p_request_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orig public.material_movements;
  v_balance public.material_balances;
  v_reversal_id bigint;
  v_new_id bigint;
  v_new_request uuid := case when p_request_id is null then null else md5(p_request_id::text || ':duzeltme')::uuid end;
begin
  perform private.assert_admin();
  perform private.claim_request(p_request_id);
  if p_request_id is not null then
    select id into v_reversal_id from public.material_movements where request_id = p_request_id;
    if found then
      select id into v_new_id from public.material_movements where request_id = v_new_request;
      return coalesce(v_new_id, v_reversal_id);
    end if;
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Düzeltme gerekçesi yazılmalıdır.';
  end if;

  select * into v_orig from public.material_movements where id = p_movement_id;
  if not found then
    raise exception 'Hareket bulunamadı.';
  end if;
  if v_orig.movement_type <> 'purchase' then
    raise exception 'Yalnız alış (stok girişi) hareketleri düzeltilebilir.';
  end if;

  select * into v_balance from public.material_balances where material_id = v_orig.material_id for update;

  if exists (select 1 from public.material_movements where reverses_movement_id = v_orig.id) then
    raise exception 'Bu alış daha önce düzeltilmiş veya iptal edilmiş.';
  end if;
  if exists (
    select 1 from public.material_movements m
     where m.material_id = v_orig.material_id
       and m.id > v_orig.id
       and m.movement_type in ('production_consume', 'write_off')
  ) then
    raise exception 'Bu alıştan sonra malzeme üretimde kullanıldı veya fire yazıldı; o kayıtların maliyeti bu alışa dayandığı için alış düzeltilemez. Farkı yeni bir alış veya fire kaydıyla girin.';
  end if;
  if v_balance.qty < v_orig.qty or v_balance.value_try < v_orig.value_try or v_balance.value_usd < v_orig.value_usd then
    raise exception 'Mevcut stok bu alışı geri almaya yetmiyor.';
  end if;

  update public.material_balances
     set qty = qty - v_orig.qty,
         value_try = value_try - v_orig.value_try,
         value_usd = value_usd - v_orig.value_usd,
         updated_at = now()
   where material_id = v_orig.material_id;

  insert into public.material_movements (
    material_id, movement_type, movement_date, qty, value_try, value_usd, unit_cost_try, unit_cost_usd,
    note, reverses_movement_id, balance_qty_after, balance_value_try_after, request_id
  ) values (
    v_orig.material_id, 'purchase_reversal', public.today_tr(), -v_orig.qty, -v_orig.value_try, -v_orig.value_usd,
    v_orig.unit_cost_try, v_orig.unit_cost_usd,
    case when p_qty is null then 'Alış iptali: ' else 'Alış düzeltmesi: ' end || btrim(p_reason),
    v_orig.id, v_balance.qty - v_orig.qty, v_balance.value_try - v_orig.value_try, p_request_id
  ) returning id into v_reversal_id;

  if p_qty is null then
    return v_reversal_id;
  end if;

  v_new_id := public.receive_material(
    v_orig.material_id, p_qty, p_unit, p_unit_price, p_currency, p_fx_rate_id,
    coalesce(p_received_on, v_orig.movement_date), p_supplier, p_note, v_new_request
  );
  return v_new_id;
end
$$;

comment on function public.correct_material_purchase(bigint, text, numeric, text, numeric, text, bigint, date, text, text, uuid) is
  'Hammadde alışını ters kayıtla kapatır; yeni değerler verilirse düzeltilmiş alışı açar. Sonrasında tüketim/fire varsa reddeder.';

do $$ begin perform private.lock_down_public_functions(); end $$;
