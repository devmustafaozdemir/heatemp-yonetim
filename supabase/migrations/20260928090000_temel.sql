-- =====================================================================
-- Heatemp ERP — 1/8 Temel yapı
-- Yetkilendirme (tek firma / yönetici), ayarlar, ölçü birimleri, USD/TRY kurları
-- =====================================================================

-- İç yardımcı fonksiyonlar PostgREST'e açılmayan ayrı bir şemada tutulur.
create schema if not exists private;
revoke all on schema private from public;

-- İş günü hesapları Türkiye saatine göre yapılır.
create or replace function public.today_tr()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Istanbul')::date
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- ---------------------------------------------------------------------
-- Uygulama kullanıcıları
-- Supabase Auth hesabı olmak tek başına yetki vermez; kullanıcı bu tabloda
-- yer almalıdır. 'admin' her şeyi yapar, 'viewer' yalnızca görüntüler.
-- ---------------------------------------------------------------------
create table public.app_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'viewer')),
  full_name text,
  created_at timestamptz not null default now()
);

comment on table public.app_users is 'Uygulamaya erişebilen kullanıcılar ve rolleri (admin / viewer).';

create or replace function public.is_app_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_users where user_id = auth.uid())
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_users where user_id = auth.uid() and role = 'admin'
  )
$$;

create or replace function private.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Bu işlem için yönetici yetkisi gerekir.' using errcode = '42501';
  end if;
end
$$;

create or replace function private.assert_member()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_app_member() then
    raise exception 'Bu bilgiyi görüntüleme yetkiniz yok.' using errcode = '42501';
  end if;
end
$$;

-- Tekrarlanan isteklere karşı: aynı istek kimliğiyle gelen eş zamanlı çağrılar
-- sıraya girer; ikinci çağrı ilk çağrının sonucunu bulur ve onu döndürür.
create or replace function private.claim_request(p_request_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('request:' || p_request_id::text, 0));
  end if;
end
$$;

-- Aynı varyantın mamul stoğu üzerindeki işlemleri (tamamlama, teslimat, satış,
-- satış iptali) sıraya sokar. Satır kilitleriyle birlikte çift tüketimi engeller.
create or replace function private.lock_variant_stock(p_variant_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('variant-stock:' || p_variant_id::text, 0));
end
$$;

create or replace function private.fmt_date(p_date date)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_date, 'DD.MM.YYYY')
$$;

