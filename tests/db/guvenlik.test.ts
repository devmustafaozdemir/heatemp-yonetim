import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  anon,
  createUser,
  expectError,
  pool,
  produce,
  query,
  receive,
  rpc,
  setupProduct,
  sql,
  type Actor,
  type Fixture,
} from "./helpers";

let admin: Actor;
let viewer: Actor;
let outsider: Actor;
let f: Fixture;

beforeAll(async () => {
  admin = await createUser("admin");
  viewer = await createUser("viewer");
  outsider = await createUser(null);
  f = await setupProduct(admin);
  await receive(admin, f.materials[0].id, 10, "kg", 10, "USD", f.fxId);
  await receive(admin, f.materials[1].id, 50, "adet", 80, "TRY", f.fxId);
});

afterAll(async () => {
  await pool.end();
});

describe("Supabase RLS ve yetki", () => {
  it("anonim kullanıcı hiçbir tabloyu okuyamaz ve RPC çağıramaz", async () => {
    await expectError(query(anon, "select * from public.products"), /permission denied/);
    await expectError(query(anon, "select * from public.v_financial_summary"), /permission denied/);
    await expectError(
      rpc(anon, "start_production", { p_variant_id: f.variantId, p_quantity: 1, p_fx_rate_id: f.fxId }),
      /permission denied/,
    );
  });

  it("uygulamaya eklenmemiş oturum sahibi hiçbir kaydı göremez ve değiştiremez", async () => {
    expect(await query(outsider, "select * from public.products")).toEqual([]);
    expect(await query(outsider, "select * from public.material_balances")).toEqual([]);
    await expectError(
      query(outsider, "insert into public.products (code, name) values ('X-1', 'X')"),
      /row-level security/,
    );
    await expectError(
      rpc(outsider, "receive_material", {
        p_material_id: f.materials[0].id,
        p_qty: 1,
        p_unit: "kg",
        p_unit_price: 1,
        p_currency: "USD",
        p_fx_rate_id: f.fxId,
      }),
      /yönetici yetkisi/,
    );
    await expectError(rpc(outsider, "simulate_production", { p_variant_id: f.variantId, p_quantity: 1 }), /yetkiniz yok/);
  });

  it("görüntüleyici okuyabilir ama maliyet ve stok kayıtlarını değiştiremez", async () => {
    const rows = await query(viewer, "select * from public.v_materials where id = $1", [f.materials[0].id]);
    expect(rows).toHaveLength(1);
    await expectError(
      query(viewer, "update public.products set default_sale_price = 1 where id = $1", [f.productId]).then(async () => {
        const [p] = await sql("select default_sale_price from public.products where id = $1", [f.productId]);
        if (Number(p.default_sale_price) === 1) throw new Error("güncellendi");
        throw new Error("row-level security: satır etkilenmedi");
      }),
      /row-level security/,
    );
    await expectError(
      rpc(viewer, "start_production", { p_variant_id: f.variantId, p_quantity: 1, p_fx_rate_id: f.fxId }),
      /yönetici yetkisi/,
    );
    await expectError(rpc(viewer, "add_manual_fx_rate", { p_rate: 40, p_rate_date: "2026-01-01" }), /yönetici yetkisi/);
  });

  it("yönetici bile stok defterini ve bakiyeleri doğrudan değiştiremez", async () => {
    await expectError(
      query(admin, "update public.material_balances set qty = 999999 where material_id = $1", [f.materials[0].id]),
      /permission denied/,
    );
    await expectError(
      query(
        admin,
        "insert into public.material_movements (material_id, movement_type, qty, value_try, value_usd, unit_cost_try, unit_cost_usd, balance_qty_after, balance_value_try_after) values ($1, 'write_off', -1, 0, 0, 0, 0, 0, 0)",
        [f.materials[0].id],
      ),
      /permission denied/,
    );
    const batchId = await produce(f, 2);
    await expectError(
      query(admin, "update public.production_batches set unit_cost_try = 0 where id = $1", [batchId]),
      /permission denied/,
    );
    await expectError(query(admin, "update public.stock_layers set qty_out = 0"), /permission denied/);
    await expectError(query(admin, "delete from public.sales"), /permission denied/);
    await expectError(
      query(admin, "insert into public.fx_rates (rate, rate_date, source, rate_type) values (1, '2026-01-01', 'TCMB', 'ForexBuying')"),
      /permission denied/,
    );
  });

  it("otomatik kur yalnızca sunucu (service role) tarafından kaydedilebilir", async () => {
    await expectError(
      rpc(admin, "record_auto_fx_rate", { p_source: "TCMB", p_rate_type: "ForexBuying", p_rate: 1, p_rate_date: "2026-01-01" }),
      /permission denied/,
    );
  });

  it("ayarlarda yalnızca izin verilen alanlar değiştirilebilir", async () => {
    await query(admin, "update public.app_settings set fx_max_age_days = 4 where id");
    await expectError(query(admin, "update public.app_settings set updated_by = null where id"), /permission denied/);
    await expectError(query(viewer, "update public.app_settings set fx_max_age_days = 9 where id").then(async () => {
      const [s] = await sql("select fx_max_age_days from public.app_settings");
      if (s.fx_max_age_days === 9) throw new Error("güncellendi");
      throw new Error("row-level security: satır etkilenmedi");
    }), /row-level security/);
  });
});

