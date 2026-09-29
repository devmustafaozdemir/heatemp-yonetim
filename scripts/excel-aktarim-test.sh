#!/usr/bin/env bash
# Excel aktarım paketini YEREL ve temiz bir Supabase Postgres'te uçtan uca test eder.
# Uzak veritabanına ve gerçek TCMB'ye dokunmaz: TCMB arşivi yerel bir HTTP sunucusuyla taklit edilir
# (yalnızca Cuma 25.09.2026 bülteni + bilerek farklı bir today.xml; stok tarihi Pazar 27.09.2026).
# Kullanım: bash scripts/excel-aktarim-test.sh   (KEEP_DB=1 ile konteyner açık kalır)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${SUPABASE_PG_IMAGE:-supabase/postgres:17.6.1.178}"
NAME="${DB_CONTAINER:-heatemp-aktarim-test}"
PORT="${DB_PORT:-54330}"
TCMB_PORT="${TCMB_PORT:-54331}"
URL="postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres"
EXCEL="${EXCEL:-$ROOT/referans/Mekonsis_Heatamp_Stok_Takip (1).xlsx}"
TMP="$(mktemp -d)"
PAKET="$TMP/paket"
ADMIN=00000000-0000-0000-0000-00000000a001
STOK_TARIHI=2026-09-27 # Pazar: bülten yok → Cuma 25.09.2026 bülteni kullanılmalı
KUR=41.4321            # Cuma bülteni ForexBuying
BUGUN_KUR=99.1234      # today.xml (kullanılmamalı)

q() { PGPASSWORD=postgres psql "$URL" -v ON_ERROR_STOP=1 -Atq "$@"; }
ok() { echo "  ✓ $*"; }
fail() { echo "  ✗ $*"; exit 1; }
expect_eq() { [[ "$1" == "$2" ]] && ok "$3 ($1)" || fail "$3: beklenen $2, gelen $1"; }
expect_err() { # $1 dosya, $2 beklenen hata metni, $3 açıklama
  local out
  set +e; out=$(q -f "$1" 2>&1); local rc=$?; set -e
  [[ $rc -ne 0 ]] && echo "$out" | grep -q "$2" && ok "$3" || fail "$3: $out"
}
uret() { (cd "$ROOT" && TCMB_BASE_URL="http://127.0.0.1:${TCMB_PORT}/kurlar" npx tsx scripts/excel-aktarim.ts --excel "$EXCEL" --cikti "$@"); }
AS_ADMIN="select set_config('request.jwt.claims', json_build_object('sub', '$ADMIN', 'role', 'authenticated')::text, false), set_config('request.jwt.claim.sub', '$ADMIN', false);"

[[ -f "$EXCEL" ]] || { echo "Excel yok: $EXCEL"; exit 1; }

