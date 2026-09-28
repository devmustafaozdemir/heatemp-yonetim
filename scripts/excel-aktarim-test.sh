#!/usr/bin/env bash
# Excel aktarım paketini YEREL ve temiz bir Supabase Postgres'te test eder. Uzak veritabanına dokunmaz.
# Önce paketi üretin: npm run excel:aktarim -- --excel "referans/....xlsx" --stok-tarihi YYYY-AA-GG
# Kullanım: bash scripts/excel-aktarim-test.sh   (KEEP_DB=1 ile konteyner açık kalır)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${SUPABASE_PG_IMAGE:-supabase/postgres:17.6.1.178}"
NAME="${DB_CONTAINER:-heatemp-aktarim-test}"
PORT="${DB_PORT:-54330}"
URL="postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres"
PAKET="${PAKET:-$ROOT/import/excel-aktarim}"
EXCEL="${EXCEL:-$ROOT/referans/Mekonsis_Heatamp_Stok_Takip (1).xlsx}"
TMP="$(mktemp -d)"
ADMIN=00000000-0000-0000-0000-00000000a001

q() { PGPASSWORD=postgres psql "$URL" -v ON_ERROR_STOP=1 -Atq "$@"; }
ok() { echo "  ✓ $*"; }
fail() { echo "  ✗ $*"; exit 1; }
expect_eq() { [[ "$1" == "$2" ]] && ok "$3 ($1)" || fail "$3: beklenen $2, gelen $1"; }

