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
