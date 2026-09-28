#!/usr/bin/env bash
# Asgari yerel Supabase yığınını başlatır, migration'ları uygular ve bir
# yönetici kullanıcı oluşturur. Supabase CLI varsa bunun yerine README'deki
# `supabase start` adımlarını kullanın.
#
# Ortam: ADMIN_EMAIL (varsayılan admin@heatemp.local), ADMIN_PASSWORD (varsayılan heatemp-yerel-123)
#        WITH_STORAGE=1 → ürün görselleri için Storage servisini de başlatır.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
cd "$DIR"

eval "$(node jwt.mjs | sed 's/^/export /')"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@heatemp.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-heatemp-yerel-123}"
PROFILE_ARGS=()
if [[ "${WITH_STORAGE:-0}" == "1" ]]; then PROFILE_ARGS=(--profile storage); fi

docker compose "${PROFILE_ARGS[@]}" up -d db
echo "Veritabanı bekleniyor..."
until PGPASSWORD=postgres psql "$DB_URL" -Atqc "select 1" >/dev/null 2>&1; do sleep 1; done
sleep 3
until PGPASSWORD=postgres psql "$DB_URL" -Atqc "select 1" >/dev/null 2>&1; do sleep 1; done

# Servis rollerinin parolaları (Supabase self-hosted roles.sql eşdeğeri; süper kullanıcı gerekir)
PGPASSWORD=postgres psql "postgresql://supabase_admin@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -q <<'SQL'
alter role authenticator with password 'postgres';
alter role supabase_auth_admin with password 'postgres';
alter role supabase_storage_admin with password 'postgres';
SQL

docker compose "${PROFILE_ARGS[@]}" up -d
echo "Auth migration'ları bekleniyor..."
until PGPASSWORD=postgres psql "$DB_URL" -Atqc "select 1 from auth.schema_migrations limit 1" >/dev/null 2>&1; do sleep 1; done
until curl -sf http://127.0.0.1:54321/auth/v1/health >/dev/null; do sleep 1; done
if [[ "${WITH_STORAGE:-0}" == "1" ]]; then
  echo "Storage migration'ları bekleniyor..."
  until PGPASSWORD=postgres psql "$DB_URL" -Atqc "select 1 from information_schema.columns where table_schema='storage' and table_name='buckets' and column_name='public'" | grep -q 1; do sleep 1; done
fi

APPLIED=$(PGPASSWORD=postgres psql "$DB_URL" -Atqc "select to_regclass('public.app_users') is not null")
if [[ "$APPLIED" != "t" ]]; then
  for f in "$ROOT"/supabase/migrations/*.sql; do
    echo "Migration: $(basename "$f")"
    PGPASSWORD=postgres psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
  done
fi
PGPASSWORD=postgres psql "$DB_URL" -qc "notify pgrst, 'reload schema'"

# Yönetici kullanıcı (GoTrue admin API) + uygulama yetkisi
USER_ID=$(curl -s -X POST http://127.0.0.1:54321/auth/v1/admin/users \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\",\"email_confirm\":true}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).id??"")}catch{console.log("")}})')
if [[ -z "$USER_ID" ]]; then
  USER_ID=$(PGPASSWORD=postgres psql "$DB_URL" -Atqc "select id from auth.users where email = '$ADMIN_EMAIL'")
fi
PGPASSWORD=postgres psql "$DB_URL" -qc "insert into public.app_users (user_id, role) values ('$USER_ID', 'admin') on conflict (user_id) do update set role = 'admin'"

if [[ ! -f "$ROOT/.env.local" ]]; then
  cat > "$ROOT/.env.local" <<ENV
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
ENV
  echo ".env.local oluşturuldu."
fi

echo
echo "Hazır. API: http://127.0.0.1:54321  DB: $DB_URL"
echo "Giriş: $ADMIN_EMAIL / $ADMIN_PASSWORD"
echo "Uygulama: npm run dev → http://localhost:3000"