create or replace function private.fmt_num(p_value numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(trim(trailing '.' from trim(trailing '0' from round(p_value, 4)::text)), '.', ',')
$$;

-- ---------------------------------------------------------------------
-- Ayarlar (tek satır)
-- ---------------------------------------------------------------------
create table public.app_settings (
  id boolean primary key default true check (id),
  company_name text not null default 'Heatemp' check (btrim(company_name) <> ''),
  fx_primary_source text not null default 'TCMB' check (fx_primary_source in ('TCMB', 'FRANKFURTER')),
  fx_tcmb_rate_type text not null default 'ForexBuying'
    check (fx_tcmb_rate_type in ('ForexBuying', 'ForexSelling')),
  fx_refresh_minutes integer not null default 60 check (fx_refresh_minutes between 5 and 1440),
  fx_max_age_days integer not null default 4 check (fx_max_age_days between 0 and 30),
  show_usd_info boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on column public.app_settings.fx_max_age_days is
  'Bir işlemde kullanılabilecek kurun işlem tarihinden en fazla kaç gün eski olabileceği (hafta sonu / tatil toleransı).';

insert into public.app_settings default values;

create or replace function private.set_settings_meta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end
$$;

create trigger app_settings_updated_at
  before update on public.app_settings
  for each row execute function private.set_settings_meta();

-- ---------------------------------------------------------------------
-- Ölçü birimleri: her tür için bir temel birim vardır, stok ve BOM
-- miktarları her zaman temel birimde saklanır (ör. kg girişi → gram).
-- ---------------------------------------------------------------------
create table public.units (
  code text primary key,
  kind text not null check (kind in ('count', 'mass', 'length', 'area', 'volume')),
  label text not null,
  factor_to_base numeric(24, 10) not null check (factor_to_base > 0),
  is_base boolean not null default false,
  sort_order integer not null default 0
);

create unique index units_one_base_per_kind on public.units (kind) where is_base;

insert into public.units (code, kind, label, factor_to_base, is_base, sort_order) values
  ('adet', 'count', 'Adet', 1, true, 1),
  ('g', 'mass', 'Gram (g)', 1, true, 10),
  ('kg', 'mass', 'Kilogram (kg)', 1000, false, 11),
  ('mg', 'mass', 'Miligram (mg)', 0.001, false, 12),
  ('m', 'length', 'Metre (m)', 1, true, 20),
  ('cm', 'length', 'Santimetre (cm)', 0.01, false, 21),
  ('mm', 'length', 'Milimetre (mm)', 0.001, false, 22),
  ('m2', 'area', 'Metrekare (m²)', 1, true, 30),
  ('cm2', 'area', 'Santimetrekare (cm²)', 0.0001, false, 31),
  ('ml', 'volume', 'Mililitre (ml)', 1, true, 40),
  ('l', 'volume', 'Litre (l)', 1000, false, 41);

create or replace function private.unit_kind_label(p_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'count' then 'adet'
    when 'mass' then 'ağırlık'
    when 'length' then 'uzunluk'
    when 'area' then 'alan'
    when 'volume' then 'hacim'
    else p_kind
  end
$$;

-- Girilen miktarı, malzemenin birim türünün temel birimine çevirir.
create or replace function private.to_base_qty(p_qty numeric, p_unit text, p_kind text)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  v_unit public.units;
begin
  if p_qty is null then
    raise exception 'Miktar girilmedi.';
  end if;
  select * into v_unit from public.units where code = p_unit;
  if not found then
    raise exception 'Tanımsız birim: %', coalesce(p_unit, '(boş)');
  end if;
  if v_unit.kind <> p_kind then
    raise exception 'Birim uyumsuz: bu malzeme % cinsinden izleniyor, "%" kullanılamaz.',
      private.unit_kind_label(p_kind), v_unit.label;
  end if;
  return p_qty * v_unit.factor_to_base;
end
$$;

-- ---------------------------------------------------------------------
-- USD/TRY kurları
-- Otomatik kaynaklar (TCMB, Frankfurter/ECB) yalnızca sunucu tarafından
-- (service role) kaydedilir. Manuel kur yalnızca yönetici tarafından girilir.
-- İşlemler kullandıkları kur kaydına bağlanır ve kur değerini kopyalar;
-- sonradan gelen kurlar geçmiş kayıtları değiştirmez.
-- ---------------------------------------------------------------------
create table public.fx_rates (
  id bigint generated always as identity primary key,
  base_currency text not null default 'USD' check (base_currency = 'USD'),
  quote_currency text not null default 'TRY' check (quote_currency = 'TRY'),
  rate numeric(18, 6) not null check (rate > 0),
  rate_date date not null,
  source text not null check (source in ('TCMB', 'FRANKFURTER', 'MANUAL')),
  rate_type text not null check (rate_type in ('ForexBuying', 'ForexSelling', 'Reference', 'Manual')),
  fetched_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  note text,
  raw jsonb,
  check ((source = 'MANUAL') = (rate_type = 'Manual'))
);

comment on column public.fx_rates.rate_date is 'Kurun geçerli olduğu (yayımlandığı) gün.';

create unique index fx_rates_auto_unique on public.fx_rates (source, rate_type, rate_date)
  where source <> 'MANUAL';
create index fx_rates_rate_date_idx on public.fx_rates (rate_date desc);

-- Bir işlem tarihi için seçilen kuru doğrular.
create or replace function private.resolve_fx(p_fx_rate_id bigint, p_tx_date date)
returns public.fx_rates
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rate public.fx_rates;
  v_max_age integer;
begin
  if p_fx_rate_id is null then
    raise exception 'İşlem kuru seçilmedi. Geçerli bir USD/TRY kuru alın veya manuel kur girin.';
  end if;
  select * into v_rate from public.fx_rates where id = p_fx_rate_id;
  if not found then
    raise exception 'Seçilen kur kaydı bulunamadı.';
  end if;
  select fx_max_age_days into v_max_age from public.app_settings where id;
  if v_rate.rate_date > p_tx_date then
    raise exception 'Kur tarihi (%) işlem tarihinden (%) sonra olamaz. İşlem tarihine ait kuru seçin.',
      private.fmt_date(v_rate.rate_date), private.fmt_date(p_tx_date);
  end if;
  if p_tx_date - v_rate.rate_date > coalesce(v_max_age, 4) then
    raise exception 'Kur çok eski: % tarihli kur, % tarihli işlem için kullanılamaz (en fazla % gün). Kuru güncelleyin veya bu tarih için manuel kur girin.',
      private.fmt_date(v_rate.rate_date), private.fmt_date(p_tx_date), coalesce(v_max_age, 4);
  end if;
  return v_rate;
end
$$;

-- Bir tarih için önerilen kur (en yakın geçmiş tarih, tercih edilen kaynak önce).
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
     order by f.rate_date desc,
              (f.source = v_settings.fx_primary_source) desc,
              (f.source <> 'MANUAL') desc,
              f.fetched_at desc
     limit 1;
end
$$;

create or replace function public.add_manual_fx_rate(p_rate numeric, p_rate_date date, p_note text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform private.assert_admin();
  if p_rate is null or p_rate <= 0 then
    raise exception 'Kur sıfırdan büyük olmalıdır.';
  end if;
  if p_rate > 10000 then
    raise exception 'Kur değeri gerçekçi değil (%). Lütfen kontrol edin.', private.fmt_num(p_rate);
  end if;
  if p_rate_date is null then
    raise exception 'Kur tarihi girilmedi.';
  end if;
  if p_rate_date > public.today_tr() then
    raise exception 'Gelecek tarihli kur girilemez.';
  end if;
  insert into public.fx_rates (rate, rate_date, source, rate_type, note)
  values (p_rate, p_rate_date, 'MANUAL', 'Manual', nullif(btrim(p_note), ''))
  returning id into v_id;
  return v_id;
end
$$;

-- Otomatik kur kaydı: yalnızca sunucu (service role) çağırabilir.
create or replace function public.record_auto_fx_rate(
  p_source text,
  p_rate_type text,
  p_rate numeric,
  p_rate_date date,
  p_raw jsonb default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_source not in ('TCMB', 'FRANKFURTER') then
    raise exception 'Geçersiz otomatik kur kaynağı: %', p_source;
  end if;
  if p_rate is null or p_rate <= 0 or p_rate > 10000 then
    raise exception 'Geçersiz kur değeri: %', p_rate;
  end if;
  if p_rate_date is null or p_rate_date > public.today_tr() + 1 then
    raise exception 'Geçersiz kur tarihi: %', p_rate_date;
  end if;
  insert into public.fx_rates (rate, rate_date, source, rate_type, raw, created_by)
  values (p_rate, p_rate_date, p_source, p_rate_type, p_raw, null)
  on conflict (source, rate_type, rate_date) where source <> 'MANUAL'
  do update set last_checked_at = now()
  returning id into v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------
-- Satır düzeyi güvenlik
-- ---------------------------------------------------------------------
alter table public.app_users enable row level security;
alter table public.app_settings enable row level security;
alter table public.units enable row level security;
alter table public.fx_rates enable row level security;

create policy app_users_select on public.app_users
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy app_settings_select on public.app_settings
  for select to authenticated using ((select public.is_app_member()));
create policy app_settings_update on public.app_settings
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy units_select on public.units
  for select to authenticated using ((select public.is_app_member()));

create policy fx_rates_select on public.fx_rates
  for select to authenticated using ((select public.is_app_member()));

revoke all on public.app_users, public.app_settings, public.units, public.fx_rates from anon;
revoke insert, update, delete, truncate on public.app_users, public.units, public.fx_rates from authenticated;
revoke insert, delete, truncate on public.app_settings from authenticated;
revoke update on public.app_settings from authenticated;
grant update (company_name, fx_primary_source, fx_tcmb_rate_type, fx_refresh_minutes, fx_max_age_days, show_usd_info)
  on public.app_settings to authenticated;

-- Supabase varsayılan olarak public şemasındaki her fonksiyonu anon rolüne açar.
-- Bu yardımcı, her migration sonunda çağrılarak anonim erişimi kapatır.
create or replace function private.lock_down_public_functions()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_fn record;
begin
  for v_fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon', v_fn.sig);
    execute format('grant execute on function %s to authenticated, service_role', v_fn.sig);
  end loop;
  revoke execute on function public.record_auto_fx_rate(text, text, numeric, date, jsonb) from authenticated;
end
$$;

do $$ begin perform private.lock_down_public_functions(); end $$;