// Yeni görünüm/fonksiyon eklendiğinde de geçerli olsun diye katalogdan dinamik denetim.
const DEFINER_ALLOWLIST = [
  "add_manual_fx_rate(numeric,date,text)",
  "cancel_delivery(uuid,text)",
  "cancel_production(uuid,text)",
  "cancel_sale(uuid,text)",
  "complete_production(uuid)",
  "convert_quote_to_sale(uuid,date,bigint,uuid)",
  "copy_bom(uuid,uuid)",
  "delete_material_movement(bigint)",
  "deliver_to_mekonsis(uuid,integer,uuid,date,text,uuid)",
  "fx_rate_for_date(date)",
  "is_admin()",
  "is_app_member()",
  "ledger_inconsistencies()",
  "quote_estimate(uuid)",
  "receive_material(uuid,numeric,text,numeric,text,bigint,date,uuid,text,uuid,numeric,numeric)",
  "record_auto_fx_rate(text,text,numeric,date,jsonb)",
  "record_opening_stock(uuid,integer,numeric,text,bigint,date,text,uuid)",
  "record_sale(date,text,bigint,jsonb,uuid,text,uuid)",
  "simulate_production(uuid,integer)",
  "start_production(uuid,integer,bigint,text,uuid)",
  "write_off_material(uuid,numeric,text,text,uuid)",
  "update_material_purchase(bigint,numeric,text,numeric,text,bigint,date,uuid,text,numeric,numeric)",
  "set_purchase_supplier(bigint,uuid)",
  "delete_raw_material(uuid)",
].sort();

/** Salt okunur rapor fonksiyonları (SECURITY INVOKER): üye olmayan hiçbir veri görmemeli. */
const READ_RPCS: Record<string, string> = {
  customer_summary: "select public.customer_summary(gen_random_uuid(), 12) as r",
  customers_overview: "select public.customers_overview(12) as r",
  delivery_by_variant: "select * from public.delivery_by_variant(current_date - 400, current_date, null)",
  delivery_daily_summary: "select * from public.delivery_daily_summary(current_date - 400, current_date, null)",
  material_flows: "select * from public.material_flows((select id from public.raw_materials limit 1), 'gun', null)",
  material_monthly_flows: "select * from public.material_monthly_flows(null, null)",
  production_by_variant: "select * from public.production_by_variant(current_date - 400, current_date)",
  production_monthly: "select * from public.production_monthly(null)",
  quote_estimates: "select * from public.quote_estimates((select coalesce(array_agg(id), '{}') from public.quotes))",
  quote_item_options: "select * from public.quote_item_options(null)",
  sales_by_variant: "select * from public.sales_by_variant(current_date - 400, current_date)",
  sales_filtered: "select * from public.sales_filtered(null, null, null, null, null, null, false, null)",
  sales_list_summary: "select public.sales_list_summary(null, null, null, null, null, null, false, true) as r",
  shelf_monthly_movements: "select * from public.shelf_monthly_movements('heatemp', current_date - 400, current_date)",
};