# --- sahte TCMB arşivi
mkdir -p "$TMP/tcmb/kurlar/202609"
tcmb_xml() {
  cat <<XML
<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="$1" Date="$2" Bulten_No="$3">
<Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
<Unit>1</Unit><Isim>ABD DOLARI</Isim><CurrencyName>US DOLLAR</CurrencyName>
<ForexBuying>$4</ForexBuying><ForexSelling>$5</ForexSelling>
</Currency>
</Tarih_Date>
XML
}
tcmb_xml 25.09.2026 09/25/2026 2026/185 "$KUR" 41.5068 >"$TMP/tcmb/kurlar/202609/25092026.xml"
tcmb_xml 28.09.2026 09/28/2026 2026/186 "$BUGUN_KUR" 99.2000 >"$TMP/tcmb/kurlar/today.xml"
python3 -m http.server "$TCMB_PORT" --bind 127.0.0.1 --directory "$TMP/tcmb" 2>"$TMP/tcmb.log" >/dev/null &
TCMB_PID=$!

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -p "${PORT}:5432" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
cleanup() {
  kill "$TCMB_PID" 2>/dev/null || true
  rm -rf "$TMP"
  [[ "${KEEP_DB:-0}" == "1" ]] || docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "0) Paket üretimi (stok tarihi olmadan)"
uret "$PAKET" >/dev/null
[[ -f "$PAKET/katalog-aktarim.sql" && -f "$PAKET/katalog-aktarim-kuru.sql" && -f "$PAKET/stok-onay.xlsx" ]] \
  && ok "katalog SQL'leri ve stok-onay.xlsx üretildi" || fail "katalog paketi eksik"
[[ ! -e "$PAKET/stok-aktarim.sql" ]] && ok "stok tarihi yokken stok SQL'i üretilmedi" || fail "stok SQL'i üretilmemeliydi"
grep -qiE "fx_rate|:= public.record_opening_stock|deliver_to_mekonsis|app_users|request.jwt" "$PAKET/katalog-aktarim.sql" \
  && fail "katalog SQL'i kur/stok/yönetici içeriyor" || ok "katalog SQL'i kur, stok ve yönetici gerektirmiyor"

for _ in $(seq 1 60); do
  if q -c "select 1" >/dev/null 2>&1; then sleep 3; q -c "select 1" >/dev/null 2>&1 && break; fi
  sleep 1
done
for f in "$ROOT"/supabase/migrations/*.sql; do q -f "$f" >/dev/null 2>&1 || { echo "Migration hatası: $f"; exit 1; }; done
q -c "insert into auth.users (id, email, aud, role) values ('$ADMIN', 'yonetici@test.local', 'authenticated', 'authenticated');
      insert into public.app_users (user_id, role) values ('$ADMIN', 'admin');" >/dev/null
echo "Test veritabanı hazır ($IMAGE)"

echo "1) Katalog kuru çalıştırma hiçbir şey kaydetmez"
expect_err "$PAKET/katalog-aktarim-kuru.sql" "KATALOG KURU ÇALIŞTIRMA TAMAMLANDI" "özet mesajı döndü"
expect_eq "$(q -c "select count(*) from public.products")" "0" "ürün sayısı değişmedi"

echo "2) Önceden var olan kayıtlar (korunmalı)"
q -c "insert into public.products (code, name, default_sale_price, default_currency) values ('HT-KV', 'Kovan (elle girildi)', 9, 'USD');
      insert into public.products (code, name) values ('TEST-X', 'Elle girilmiş başka ürün');
      insert into public.product_variants (product_id, code, name)
        select id, 'HT-FCM4', 'Elle girilmiş varyant' from public.products where code = 'TEST-X';" >/dev/null
ok "HT-KV ürünü ve başka üründe HT-FCM4 varyantı elle oluşturuldu"

echo "3) Katalog aktarımı (kur ve maliyet olmadan)"
REPORT=$(q -f "$PAKET/katalog-aktarim.sql")
P1=$(q -c "select count(*) from public.products"); V1=$(q -c "select count(*) from public.product_variants")
expect_eq "$(q -c "select count(*) from public.products where code not in ('HT-KV','TEST-X')")" "18" "yeni ürün"
expect_eq "$(q -c "select name || '|' || default_sale_price from public.products where code = 'HT-KV'")" "Kovan (elle girildi)|9.0000" "mevcut ürün değişmedi"
expect_eq "$(q -c "select p.code from public.product_variants v join public.products p on p.id = v.product_id where v.code = 'HT-FCM4'")" "TEST-X" "başka üründeki varyant yerinde kaldı"
expect_eq "$(q -c "select count(*) from public.product_variants v join public.products p on p.id = v.product_id where p.code = 'HT-KV'")" "4" "HT-KV: elle varyant + 3 yeni varyant"
expect_eq "$(q -c "select count(*) from public.product_variants where name = 'Standart' and code like 'HT-%' and code not in ('HT-KV')")" "0" "yeni ürünlerde 'Standart' varyant kalmadı"
expect_eq "$(q -c "select sale_price || ' ' || currency from public.product_variants where code = 'HT-KV15'")" "8.0000 USD" "HT-KV15 varyant fiyatı"
expect_eq "$(q -c "select string_agg(code || '=' || default_sale_price, ',' order by code) from public.products where default_sale_price is not null and code <> 'HT-KV'")" \
  "HT-K-150mm=12.0000,HT-KT-150mm=10.0000,HT-MT-M=8.0000,HT-MT-P=10.0000,HT-SKS=50.0000" "kesin eşleşen ürün fiyatları"
expect_eq "$(q -c "select count(*) from public.products where default_sale_price is not null and code in ('HT-FCM')")" "0" "belirsiz Çoklama Kartı fiyatı aktarılmadı"
expect_eq "$(q -c "select distinct critical_stock || '/' || min_stock || '/' || target_stock from public.products where code not in ('HT-KV','TEST-X')")" "50/150/150" "stok eşikleri"
expect_eq "$(q -c "select (select count(*) from public.production_batches) + (select count(*) from public.deliveries) + (select count(*) from public.fx_rates)")" "0" "stok, teslimat ve kur oluşmadı"
echo "$REPORT" | grep -q "zaten vardı (başka üründe)" && ok "rapor çakışmayı gösteriyor" || fail "rapor çakışmayı göstermiyor"

echo "4) Katalog tekrar çalıştırma mükerrer kayıt oluşturmaz"
q -f "$PAKET/katalog-aktarim.sql" >/dev/null
expect_eq "$(q -c "select count(*) from public.products")" "$P1" "ürün sayısı aynı"
expect_eq "$(q -c "select count(*) from public.product_variants")" "$V1" "varyant sayısı aynı"

echo "5) Onay tablosu: test maliyetleri (yalnızca test: Excel'deki aday 1 değerleri) — negatif kalanlılar dahil dolduruluyor"
FILL='
  const ExcelJS = require("exceljs");
  (async () => {
    const [file, mode] = process.argv.slice(1);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file);
    const ws = wb.getWorksheet("Stok onayı");
    const col = {}; ws.getRow(1).eachCell((c, n) => (col[c.value] = n));
    let n = 0, qty = 0;
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const a1 = row.getCell(col["Aday 1: Satış Fiyatları maliyeti"]).value;
      if (mode === "doldur" && typeof a1 === "number") {
        row.getCell(col["ONAYLANAN birim maliyet"]).value = a1;
        row.getCell(col["ONAYLANAN para birimi"]).value = row.getCell(col["Aday 1 para birimi"]).value;
        row.getCell(col["Onay notu (kaynak, isteğe bağlı)"]).value = "TEST";
      }
      if (mode === "bozuk" && row.getCell(col["Ürün kodu"]).value === "HT-KV15") row.getCell(col["Mekonsis kalan (adet)"]).value = 1;
      const kalan = row.getCell(col["Mekonsis kalan (adet)"]).value;
      if (typeof row.getCell(col["ONAYLANAN birim maliyet"]).value === "number" && kalan > 0) { n++; qty += kalan; }
    }
    if (mode !== "say") await wb.xlsx.writeFile(file);
    console.log(n + " " + qty);
  })();'
read -r CONFIRMED QTY < <(cd "$ROOT" && node -e "$FILL" "$PAKET/stok-onay.xlsx" doldur)
expect_eq "$CONFIRMED/$QTY" "8/691" "pozitif kalanlı onaylı kod/adet"

echo "6) TCMB'ye ulaşılamazsa stok SQL'i üretilmez"
set +e; (cd "$ROOT" && TCMB_BASE_URL="http://127.0.0.1:1/kurlar" npx tsx scripts/excel-aktarim.ts --excel "$EXCEL" --cikti "$PAKET" --stok-tarihi "$STOK_TARIHI" >"$TMP/out.txt" 2>&1); RC=$?; set -e
[[ $RC -eq 2 && ! -e "$PAKET/stok-aktarim.sql" ]] && ok "çıkış kodu 2, stok SQL'i yok, manuel kura düşülmedi" || fail "rc=$RC $(cat "$TMP/out.txt")"
expect_eq "$(cd "$ROOT" && node -e "$FILL" "$PAKET/stok-onay.xlsx" say)" "8 691" "yeniden üretimde onaylar korundu"

echo "7) Stok paketi: stok tarihi Pazar → Cuma bülteni (bugünün kuru değil)"
uret "$PAKET" --stok-tarihi "$STOK_TARIHI" >/dev/null
[[ -f "$PAKET/stok-aktarim.sql" && -f "$PAKET/stok-aktarim-kuru.sql" ]] && ok "stok SQL'leri üretildi" || fail "stok SQL'i yok"
grep -q "today.xml" "$TMP/tcmb.log" && fail "today.xml istendi" || ok "today.xml istenmedi"
expect_eq "$(grep -o 'GET /kurlar/[^ ]*' "$TMP/tcmb.log" | tail -3 | tr '\n' ' ')" \
  "GET /kurlar/202609/27092026.xml GET /kurlar/202609/26092026.xml GET /kurlar/202609/25092026.xml " "Pazar → Cumartesi → Cuma denendi"
grep -q "v_kur numeric := $KUR;" "$PAKET/stok-aktarim.sql" && ok "Cuma kuru ($KUR) gömüldü" || fail "gömülü kur yanlış"
grep -q "$BUGUN_KUR" "$PAKET/stok-aktarim.sql" && fail "bugünün kuru SQL'de" || ok "bugünün kuru SQL'de yok"
grep -qE "'HT-SKS-(S1|N1)', -?[0-9]+, " "$PAKET/stok-aktarim.sql" && fail "negatif kalanlı kod aktarılacak listesinde" \
  || ok "HT-SKS-S1/N1 maliyet girilmesine rağmen aktarılacaklar listesinde değil"
grep -q "'HT-SKS-S1', 'HARİÇ'" "$PAKET/stok-aktarim.sql" && ok "HT-SKS-S1 raporda HARİÇ" || fail "HT-SKS-S1 raporda yok"

echo "8) Onay tablosundaki kalan Excel'le uyuşmazsa üretim durur"
mkdir -p "$TMP/bozuk" && cp "$PAKET/stok-onay.xlsx" "$TMP/bozuk/" && (cd "$ROOT" && node -e "$FILL" "$TMP/bozuk/stok-onay.xlsx" bozuk >/dev/null)
set +e; OUT=$(uret "$TMP/bozuk" 2>&1); RC=$?; set -e
[[ $RC -ne 0 ]] && echo "$OUT" | grep -q "HT-KV15: tablodaki kalan 1" && ok "uyuşmazlık hatası" || fail "uyuşmazlık yakalanmadı: $OUT"

echo "9) Stok SQL'i katalogdan önce veya uygunsuz kurla çalışmaz"
q -c "update public.product_variants set code = 'GECICI-KV15' where code = 'HT-KV15'" >/dev/null
expect_err "$PAKET/stok-aktarim.sql" "Önce katalog-aktarim.sql çalıştırın" "eksik varyant → katalog uyarısı"
q -c "update public.product_variants set code = 'HT-KV15' where code = 'GECICI-KV15'" >/dev/null
q -c "update public.app_settings set fx_max_age_days = 1" >/dev/null
expect_err "$PAKET/stok-aktarim.sql" "kur yaşı sınırı 1 gün" "bülten kur yaşı sınırından eskiyse açık hata"
q -c "update public.app_settings set fx_max_age_days = 4" >/dev/null
q -c "insert into public.fx_rates (rate, rate_date, source, rate_type) values (40, date '2026-09-25', 'TCMB', 'ForexBuying')" >/dev/null
expect_err "$PAKET/stok-aktarim.sql" "TCMB arşivindeki değer" "veritabanında farklı TCMB kuru varsa durur"
q -c "delete from public.fx_rates" >/dev/null
expect_eq "$(q -c "select (select count(*) from public.production_batches) + (select count(*) from public.fx_rates)")" "0" "hatalarda hiçbir şey kaydedilmedi"

echo "10) Stok kuru çalıştırma"
expect_err "$PAKET/stok-aktarim-kuru.sql" "STOK KURU ÇALIŞTIRMA TAMAMLANDI" "özet mesajı döndü"
expect_eq "$(q -c "select (select count(*) from public.production_batches) + (select count(*) from public.fx_rates)")" "0" "kuru çalıştırma kayıt bırakmadı"

echo "11) Stok aktarımı"
q -f "$PAKET/stok-aktarim.sql" >/dev/null
expect_eq "$(q -c "select source || ' ' || rate_type || ' ' || rate || ' ' || rate_date || ' ' || (raw->>'istenen_tarih') || ' ' || (raw->>'bulletin') from public.fx_rates")" \
  "TCMB ForexBuying 41.432100 2026-09-25 2026-09-27 2026/185" "kur TCMB kaynağı ve bülten tarihiyle kaydedildi"
expect_eq "$(q -c "select count(*) || ' ' || count(*) filter (where b.fx_rate_id = f.id) || ' ' || min(b.fx_rate) from public.production_batches b cross join public.fx_rates f where b.kind = 'opening'")" \
  "$CONFIRMED $CONFIRMED 41.432100" "açılış partileri Cuma kuruyla"
expect_eq "$(q -c "select count(*) from public.production_batches where kind <> 'opening'")" "0" "üretim partisi oluşmadı"
expect_eq "$(q -c "select count(*) from public.deliveries")" "$CONFIRMED" "Mekonsis teslimatı"
expect_eq "$(q -c "select count(*) from public.production_batches b join public.product_variants v on v.id = b.variant_id where v.code like 'HT-SKS-%'")" "0" "negatif kalanlılar aktarılmadı"
expect_eq "$(q -c "select sum(opening_qty) || '/' || sum(mekonsis_qty) || '/' || sum(heatemp_qty) from public.v_variant_overview")" "$QTY/$QTY/0" "açılış/Mekonsis/Heatemp"
expect_eq "$(q -c "select sum(produced_qty) || '/' || sum(production_spend_try) || '/' || sum(sold_qty) || '/' || sum(revenue_try) || '/' || sum(gross_profit_try) from public.v_variant_overview")" \
  "0/0.0000/0/0.0000/0.0000" "üretilen adet, üretim harcaması, satış, ciro, kâr sıfır"
expect_eq "$(q -c "select produced_qty || '/' || production_spend_try || '/' || revenue_try || '/' || gross_profit_try from public.v_financial_summary")" \
  "0/0.0000/0.0000/0.0000" "Dashboard finans özeti etkilenmedi"
expect_eq "$(q -c "select abs(opening_value_try - (98*3.26*2 + 20*2.45*2 + 340*3.5 + 26*4 + 50*4 + 39*5) * $KUR) < 1 from public.v_financial_summary")" "t" "açılış değeri = onaylı maliyet × Cuma kuru"
expect_eq "$(q -c "select mekonsis_qty from public.v_variant_overview where variant_code = 'HT-NTC10K-MT-M'")" "98" "HT-NTC10K-MT-M kalan"
expect_eq "$(q -c "$AS_ADMIN" -c "select count(*) from public.ledger_inconsistencies()" | tail -1)" "0" "defter tutarlı"

echo "12) Stok ve katalog tekrar çalıştırma çift kayıt oluşturmaz"
REPORT=$(q -f "$PAKET/stok-aktarim.sql")
q -f "$PAKET/katalog-aktarim.sql" >/dev/null
expect_eq "$(q -c "select count(*) from public.production_batches")" "$CONFIRMED" "parti sayısı aynı"
expect_eq "$(q -c "select count(*) from public.fx_rates")" "1" "kur kaydı tek"
expect_eq "$(q -c "select sum(mekonsis_qty) from public.v_variant_overview")" "$QTY" "Mekonsis rafı aynı"
expect_eq "$(echo "$REPORT" | grep -c "zaten vardı")" "$CONFIRMED" "rapor: tümü zaten vardı"

echo
echo "Tüm aktarım testleri geçti."
