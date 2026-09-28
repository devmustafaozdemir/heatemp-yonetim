#!/usr/bin/env bash
# Supabase CLI olmadan veritabanı testlerini çalıştırır:
# temiz bir supabase/postgres konteyneri açar, migration'ları sırayla uygular,
# vitest "db" projesini çalıştırır ve konteyneri kaldırır.
#
# Kullanım: npm run test:db:docker            (KEEP_DB=1 ile konteyner açık kalır)
# Supabase CLI kullanıyorsanız: supabase db reset && npm run test:db
set -euo pipefail

IMAGE="${SUPABASE_PG_IMAGE:-supabase/postgres:15.8.1.085}"
NAME="${DB_CONTAINER:-heatemp-test-db}"
PORT="${DB_PORT:-54329}"
URL="postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -p "${PORT}:5432" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null

cleanup() {
  if [[ "${KEEP_DB:-0}" != "1" ]]; then
    docker rm -f "$NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "Veritabanı bekleniyor..."
for _ in $(seq 1 60); do
  if PGPASSWORD=postgres psql "$URL" -Atqc "select 1" >/dev/null 2>&1; then
    # İlk açılışta init betikleri çalışırken sunucu bir kez yeniden başlar.
    sleep 3
    PGPASSWORD=postgres psql "$URL" -Atqc "select 1" >/dev/null 2>&1 && break
  fi
  sleep 1
done

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "Migration: $(basename "$f")"
  PGPASSWORD=postgres psql "$URL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
done

DATABASE_URL="$URL" npx vitest run --project db "$@"