[[ -f "$PAKET/aktarim.sql" ]] || { echo "Paket yok: $PAKET (önce npm run excel:aktarim)"; exit 1; }
STOK_TARIHI=$(grep -o "v_date date := date '[0-9-]*'" "$PAKET/aktarim.sql" | grep -o "[0-9]\{4\}-[0-9-]*")

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -p "${PORT}:5432" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
cleanup() { rm -rf "$TMP"; [[ "${KEEP_DB:-0}" == "1" ]] || docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
for _ in $(seq 1 60); do
  if q -c "select 1" >/dev/null 2>&1; then sleep 3; q -c "select 1" >/dev/null 2>&1 && break; fi
  sleep 1
done
for f in "$ROOT"/supabase/migrations/*.sql; do q -f "$f" >/dev/null 2>&1 || { echo "Migration hatası: $f"; exit 1; }; done
q -c "insert into auth.users (id, email, aud, role) values ('$ADMIN', 'yonetici@test.local', 'authenticated', 'authenticated');
      insert into public.app_users (user_id, role) values ('$ADMIN', 'admin');" >/dev/null
echo "Test veritabanı hazır ($IMAGE), stok tarihi $STOK_TARIHI"

echo "1) Kuru çalıştırma hiçbir şey kaydetmez"
set +e
DRY=$(q -f "$PAKET/aktarim-kuru.sql" 2>&1)
set -e
echo "$DRY" | grep -q "KURU ÇALIŞTIRMA TAMAMLANDI" && ok "özet mesajı döndü" || fail "kuru çalıştırma mesajı yok: $DRY"
expect_eq "$(q -c "select count(*) from public.products")" "0" "ürün sayısı değişmedi"

echo "2) Önceden var olan kayıtlar (korunmalı)"
q -c "insert into public.products (code, name, default_sale_price, default_currency) values ('HT-KV', 'Kovan (elle girildi)', 9, 'USD');
      insert into public.products (code, name) values ('TEST-X', 'Elle girilmiş başka ürün');
      insert into public.product_variants (product_id, code, name)
        select id, 'HT-FCM4', 'Elle girilmiş varyant' from public.products where code = 'TEST-X';" >/dev/null
ok "HT-KV ürünü ve başka üründe HT-FCM4 varyantı elle oluşturuldu"

echo "3) Gerçek aktarım (maliyet onayı olmadan: yalnızca ürün/varyant)"
REPORT=$(q -f "$PAKET/aktarim.sql")
P1=$(q -c "select count(*) from public.products"); V1=$(q -c "select count(*) from public.product_variants")
expect_eq "$(q -c "select count(*) from public.products where code not in ('HT-KV','TEST-X')")" "18" "yeni ürün"
expect_eq "$(q -c "select name || '|' || default_sale_price from public.products where code = 'HT-KV'")" "Kovan (elle girildi)|9.0000" "mevcut ürün değişmedi"
expect_eq "$(q -c "select p.code from public.product_variants v join public.products p on p.id = v.product_id where v.code = 'HT-FCM4'")" "TEST-X" "başka üründeki varyant yerinde kaldı"
expect_eq "$(q -c "select count(*) from public.product_variants v join public.products p on p.id = v.product_id where p.code = 'HT-KV'")" "4" "HT-KV: elle varyant + 3 yeni varyant"
expect_eq "$(q -c "select count(*) from public.product_variants where name = 'Standart' and code like 'HT-%' and code not in ('HT-KV')")" "0" "yeni ürünlerde artık 'Standart' varyant kalmadı"
expect_eq "$(q -c "select sale_price || ' ' || currency from public.product_variants where code = 'HT-KV15'")" "8.0000 USD" "HT-KV15 varyant fiyatı"
expect_eq "$(q -c "select default_sale_price || ' ' || default_currency || ' ' || critical_stock || '/' || min_stock || '/' || target_stock from public.products where code = 'HT-MT-M'")" "8.0000 USD 50/150/150" "HT-MT-M fiyat ve eşikler"
expect_eq "$(q -c "select count(*) from public.production_batches")" "0" "maliyet onayı yokken stok oluşmadı"
echo "$REPORT" | grep -q "zaten vardı (başka üründe)" && ok "rapor çakışmayı gösteriyor" || fail "rapor çakışmayı göstermiyor"

echo "4) Tekrar çalıştırma mükerrer kayıt oluşturmaz"
q -f "$PAKET/aktarim.sql" >/dev/null
expect_eq "$(q -c "select count(*) from public.products")" "$P1" "ürün sayısı aynı"
expect_eq "$(q -c "select count(*) from public.product_variants")" "$V1" "varyant sayısı aynı"

echo "5) Test maliyetleriyle stok aktarımı (yalnızca test: Excel'deki USD adayları kullanılır)"
node -e '
  const fs = require("fs");
  const o = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  for (const [k, v] of Object.entries(o.acilis_maliyetleri)) {
    const c = v.excel_adaylari.find((x) => x.para_birimi === "USD");
    if (c) { v.birim_maliyet = c.deger; v.para_birimi = "USD"; v.not = "TEST: " + c.kaynak; }
  }
  fs.writeFileSync(process.argv[2], JSON.stringify(o, null, 2));
' "$PAKET/onay.json" "$TMP/onay-test.json"
(cd "$ROOT" && npx tsx scripts/excel-aktarim.ts --excel "$EXCEL" --stok-tarihi "$STOK_TARIHI" \
  --onay "$TMP/onay-test.json" --cikti "$TMP/paket" >/dev/null)
CONFIRMED=$(node -e 'const o=require(process.argv[1]); console.log(Object.values(o.acilis_maliyetleri).filter(v=>v.birim_maliyet).length)' "$TMP/onay-test.json")
QTY=$(node -e 'const o=require(process.argv[1]); console.log(Object.values(o.acilis_maliyetleri).filter(v=>v.birim_maliyet).reduce((a,v)=>a+v.adet,0))' "$TMP/onay-test.json")

set +e
NOFX=$(q -f "$TMP/paket/aktarim.sql" 2>&1)
set -e
echo "$NOFX" | grep -q "geçerli USD/TRY kuru yok" && ok "kur yokken aktarım durdu ve geri alındı" || fail "kur kontrolü çalışmadı: $NOFX"
expect_eq "$(q -c "select count(*) from public.production_batches")" "0" "kur hatasında hiçbir stok oluşmadı"

q -c "insert into public.fx_rates (rate, rate_date, source, rate_type, note) values (48.5, date '$STOK_TARIHI', 'MANUAL', 'Manual', 'test kuru')" >/dev/null
q -f "$TMP/paket/aktarim.sql" >/dev/null
expect_eq "$(q -c "select count(*) from public.production_batches where kind = 'opening'")" "$CONFIRMED" "açılış partisi"
expect_eq "$(q -c "select count(*) from public.deliveries")" "$CONFIRMED" "Mekonsis teslimatı"
expect_eq "$(q -c "select coalesce(sum(mekonsis_qty), 0) from public.v_variant_overview")" "$QTY" "Mekonsis rafı toplamı"
expect_eq "$(q -c "select coalesce(sum(heatemp_qty), 0) from public.v_variant_overview")" "0" "Heatemp rafı"
expect_eq "$(q -c "select coalesce(sum(produced_qty), 0) || '/' || coalesce(sum(sold_qty), 0) from public.v_variant_overview")" "0/0" "üretim ve satış sayılmadı"
expect_eq "$(q -c "select mekonsis_qty from public.v_variant_overview where variant_code = 'HT-NTC10K-MT-M'")" "98" "HT-NTC10K-MT-M kalan"
AS_ADMIN="select set_config('request.jwt.claims', json_build_object('sub', '$ADMIN', 'role', 'authenticated')::text, false), set_config('request.jwt.claim.sub', '$ADMIN', false);"
expect_eq "$(q -c "$AS_ADMIN" -c "select count(*) from public.ledger_inconsistencies()" | tail -1)" "0" "defter tutarlı"

echo "6) Stok aktarımını tekrar çalıştırma çift stok oluşturmaz"
q -f "$TMP/paket/aktarim.sql" >/dev/null
expect_eq "$(q -c "select count(*) from public.production_batches")" "$CONFIRMED" "parti sayısı aynı"
expect_eq "$(q -c "select coalesce(sum(mekonsis_qty), 0) from public.v_variant_overview")" "$QTY" "Mekonsis rafı aynı"

echo
echo "Tüm aktarım testleri geçti."
