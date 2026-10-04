-- =====================================================================
-- Heatemp ERP — 30 Kalıplar
-- Kalıp kartı: ad, kod, ücret (USD/TRY), alış tarihi, tedarikçi, ilgili ürün ve not.
-- Ürün maliyetine veya stoğa dokunmaz; kayıt amaçlıdır. Tekrar çalıştırılabilir.
-- =====================================================================

create table if not exists public.molds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  code text,
  price numeric(18, 4) not null check (price >= 0),
  currency text not null default 'USD' check (currency in ('USD', 'TRY')),
  purchased_on date,
  supplier_id uuid references public.suppliers (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists molds_code_unique on public.molds (lower(btrim(code))) where code is not null and btrim(code) <> '';

drop trigger if exists molds_updated_at on public.molds;
create trigger molds_updated_at before update on public.molds
  for each row execute function private.set_updated_at();

alter table public.molds enable row level security;
drop policy if exists molds_select on public.molds;
drop policy if exists molds_insert on public.molds;
drop policy if exists molds_update on public.molds;
drop policy if exists molds_delete on public.molds;
create policy molds_select on public.molds for select to authenticated
  using ((select public.is_app_member()));
create policy molds_insert on public.molds for insert to authenticated
  with check ((select public.is_admin()));
create policy molds_update on public.molds for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy molds_delete on public.molds for delete to authenticated
  using ((select public.is_admin()));

comment on table public.molds is 'Kalıplar ve ücretleri (kayıt amaçlı; maliyet ve stoğa etkisi yok).';
