-- =====================================================================
-- Heatemp ERP — 4/8 Mekonsis'e teslimat (satış değildir)
-- Teslimat, Heatemp rafındaki parti katmanlarından (FIFO veya seçilen parti)
-- düşer ve Mekonsis rafında parti kimliğini koruyan yeni katmanlar oluşturur.
-- Teslimatta ciro, tahsilat veya kâr oluşmaz; mamul Heatemp'in varlığı olarak kalır.
-- =====================================================================

create sequence public.delivery_no_seq;

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  delivery_no text not null unique,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  delivered_on date not null,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  note text,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id) on delete set null,
  cancel_reason text,
  request_id uuid unique,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint deliveries_cancelled check ((status = 'cancelled') = (cancelled_at is not null))
);

create index deliveries_variant_idx on public.deliveries (variant_id, delivered_on);

alter table public.stock_layers
  add constraint stock_layers_delivery_fk foreign key (delivery_id) references public.deliveries (id);
alter table public.stock_movements
  add constraint stock_movements_delivery_fk foreign key (delivery_id) references public.deliveries (id);

-- Teslimat geri alma hareketleri
alter table public.stock_movements drop constraint stock_movements_sign;
alter table public.stock_movements drop constraint stock_movements_location;
alter table public.stock_movements drop constraint stock_movements_movement_type_check;
alter table public.stock_movements add constraint stock_movements_movement_type_check check (
  movement_type in ('production_in', 'delivery_out', 'delivery_in', 'sale_out', 'sale_return',
                    'delivery_reversal_out', 'delivery_reversal_in')
);
alter table public.stock_movements add constraint stock_movements_sign check (
  (movement_type in ('production_in', 'delivery_in', 'sale_return', 'delivery_reversal_in') and qty > 0)
  or (movement_type in ('delivery_out', 'sale_out', 'delivery_reversal_out') and qty < 0)
);
alter table public.stock_movements add constraint stock_movements_location check (
  (movement_type in ('production_in', 'delivery_out', 'delivery_reversal_in') and location = 'heatemp')
  or (movement_type in ('delivery_in', 'sale_out', 'sale_return', 'delivery_reversal_out') and location = 'mekonsis')
);

