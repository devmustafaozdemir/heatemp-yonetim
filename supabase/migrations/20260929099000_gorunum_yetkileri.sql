-- =====================================================================
-- Heatemp ERP — 18 Görünüm yetkilerinin sadeleştirilmesi
-- Supabase'in varsayılan yetkileri yeni oluşturulan görünümlere authenticated
-- rolü için yalnız SELECT değil tüm tablo yetkilerini (INSERT/UPDATE/DELETE…)
-- verebilir. Görünümler güncellenemez olduğu ve security_invoker ile temel
-- tabloların RLS'i uygulandığı için bu istismar edilemez; yine de yetki matrisi
-- "görünümler yalnız okunur" kuralına indirgenir. Yeni görünüm ekleyen her
-- migration sonunda private.lock_down_public_views() çağrılmalıdır.
-- =====================================================================

create or replace function private.lock_down_public_views()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_rel record;
begin
  for v_rel in
    select c.oid::regclass as rel
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('v', 'm')
       and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
  loop
    execute format('revoke all on %s from anon, authenticated', v_rel.rel);
    execute format('grant select on %s to authenticated', v_rel.rel);
  end loop;
end
$$;

do $$ begin perform private.lock_down_public_views(); end $$;
do $$ begin perform private.lock_down_public_functions(); end $$;