/**
 * Üye olmayan için özet sonuçlarında yalnız sıfır/boş değerler olmalı: sayılar 0, metinler yalnız
 * boş veya tarih/ay anahtarı (ör. boş aylık seri), diziler yalnız bu tür öğeler.
 */
function onlyEmpty(v: unknown): boolean {
  if (v === null || v === undefined || typeof v === "boolean") return true;
  if (typeof v === "number") return v === 0;
  if (typeof v === "string") return v === "" || /^\d{4}-\d{2}(-\d{2})?$/.test(v) || (v.trim() !== "" && Number(v) === 0);
  if (Array.isArray(v)) return v.every(onlyEmpty);
  return Object.values(v as Record<string, unknown>).every(onlyEmpty);
}

describe("Tüm public görünüm ve fonksiyonlar (katalogdan dinamik)", () => {
  it("anon hiçbir ilişkiye ve fonksiyona erişemez", async () => {
    expect(
      await sql(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r','v','m','p')
          and has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`),
    ).toEqual([]);
    expect(
      await sql(`select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')`),
    ).toEqual([]);
  });

  it("görünümler security_invoker ve authenticated için yalnız okunur; fonksiyonlarda search_path sabit", async () => {
    const views = await sql<{ relname: string; invoker: boolean; extra: string[] }>(
      `select c.relname, coalesce('security_invoker=true' = any(c.reloptions), false) as invoker,
              array(select x from unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) x
                    where has_table_privilege('authenticated', c.oid, x)) as extra
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'v'`,
    );
    expect(views.length).toBeGreaterThan(15);
    expect(views.filter((v) => !v.invoker || v.extra.length > 0)).toEqual([]);

    const fns = await sql<{ sig: string; prosecdef: boolean; proconfig: string[] | null }>(
      `select p.oid::regprocedure::text as sig, p.prosecdef, p.proconfig
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname <> 'today_tr'`,
    );
    expect(fns.filter((x) => !(x.proconfig ?? []).some((c) => c.startsWith("search_path=")))).toEqual([]);
    expect(fns.filter((x) => x.prosecdef).map((x) => x.sig).sort()).toEqual(DEFINER_ALLOWLIST);
  });

  it("uygulamaya eklenmemiş kullanıcı hiçbir görünümde veri görmez", async () => {
    const views = await sql<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'v' order by 1`,
    );
    for (const { relname } of views) {
      const rows = await query(outsider, `select * from public.${relname}`);
      if (["v_financial_summary", "v_batch_summary"].includes(relname)) {
        expect(rows.every((r) => onlyEmpty(r)), relname).toBe(true);
      } else {
        expect(rows, relname).toEqual([]);
      }
    }
  });

  it("rapor fonksiyonları üye olmayana veri döndürmez; listede olmayan yeni fonksiyon testi kırar", async () => {
    const invoker = (
      await sql<{ proname: string }>(
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and not p.prosecdef and p.proname <> 'today_tr' order by 1`,
      )
    ).map((r) => r.proname);
    expect(invoker).toEqual(Object.keys(READ_RPCS).sort());
    for (const [name, text] of Object.entries(READ_RPCS)) {
      const rows = await query(outsider, text);
      if (text.includes(" as r")) expect(onlyEmpty(rows[0]?.r), name).toBe(true);
      else expect(rows, name).toEqual([]);
    }
    // Yönetici aynı fonksiyonla veri görür (boş geçişi önler).
    expect((await query(admin, READ_RPCS.material_monthly_flows)).length).toBeGreaterThan(0);
  });
});