create or replace function public.deliver_to_mekonsis(
  p_variant_id uuid,
  p_quantity integer,
  p_batch_id uuid default null,
  p_delivered_on date default null,
  p_note text default null,
  p_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant public.v_variants;
  v_date date := coalesce(p_delivered_on, public.today_tr());
  v_available integer;
  v_available_any_date integer;
  v_delivery_id uuid;
  v_layer record;
  v_left integer;
  v_take integer;
  v_new_layer_id uuid;
begin
  perform private.assert_admin();
  perform private.claim_request(p_request_id);
  if p_request_id is not null then
    select id into v_delivery_id from public.deliveries where request_id = p_request_id;
    if found then
      return v_delivery_id;
    end if;
  end if;

  select * into v_variant from public.v_variants where id = p_variant_id;
  if not found then
    raise exception 'Varyant bulunamadı.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Teslim adedi sıfırdan büyük olmalıdır.';
  end if;
  if v_date > public.today_tr() then
    raise exception 'Gelecek tarihli teslimat girilemez.';
  end if;
  if p_batch_id is not null and not exists (
    select 1 from public.production_batches where id = p_batch_id and variant_id = p_variant_id
  ) then
    raise exception 'Seçilen parti bu varyanta ait değil.';
  end if;

  perform private.lock_variant_stock(p_variant_id);

  select coalesce(sum(l.qty_remaining), 0),
         coalesce(sum(l.qty_remaining) filter (where l.received_on <= v_date), 0)
    into v_available_any_date, v_available
    from public.stock_layers l
   where l.variant_id = p_variant_id
     and l.location = 'heatemp'
     and l.qty_out < l.qty_in
     and (p_batch_id is null or l.batch_id = p_batch_id);

  if v_available < p_quantity then
    if v_available_any_date >= p_quantity then
      raise exception 'Heatemp rafında % tarihi itibarıyla yeterli stok yok: % için teslim edilebilir % adet var, % adet istendi (daha sonra tamamlanan partiler bu tarihte teslim edilemez).',
        private.fmt_date(v_date), v_variant.display_name, v_available, p_quantity;
    end if;
    raise exception 'Heatemp rafında yeterli stok yok: % için mevcut % adet, teslim edilmek istenen % adet.',
      v_variant.display_name, v_available, p_quantity;
  end if;

  insert into public.deliveries (delivery_no, variant_id, quantity, delivered_on, note, request_id)
  values (private.next_doc_no('TES', 'public.delivery_no_seq'), p_variant_id, p_quantity, v_date,
          nullif(btrim(p_note), ''), p_request_id)
  returning id into v_delivery_id;

  v_left := p_quantity;
  for v_layer in
    select l.*
      from public.stock_layers l
     where l.variant_id = p_variant_id
       and l.location = 'heatemp'
       and l.qty_out < l.qty_in
       and l.received_on <= v_date
       and (p_batch_id is null or l.batch_id = p_batch_id)
     order by l.received_on, l.fifo_seq
       for update
  loop
    exit when v_left = 0;
    v_take := least(v_layer.qty_remaining, v_left);

    update public.stock_layers set qty_out = qty_out + v_take where id = v_layer.id;

    insert into public.stock_layers (
      variant_id, batch_id, location, delivery_id, source_layer_id, qty_in,
      unit_cost_try, unit_cost_usd, received_on
    ) values (
      p_variant_id, v_layer.batch_id, 'mekonsis', v_delivery_id, v_layer.id, v_take,
      v_layer.unit_cost_try, v_layer.unit_cost_usd, v_date
    ) returning id into v_new_layer_id;

    insert into public.stock_movements (
      layer_id, variant_id, batch_id, location, movement_type, qty, unit_cost_try, unit_cost_usd,
      movement_date, delivery_id
    ) values
      (v_layer.id, p_variant_id, v_layer.batch_id, 'heatemp', 'delivery_out', -v_take,
       v_layer.unit_cost_try, v_layer.unit_cost_usd, v_date, v_delivery_id),
      (v_new_layer_id, p_variant_id, v_layer.batch_id, 'mekonsis', 'delivery_in', v_take,
       v_layer.unit_cost_try, v_layer.unit_cost_usd, v_date, v_delivery_id);

    v_left := v_left - v_take;
  end loop;

  if v_left <> 0 then
    raise exception 'Teslimat dağıtımı tamamlanamadı; işlem geri alındı.';
  end if;

  return v_delivery_id;
end
$$;

-- Hatalı teslimatı geri alır: yalnızca bu teslimattan hiç satış yapılmadıysa.
create or replace function public.cancel_delivery(p_delivery_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.deliveries;
  v_layer record;
begin
  perform private.assert_admin();
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Teslimat geri alma gerekçesi yazılmalıdır.';
  end if;
  select * into v_delivery from public.deliveries where id = p_delivery_id for update;
  if not found then
    raise exception 'Teslimat bulunamadı.';
  end if;
  if v_delivery.status = 'cancelled' then
    raise exception 'Teslimat % zaten geri alınmış.', v_delivery.delivery_no;
  end if;

  perform private.lock_variant_stock(v_delivery.variant_id);

  if exists (
    select 1 from public.stock_layers
     where delivery_id = p_delivery_id and qty_out > 0
  ) then
    raise exception 'Teslimat % içinden satış yapılmış; geri alınamaz. Önce ilgili satışları iptal edin.',
      v_delivery.delivery_no;
  end if;

  for v_layer in
    select * from public.stock_layers where delivery_id = p_delivery_id order by id for update
  loop
    update public.stock_layers set qty_out = qty_in where id = v_layer.id;
    update public.stock_layers set qty_out = qty_out - v_layer.qty_in where id = v_layer.source_layer_id;

    insert into public.stock_movements (
      layer_id, variant_id, batch_id, location, movement_type, qty, unit_cost_try, unit_cost_usd,
      movement_date, delivery_id
    ) values
      (v_layer.id, v_layer.variant_id, v_layer.batch_id, 'mekonsis', 'delivery_reversal_out', -v_layer.qty_in,
       v_layer.unit_cost_try, v_layer.unit_cost_usd, public.today_tr(), p_delivery_id),
      (v_layer.source_layer_id, v_layer.variant_id, v_layer.batch_id, 'heatemp', 'delivery_reversal_in',
       v_layer.qty_in, v_layer.unit_cost_try, v_layer.unit_cost_usd, public.today_tr(), p_delivery_id);
  end loop;

  update public.deliveries
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
   where id = p_delivery_id;

  return p_delivery_id;
end
$$;

-- Mekonsis rafı: teslimat satırı (parti payı) bazında teslim edilen / satılan / kalan
create view public.v_mekonsis_shelf with (security_invoker = true) as
select
  l.id as layer_id,
  l.delivery_id,
  d.delivery_no,
  d.delivered_on,
  d.status as delivery_status,
  l.variant_id,
  v.product_id,
  v.product_code,
  v.product_name,
  v.variant_code,
  v.variant_name,
  v.display_name,
  l.batch_id,
  b.batch_no,
  l.qty_in as delivered_qty,
  case when d.status = 'cancelled' then 0 else l.qty_out end as sold_qty,
  l.qty_remaining,
  l.unit_cost_try,
  l.unit_cost_usd,
  round(l.qty_remaining * l.unit_cost_try, 4) as value_try,
  round(l.qty_remaining * l.unit_cost_usd, 4) as value_usd,
  l.received_on,
  l.received_at
from public.stock_layers l
join public.deliveries d on d.id = l.delivery_id
join public.production_batches b on b.id = l.batch_id
join public.v_variants v on v.id = l.variant_id
where l.location = 'mekonsis';

create view public.v_deliveries with (security_invoker = true) as
select
  d.id,
  d.delivery_no,
  d.delivered_on,
  d.variant_id,
  v.product_id,
  v.product_code,
  v.product_name,
  v.variant_code,
  v.variant_name,
  v.display_name,
  d.quantity,
  d.status,
  d.note,
  d.cancel_reason,
  d.cancelled_at,
  d.created_at,
  coalesce(sum(case when d.status = 'cancelled' then 0 else l.qty_out end), 0)::integer as sold_qty,
  coalesce(sum(l.qty_remaining), 0)::integer as remaining_qty,
  coalesce(round(sum(l.qty_in * l.unit_cost_try), 4), 0) as delivered_cost_try,
  string_agg(b.batch_no || ' × ' || l.qty_in, ', ' order by b.batch_no) as batches
from public.deliveries d
join public.v_variants v on v.id = d.variant_id
left join public.stock_layers l on l.delivery_id = d.id
left join public.production_batches b on b.id = l.batch_id
group by d.id, v.product_id, v.product_code, v.product_name, v.variant_code, v.variant_name, v.display_name;

alter table public.deliveries enable row level security;
create policy deliveries_select on public.deliveries for select to authenticated
  using ((select public.is_app_member()));

revoke all on public.deliveries, public.v_mekonsis_shelf, public.v_deliveries from anon;
revoke insert, update, delete, truncate on public.deliveries from authenticated;
revoke all on sequence public.delivery_no_seq from anon, authenticated;

do $$ begin perform private.lock_down_public_functions(); end $$;
