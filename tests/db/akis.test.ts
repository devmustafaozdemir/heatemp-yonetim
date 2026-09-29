import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addDays,
  createUser,
  expectError,
  overview,
  pool,
  produce,
  query,
  receive,
  rpc,
  setupProduct,
  sql,
  todayTr,
  type Actor,
  type Fixture,
} from "./helpers";

let admin: Actor;

beforeAll(async () => {
  admin = await createUser("admin");
});

afterAll(async () => {
  await pool.end();
});

/** 30 kg tel (10 USD/kg) + 200 termostat (80 TRY/adet), kur 40 → birim maliyet 180 TRY / 4,5 USD */
async function stockMaterials(f: Fixture, telKg = 30, termostat = 200) {
  await receive(f.admin, f.materials[0].id, telKg, "kg", 10, "USD", f.fxId);
  await receive(f.admin, f.materials[1].id, termostat, "adet", 80, "TRY", f.fxId);
}

describe("Birim normalizasyonu ve hammadde girişi", () => {
  it("kg girişini gram olarak saklar, ortalama maliyeti TRY ve USD olarak tutar", async () => {
    const f = await setupProduct(admin);
    await stockMaterials(f);
    const [tel] = await sql("select * from public.v_materials where id = $1", [f.materials[0].id]);
    expect(Number(tel.qty)).toBe(30000); // gram
    expect(tel.base_unit).toBe("g");
    expect(Number(tel.qty_display)).toBe(30); // kg
    expect(Number(tel.value_usd)).toBe(300);
    expect(Number(tel.value_try)).toBe(12000);
    expect(Number(tel.avg_cost_try_display)).toBeCloseTo(400, 6); // TL / kg

    const [bom] = await sql("select qty_per_unit from public.bom_items where material_id = $1", [f.materials[0].id]);
    expect(Number(bom.qty_per_unit)).toBe(250);

    await expectError(
      query(admin, "insert into public.bom_items (variant_id, material_id, entry_qty, entry_unit) values ($1, $2, 1, 'm')", [
        f.variantId,
        f.materials[1].id,
      ]),
      /Birim uyumsuz/,
    );
  });

  it("simülasyon stok düşürmez; eksik stoğu ve maksimum üretilebilir adedi hesaplar", async () => {
    const f = await setupProduct(admin);
    await stockMaterials(f, 5, 200); // 5 kg tel → en fazla 20 adet
    const sim = await rpc<Record<string, unknown>>(admin, "simulate_production", {
      p_variant_id: f.variantId,
      p_quantity: 30,
    });
    expect(sim.max_producible).toBe(20);
    expect(sim.can_start).toBe(false);
    expect(Number(sim.unit_cost_try)).toBeCloseTo(180, 4);
    expect(Number(sim.unit_cost_usd)).toBeCloseTo(4.5, 4);
    expect(Number(sim.estimated_minutes)).toBe(360); // 12 dk × 30
    const [tel] = await sql("select qty from public.material_balances where material_id = $1", [f.materials[0].id]);
    expect(Number(tel.qty)).toBe(5000);

    await expectError(
      rpc(admin, "start_production", { p_variant_id: f.variantId, p_quantity: 30, p_fx_rate_id: f.fxId }),
      /Yetersiz hammadde: Rezistans teli \(gerekli 7,5 kg, mevcut 5 kg\)/,
    );
  });
});

describe("Uçtan uca senaryo: üretim → teslimat → satış", () => {
  it("100 üret, 80 teslim et, 30 sat", async () => {
    const f = await setupProduct(admin);
    await stockMaterials(f);

    const batchId = await produce(f, 100);
    let o = await overview(f.variantId);
    expect(o).toMatchObject({ produced: 100, heatemp: 100, mekonsis: 0, sold: 0, revenueTry: 0, profitTry: 0 });

    const [batch] = await sql("select * from public.production_batches where id = $1", [batchId]);
    expect(batch.status).toBe("completed");
    expect(batch.batch_no).toMatch(/^PRT-\d{4}-\d{5}$/);
    expect(Number(batch.unit_cost_try)).toBeCloseTo(180, 6);
    expect(Number(batch.unit_cost_usd)).toBeCloseTo(4.5, 6);
    expect(Number(batch.total_cost_try)).toBeCloseTo(18000, 6);
    expect(Number(batch.fx_rate)).toBe(40);
    expect(Number(batch.estimated_minutes)).toBe(1200);

    // Teslimat: satış değildir
    await rpc(admin, "deliver_to_mekonsis", { p_variant_id: f.variantId, p_quantity: 80 });
    o = await overview(f.variantId);
    expect(o).toMatchObject({ heatemp: 20, mekonsis: 80, sold: 0, delivered: 80, revenueTry: 0, cogsTry: 0, profitTry: 0 });
    expect(o.heatempValueTry).toBeCloseTo(20 * 180, 4);
    expect(o.mekonsisValueTry).toBeCloseTo(80 * 180, 4); // Mekonsis'teki stok Heatemp varlığıdır
    const salesBefore = await sql("select count(*)::int as n from public.sale_items where variant_id = $1", [f.variantId]);
    expect(salesBefore[0].n).toBe(0);

    // Mekonsis satışı: ciro ve kâr yalnızca şimdi oluşur
    const saleId = await rpc<string>(admin, "record_sale", {
      p_sold_on: await todayTr(),
      p_currency: "USD",
      p_fx_rate_id: f.fxId,
      p_items: [{ variant_id: f.variantId, quantity: 30, unit_price: 50 }],
    });
    o = await overview(f.variantId);
    expect(o).toMatchObject({ heatemp: 20, mekonsis: 50, sold: 30, remaining: 70 });
    expect(o.revenueTry).toBeCloseTo(30 * 50 * 40, 4); // 60.000 TL
    expect(o.cogsTry).toBeCloseTo(30 * 180, 4); // 5.400 TL
    expect(o.profitTry).toBeCloseTo(60000 - 5400, 4);

    const [sale] = await sql("select * from public.sales where id = $1", [saleId]);
    expect(Number(sale.total_amount)).toBe(1500); // USD
    expect(Number(sale.revenue_usd)).toBe(1500);
    expect(Number(sale.revenue_try)).toBe(60000);
    expect(Number(sale.gross_profit_try)).toBeCloseTo(54600, 4);

    // Stok durumu: kalan 70 ≥ hedef 40
    expect(o.status).toBe("ok");
  });

  it("farklı maliyetli iki partiden 120 adet satışta FIFO tahsis eder", async () => {
    const f = await setupProduct(admin);
    await stockMaterials(f);
    const batchA = await produce(f, 100); // 180 TL/adet
    // Tel fiyatı artıyor: 30 kg × 14 USD
    await receive(admin, f.materials[0].id, 30, "kg", 14, "USD", f.fxId);
    const batchB = await produce(f, 100);

    const [b] = await sql("select unit_cost_try, unit_cost_usd from public.production_batches where id = $1", [batchB]);
    // Tel ort.: (2000 + 16800) / 35000 g = 0,53714 TL/g → 250 g = 134,2857 + termostat 80
    const unitB = (250 * (2000 + 16800)) / 35000 + 80;
    expect(Number(b.unit_cost_try)).toBeCloseTo(unitB, 4);

    // Son iki parti arasındaki USD birim maliyet değişimi
    const unitBUsd = (250 * (50 + 420)) / 35000 + 2;
    const o0 = await overview(f.variantId);
    expect(o0.costChangePct).toBeCloseTo(((unitBUsd - 4.5) / 4.5) * 100, 1);
    expect(Number(b.unit_cost_usd)).toBeCloseTo(unitBUsd, 4);

    await rpc(admin, "deliver_to_mekonsis", { p_variant_id: f.variantId, p_quantity: 200 });
    const saleId = await rpc<string>(admin, "record_sale", {
      p_sold_on: await todayTr(),
      p_currency: "TRY",
      p_fx_rate_id: f.fxId,
      p_items: [{ variant_id: f.variantId, quantity: 120, unit_price: 400 }],
    });

    const allocs = await sql(
      "select batch_id, quantity, unit_cost_try from public.sale_allocations where sale_id = $1 order by id",
      [saleId],
    );
    expect(allocs.map((a) => [a.batch_id, a.quantity])).toEqual([
      [batchA, 100],
      [batchB, 20],
    ]);
    const [sale] = await sql("select * from public.sales where id = $1", [saleId]);
    const expectedCogs = 100 * 180 + 20 * unitB;
    expect(Number(sale.cogs_try)).toBeCloseTo(expectedCogs, 3);
    expect(Number(sale.revenue_try)).toBe(48000);
    expect(Number(sale.revenue_usd)).toBe(1200); // bilgi amaçlı: 48.000 / 40
    expect(Number(sale.gross_profit_try)).toBeCloseTo(48000 - expectedCogs, 3);

    const o = await overview(f.variantId);
    expect(o).toMatchObject({ produced: 200, heatemp: 0, mekonsis: 80, sold: 120 });
    expect(o.mekonsisValueTry).toBeCloseTo(80 * unitB, 3);
  });

  it("belirli bir partiden teslimat parti kimliğini korur", async () => {
    const f = await setupProduct(admin);
    await stockMaterials(f, 30, 200);
    await produce(f, 40);
    const batch2 = await produce(f, 40);
    await rpc(admin, "deliver_to_mekonsis", { p_variant_id: f.variantId, p_quantity: 30, p_batch_id: batch2 });
    const shelf = await sql("select batch_id, delivered_qty, qty_remaining from public.v_mekonsis_shelf where variant_id = $1", [
      f.variantId,
    ]);
    expect(shelf).toEqual([{ batch_id: batch2, delivered_qty: 30, qty_remaining: 30 }]);
    await expectError(
      rpc(admin, "deliver_to_mekonsis", { p_variant_id: f.variantId, p_quantity: 11, p_batch_id: batch2 }),
      /Heatemp rafında yeterli stok yok/,
    );
  });
});

describe("Stok ve durum kuralları", () => {
  it("Heatemp stoğundan fazla teslimat ve Mekonsis stoğundan fazla satış reddedilir", async () => {
    const f = await setupProduct(admin);
    await stockMaterials(f);
    await produce(f, 10);
    await expectError(
      rpc(admin, "deliver_to_mekonsis", { p_variant_id: f.variantId, p_quantity: 11 }),
      /Heatemp rafında yeterli stok yok: .* mevcut 10 adet, teslim edilmek istenen 11 adet/,
    );
    await rpc(admin, "deliver_to_mekonsis", { p_variant_id: f.variantId, p_quantity: 10 });
    await expectError(
      rpc(admin, "record_sale", {
        p_sold_on: await todayTr(),
        p_currency: "USD",
        p_fx_rate_id: f.fxId,
        p_items: [{ variant_id: f.variantId, quantity: 11, unit_price: 50 }],
      }),
      /Mekonsis rafında yeterli stok yok: .* mevcut 10 adet, satılmak istenen 11 adet/,
    );
    // Teslimattan önceki tarihli satış bu teslimattaki ürünü kullanamaz
    const yesterday = await addDays(await todayTr(), -1);
    const manualFx = await rpc<number>(admin, "add_manual_fx_rate", { p_rate: 39.5, p_rate_date: yesterday });
    await expectError(
      rpc(admin, "record_sale", {
        p_sold_on: yesterday,
        p_currency: "USD",
        p_fx_rate_id: manualFx,
        p_items: [{ variant_id: f.variantId, quantity: 5, unit_price: 50 }],
      }),
      /Satış tarihi .* itibarıyla Mekonsis rafında yeterli stok yok/,
    );
  });

  it("tamamlanan parti tekrar tamamlanamaz, iptal edilemez", async () => {
    const f = await setupProduct(admin);
    await stockMaterials(f);
    const batchId = await produce(f, 5);
    await expectError(rpc(admin, "complete_production", { p_batch_id: batchId }), /zaten tamamlanmış/);
    await expectError(rpc(admin, "cancel_production", { p_batch_id: batchId }), /tamamlanan parti iptal edilemez/);
    const o = await overview(f.variantId);
    expect(o.heatemp).toBe(5);
  });

  it("iptal, tüketilen malzemeyi tam bir kez aynı maliyetle iade eder (eş zamanlı çift iptal dahil)", async () => {
    const f = await setupProduct(admin);
    await stockMaterials(f);
    const before = await sql("select material_id, qty, value_try, value_usd from public.material_balances where material_id = any($1) order by material_id", [
      f.materials.map((m) => m.id),
    ]);
    const batchId = await produce(f, 40, false);
    const during = await sql("select qty from public.material_balances where material_id = $1", [f.materials[0].id]);
    expect(Number(during[0].qty)).toBe(30000 - 40 * 250);

    const results = await Promise.allSettled([
      rpc(admin, "cancel_production", { p_batch_id: batchId, p_reason: "test" }),
      rpc(admin, "cancel_production", { p_batch_id: batchId, p_reason: "test" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason.message)).toMatch(/zaten iptal edilmiş/);

    await expectError(rpc(admin, "cancel_production", { p_batch_id: batchId }), /zaten iptal edilmiş/);
    await expectError(rpc(admin, "complete_production", { p_batch_id: batchId }), /iptal edilmiş; tamamlanamaz/);

    const after = await sql("select material_id, qty, value_try, value_usd from public.material_balances where material_id = any($1) order by material_id", [
      f.materials.map((m) => m.id),
    ]);
    expect(after).toEqual(before);
    const returns = await sql("select count(*)::int as n from public.material_movements where batch_id = $1 and movement_type = 'production_return'", [
      batchId,
    ]);
    expect(returns[0].n).toBe(2); // iki malzeme, her biri bir kez
    const o = await overview(f.variantId);
    expect(o).toMatchObject({ produced: 0, heatemp: 0, spendTry: 0 });
  });

  it("satış iptali tahsisleri bir kez geri verir", async () => {
    const f = await setupProduct(admin);
    await stockMaterials(f);
    await produce(f, 20);
    await rpc(admin, "deliver_to_mekonsis", { p_variant_id: f.variantId, p_quantity: 20 });
    const saleId = await rpc<string>(admin, "record_sale", {
      p_sold_on: await todayTr(),
      p_currency: "USD",
      p_fx_rate_id: f.fxId,
      p_items: [{ variant_id: f.variantId, quantity: 15, unit_price: 50 }],
    });
    await expectError(rpc(admin, "cancel_sale", { p_sale_id: saleId, p_reason: " " }), /gerekçe/);
    await rpc(admin, "cancel_sale", { p_sale_id: saleId, p_reason: "Hatalı giriş" });
    await expectError(rpc(admin, "cancel_sale", { p_sale_id: saleId, p_reason: "Tekrar" }), /zaten iptal edilmiş/);
    const o = await overview(f.variantId);
    expect(o).toMatchObject({ mekonsis: 20, sold: 0, revenueTry: 0, profitTry: 0 });
  });

  it("satış yapılmamış teslimat geri alınabilir, satış yapılmış olan alınamaz", async () => {
    const f = await setupProduct(admin);
    await stockMaterials(f);
    await produce(f, 20);
    const d1 = await rpc<string>(admin, "deliver_to_mekonsis", { p_variant_id: f.variantId, p_quantity: 5 });
    const d2 = await rpc<string>(admin, "deliver_to_mekonsis", { p_variant_id: f.variantId, p_quantity: 5 });
    await rpc(admin, "record_sale", {
      p_sold_on: await todayTr(),
      p_currency: "USD",
      p_fx_rate_id: f.fxId,
      p_items: [{ variant_id: f.variantId, quantity: 3, unit_price: 50 }],
    });
    await expectError(rpc(admin, "cancel_delivery", { p_delivery_id: d1, p_reason: "x" }), /satış yapılmış; geri alınamaz/);
    await rpc(admin, "cancel_delivery", { p_delivery_id: d2, p_reason: "Yanlış adet" });
    await expectError(rpc(admin, "cancel_delivery", { p_delivery_id: d2, p_reason: "x" }), /zaten geri alınmış/);
    const o = await overview(f.variantId);
    expect(o).toMatchObject({ heatemp: 15, mekonsis: 2, sold: 3, delivered: 5 });
  });
});

describe("Eş zamanlılık ve tekrarlanan istekler", () => {
  it("eş zamanlı iki satış Mekonsis stoğunu eksiye düşüremez", async () => {
    const f = await setupProduct(admin);
    await stockMaterials(f);
    await produce(f, 50);
    await rpc(admin, "deliver_to_mekonsis", { p_variant_id: f.variantId, p_quantity: 50 });
    const today = await todayTr();
    const sell = () =>
      rpc(admin, "record_sale", {
        p_sold_on: today,
        p_currency: "USD",
        p_fx_rate_id: f.fxId,
        p_items: [{ variant_id: f.variantId, quantity: 40, unit_price: 50 }],
      });
    const results = await Promise.allSettled([sell(), sell()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason.message)).toMatch(/Mekonsis rafında yeterli stok yok/);
    const o = await overview(f.variantId);
    expect(o).toMatchObject({ mekonsis: 10, sold: 40 });

    // Daha yoğun: 6 eş zamanlı 4'er adetlik satış, kalan 10 → en fazla 2 başarılı
    const many = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        rpc(admin, "record_sale", {
          p_sold_on: today,
          p_currency: "TRY",
          p_fx_rate_id: f.fxId,
          p_items: [{ variant_id: f.variantId, quantity: 4, unit_price: 2000 }],
        }),
      ),
    );
    expect(many.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    const o2 = await overview(f.variantId);
    expect(o2).toMatchObject({ mekonsis: 2, sold: 48 });
    const [neg] = await sql("select count(*)::int as n from public.stock_layers where qty_out > qty_in");
    expect(neg.n).toBe(0);
  });

  it("eş zamanlı üretim başlatma aynı hammaddeyi iki kez tüketemez", async () => {
    const f = await setupProduct(admin);
    await stockMaterials(f, 25, 100); // tam 100 adetlik malzeme
    const start = () =>
      rpc(admin, "start_production", { p_variant_id: f.variantId, p_quantity: 60, p_fx_rate_id: f.fxId });
    const results = await Promise.allSettled([start(), start()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [bal] = await sql("select qty from public.material_balances where material_id = $1", [f.materials[0].id]);
    expect(Number(bal.qty)).toBe(25000 - 60 * 250);
  });

  it("aynı istek kimliğiyle tekrarlanan satış tek kayıt oluşturur", async () => {
    const f = await setupProduct(admin);
    await stockMaterials(f);
    await produce(f, 10);
    await rpc(admin, "deliver_to_mekonsis", { p_variant_id: f.variantId, p_quantity: 10 });
    const requestId = crypto.randomUUID();
    const today = await todayTr();
    const call = () =>
      rpc<string>(admin, "record_sale", {
        p_sold_on: today,
        p_currency: "USD",
        p_fx_rate_id: f.fxId,
        p_items: [{ variant_id: f.variantId, quantity: 6, unit_price: 50 }],
        p_request_id: requestId,
      });
    const [a, b] = await Promise.all([call(), call()]);
    const c = await call();
    expect(a).toBe(b);
    expect(b).toBe(c);
    const o = await overview(f.variantId);
    expect(o).toMatchObject({ mekonsis: 4, sold: 6 });

    const batchReq = crypto.randomUUID();
    const s1 = await rpc<string>(admin, "start_production", {
      p_variant_id: f.variantId,
      p_quantity: 2,
      p_fx_rate_id: f.fxId,
      p_request_id: batchReq,
    });
    const s2 = await rpc<string>(admin, "start_production", {
      p_variant_id: f.variantId,
      p_quantity: 2,
      p_fx_rate_id: f.fxId,
      p_request_id: batchReq,
    });
    expect(s1).toBe(s2);
  });
});

describe("Kur kuralları", () => {
  it("eski veya işlem tarihinden sonraki kur reddedilir; manuel kur kullanılabilir", async () => {
    const f = await setupProduct(admin);
    const today = await todayTr();
    const old = await rpc<number>(admin, "add_manual_fx_rate", { p_rate: 30, p_rate_date: await addDays(today, -10) });
    await expectError(
      receive(admin, f.materials[0].id, 1, "kg", 10, "USD", old),
      /Kur çok eski: .* tarihli kur/,
    );
    const lastWeek = await addDays(today, -7);
    await expectError(
      rpc(admin, "receive_material", {
        p_material_id: f.materials[0].id,
        p_qty: 1,
        p_unit: "kg",
        p_unit_price: 10,
        p_currency: "USD",
        p_fx_rate_id: f.fxId,
        p_received_on: lastWeek,
      }),
      /işlem tarihinden .* sonra olamaz/,
    );
    const manual = await rpc<number>(admin, "add_manual_fx_rate", { p_rate: 35.25, p_rate_date: lastWeek });
    await rpc(admin, "receive_material", {
      p_material_id: f.materials[0].id,
      p_qty: 1,
      p_unit: "kg",
      p_unit_price: 10,
      p_currency: "USD",
      p_fx_rate_id: manual,
      p_received_on: lastWeek,
    });
    const [m] = await sql("select value_try, fx_rate from public.material_movements where material_id = $1", [f.materials[0].id]);
    expect(Number(m.value_try)).toBe(352.5);
    expect(Number(m.fx_rate)).toBe(35.25);

    // Önerilen kur: işlem tarihine en yakın geçmiş kur, geçerlilik bilgisiyle
    const [suggested] = await query(admin, "select * from public.fx_rate_for_date($1)", [lastWeek]);
    expect(Number(suggested.rate)).toBe(35.25);
    expect(suggested.is_valid).toBe(true);

    await expectError(rpc(admin, "add_manual_fx_rate", { p_rate: 0, p_rate_date: today }), /sıfırdan büyük/);
    await expectError(
      rpc(admin, "add_manual_fx_rate", { p_rate: 40, p_rate_date: await addDays(today, 1) }),
      /Gelecek tarihli kur/,
    );
  });
});

describe("Kurumsal teklif", () => {
  it("teklif stok düşürmez; satışa dönüştürme bir kez çalışır", async () => {
    const f = await setupProduct(admin);
    await stockMaterials(f);
    await produce(f, 30);
    await rpc(admin, "deliver_to_mekonsis", { p_variant_id: f.variantId, p_quantity: 30 });
    const [customer] = await query<{ id: string }>(admin, "insert into public.customers (name) values ($1) returning id", [
      `Firma ${crypto.randomUUID()}`,
    ]);
    const [quote] = await query<{ id: string; quote_no: string }>(
      admin,
      "insert into public.quotes (customer_id, currency) values ($1, 'USD') returning id, quote_no",
      [customer.id],
    );
    expect(quote.quote_no).toMatch(/^TKL-/);
    await query(admin, "insert into public.quote_items (quote_id, variant_id, quantity, unit_price) values ($1, $2, 25, 45)", [
      quote.id,
      f.variantId,
    ]);

    const est = await rpc<Record<string, unknown>>(admin, "quote_estimate", { p_quote_id: quote.id });
    expect(Number(est.revenue_try)).toBe(25 * 45 * 40);
    expect(Number(est.cost_try)).toBeCloseTo(25 * 180, 4);
    expect(Number(est.gross_profit_try)).toBeCloseTo(45000 - 4500, 4);
    expect(Number(est.margin_pct)).toBe(90);
    const line = (est.lines as Record<string, unknown>[])[0];
    expect(Number(line.discount_pct)).toBe(10); // liste 50 USD → 45 USD
    let o = await overview(f.variantId);
    expect(o).toMatchObject({ mekonsis: 30, sold: 0 });

    const today = await todayTr();
    const convert = (req: string) =>
      rpc<string>(admin, "convert_quote_to_sale", {
        p_quote_id: quote.id,
        p_sold_on: today,
        p_fx_rate_id: f.fxId,
        p_request_id: req,
      });
    const [s1, s2] = await Promise.all([convert(crypto.randomUUID()), convert(crypto.randomUUID())]);
    expect(s1).toBe(s2);
    const s3 = await convert(crypto.randomUUID());
    expect(s3).toBe(s1);
    const sales = await sql("select count(*)::int as n from public.sales where quote_id = $1", [quote.id]);
    expect(sales[0].n).toBe(1);
    o = await overview(f.variantId);
    expect(o).toMatchObject({ mekonsis: 5, sold: 25 });

    await expectError(
      query(admin, "update public.quote_items set quantity = 1 where quote_id = $1", [quote.id]),
      /Yalnızca açık teklifin/,
    );
    await expectError(
      query(admin, "update public.quotes set status = 'open' where id = $1", [quote.id]),
      /dönüştürülmüş teklif değiştirilemez/,
    );

    // Satış iptal edilirse teklif yeniden açılır
    await rpc(admin, "cancel_sale", { p_sale_id: s1, p_reason: "Müşteri vazgeçti" });
    const [reopened] = await sql("select status, sale_id from public.quotes where id = $1", [quote.id]);
    expect(reopened).toEqual({ status: "open", sale_id: null });
  });

  it("dönüştürmede stok yeniden kontrol edilir", async () => {
    const f = await setupProduct(admin);
    await stockMaterials(f);
    await produce(f, 10);
    await rpc(admin, "deliver_to_mekonsis", { p_variant_id: f.variantId, p_quantity: 10 });
    const [customer] = await query<{ id: string }>(admin, "insert into public.customers (name) values ($1) returning id", [
      `Firma ${crypto.randomUUID()}`,
    ]);
    const [quote] = await query<{ id: string }>(
      admin,
      "insert into public.quotes (customer_id, currency) values ($1, 'TRY') returning id",
      [customer.id],
    );
    await query(admin, "insert into public.quote_items (quote_id, variant_id, quantity, unit_price) values ($1, $2, 8, 1900)", [
      quote.id,
      f.variantId,
    ]);
    await rpc(admin, "record_sale", {
      p_sold_on: await todayTr(),
      p_currency: "TRY",
      p_fx_rate_id: f.fxId,
      p_items: [{ variant_id: f.variantId, quantity: 5, unit_price: 2000 }],
    });
    await expectError(
      rpc(admin, "convert_quote_to_sale", { p_quote_id: quote.id, p_sold_on: await todayTr(), p_fx_rate_id: f.fxId }),
      /Mekonsis rafında yeterli stok yok/,
    );
    const [q] = await sql("select status from public.quotes where id = $1", [quote.id]);
    expect(q.status).toBe("open");
  });
});

describe("Açılış stoğu (sistem öncesi mamul)", () => {
  it("açılış partisi hammadde tüketmez, üretim sayılmaz ve FIFO'da önce tüketilir", async () => {
    const f = await setupProduct(admin);
    await stockMaterials(f);
    const today = await todayTr();
    await expectError(
      rpc(admin, "record_opening_stock", {
        p_variant_id: f.variantId,
        p_quantity: 30,
        p_unit_cost: 3,
        p_currency: "USD",
        p_fx_rate_id: f.fxId,
        p_stock_date: today,
      }),
      /kaynak\/açıklama yazılmalıdır/,
    );
    const openingId = await rpc<string>(admin, "record_opening_stock", {
      p_variant_id: f.variantId,
      p_quantity: 30,
      p_unit_cost: 3,
      p_currency: "USD",
      p_fx_rate_id: f.fxId,
      p_stock_date: today,
      p_note: "Excel sayımı",
    });
    const [ob] = await sql("select batch_no, kind, unit_cost_try from public.production_batches where id = $1", [openingId]);
    expect(ob.batch_no).toMatch(/^ACL-/);
    expect(ob.kind).toBe("opening");
    expect(Number(ob.unit_cost_try)).toBe(120);
    const [tel] = await sql("select qty from public.material_balances where material_id = $1", [f.materials[0].id]);
    expect(Number(tel.qty)).toBe(30000); // hammadde tüketilmedi

    await produce(f, 20); // 180 TL/adet
    await rpc(admin, "deliver_to_mekonsis", { p_variant_id: f.variantId, p_quantity: 50 });
    const saleId = await rpc<string>(admin, "record_sale", {
      p_sold_on: today,
      p_currency: "USD",
      p_fx_rate_id: f.fxId,
      p_items: [{ variant_id: f.variantId, quantity: 40, unit_price: 50 }],
    });
    const allocs = await sql("select batch_id, quantity from public.sale_allocations where sale_id = $1 order by id", [saleId]);
    expect(allocs[0]).toEqual({ batch_id: openingId, quantity: 30 });
    expect(allocs[1].quantity).toBe(10);
    const [sale] = await sql("select cogs_try from public.sales where id = $1", [saleId]);
    expect(Number(sale.cogs_try)).toBeCloseTo(30 * 120 + 10 * 180, 4);

    const [o] = await sql("select produced_qty, opening_qty, opening_value_try, production_spend_try, unit_cost_usd_change_pct from public.v_variant_overview where variant_id = $1", [f.variantId]);
    expect(o.produced_qty).toBe(20);
    expect(o.opening_qty).toBe(30);
    expect(Number(o.opening_value_try)).toBe(3600);
    expect(Number(o.production_spend_try)).toBeCloseTo(3600, 4); // yalnızca 20 × 180
    expect(o.unit_cost_usd_change_pct).toBeNull(); // açılış partisiyle kıyaslanmaz
  });
});

describe("Tutarlılık", () => {
  it("defter bakiyeleri hareketlerle tutarlı; Kasa mutabakatı sağlanır", async () => {
    const rows = await query(admin, "select * from public.ledger_inconsistencies()");
    expect(rows).toEqual([]);

    const [k] = await query(admin, "select * from public.v_financial_summary");
    const spend = Number(k.production_spend_try) + Number(k.opening_value_try);
    const accounted =
      Number(k.cogs_try) + Number(k.heatemp_value_try) + Number(k.mekonsis_value_try) + Number(k.wip_value_try);
    expect(Math.abs(spend - accounted)).toBeLessThan(0.05);

    // Dashboard ve Kasa aynı kaynaktan: toplam ciro satış kayıtlarıyla eşleşir
    const [s] = await sql("select coalesce(sum(revenue_try), 0) as r from public.sales where status = 'completed'");
    expect(Number(k.revenue_try)).toBeCloseTo(Number(s.r), 4);
  });
});

describe("Tedarikçiler", () => {
  it("alışta seçilen tedarikçi listede toplanır; ad değişince hareketlerdeki ad güncellenir", async () => {
    const f = await setupProduct(admin);
    const tag = Math.random().toString(36).slice(2, 8);
    const [sup] = await query(f.admin, "insert into public.suppliers (name) values ($1) returning id", [`Tel ${tag}`]);
    const buy = await rpc<number>(f.admin, "receive_material", {
      p_material_id: f.materials[0].id,
      p_qty: 10,
      p_unit: "kg",
      p_unit_price: 5,
      p_currency: "USD",
      p_fx_rate_id: f.fxId,
      p_supplier_id: sup.id,
    });
    const [row] = await query(f.admin, "select * from public.v_supplier_list where id = $1", [sup.id]);
    expect(Number(row.purchase_count)).toBe(1);
    expect(Number(row.total_usd)).toBeCloseTo(50, 2);
    await query(f.admin, "update public.suppliers set name = $2 where id = $1", [sup.id, `Tel Sanayi ${tag}`]);
    const [m] = await sql("select supplier, supplier_id from public.material_movements where id = $1", [buy]);
    expect(m.supplier).toBe(`Tel Sanayi ${tag}`);
    expect(m.supplier_id).toBe(sup.id);
    await expectError(
      query(f.admin, "insert into public.suppliers (name) values ($1)", [`tel sanayi ${tag}`.toUpperCase()]),
      /suppliers_name_unique/,
    );
  });

  it("görüntüleyici tedarikçi ekleyemez", async () => {
    const viewer = await createUser("viewer");
    await expectError(query(viewer, "insert into public.suppliers (name) values ('X')"), /row-level security/);
  });
});

describe("Alış KDV'si ve stok seyri", () => {
  it("KDV oranı malzemeden gelir, tutar hesaplanır veya elle girilir; KDV maliyete girmez", async () => {
    const f = await setupProduct(admin);
    const a = await rpc<number>(f.admin, "receive_material", {
      p_material_id: f.materials[0].id,
      p_qty: 10,
      p_unit: "kg",
      p_unit_price: 5,
      p_currency: "USD",
      p_fx_rate_id: f.fxId,
    });
    const b = await rpc<number>(f.admin, "receive_material", {
      p_material_id: f.materials[0].id,
      p_qty: 10,
      p_unit: "kg",
      p_unit_price: 5,
      p_currency: "USD",
      p_fx_rate_id: f.fxId,
      p_vat_rate: 10,
      p_vat_amount: 4.99,
    });
    const rows = await sql("select id, vat_rate, vat_amount, value_usd from public.material_movements where id = any($1) order by id", [[a, b]]);
    expect(Number(rows[0].vat_rate)).toBe(20);
    expect(Number(rows[0].vat_amount)).toBeCloseTo(10, 4);
    expect(Number(rows[1].vat_rate)).toBe(10);
    expect(Number(rows[1].vat_amount)).toBeCloseTo(4.99, 4);
    expect(Number(rows[0].value_usd)).toBeCloseTo(50, 4);

    const flows = await query(f.admin, "select * from public.material_flows($1, 'gun', null)", [f.materials[0].id]);
    expect(flows).toHaveLength(1);
    expect(Number(flows[0].in_qty)).toBe(20000);
    const years = await query(f.admin, "select * from public.material_flows($1, 'yil', null)", [f.materials[0].id]);
    expect(String(years[0].bucket).slice(5, 10) === "01-01" || new Date(years[0].bucket).getMonth() === 0).toBe(true);
  });
});

describe("Hammadde alışı düzenleme / hareket silme", () => {
  it("alışı yerinde günceller; ters kayıt eklenmez, sonraki bakiyeler ve defter tutarlı kalır", async () => {
    const f = await setupProduct(admin);
    const wrong = await receive(f.admin, f.materials[0].id, 30, "kg", 10, "USD", f.fxId);
    const later = await receive(f.admin, f.materials[0].id, 5, "kg", 10, "USD", f.fxId);
    const id = await rpc<number>(f.admin, "update_material_purchase", {
      p_movement_id: wrong,
      p_qty: 20,
      p_unit: "kg",
      p_unit_price: 12,
      p_currency: "USD",
      p_fx_rate_id: f.fxId,
      p_received_on: null,
    });
    expect(Number(id)).toBe(Number(wrong));
    const [tel] = await sql("select * from public.v_materials where id = $1", [f.materials[0].id]);
    expect(Number(tel.qty)).toBe(25000);
    expect(Number(tel.value_usd)).toBeCloseTo(290, 4);
    const rows = await sql(
      "select id, qty, balance_qty_after, corrected_at from public.material_movements where material_id = $1 order by id",
      [f.materials[0].id],
    );
    expect(rows).toHaveLength(2);
    expect(Number(rows[0].qty)).toBe(20000);
    expect(rows[0].corrected_at).not.toBeNull();
    expect(Number(rows[1].balance_qty_after)).toBe(25000);
    expect(await query(f.admin, "select * from public.ledger_inconsistencies()")).toEqual([]);

    await rpc(f.admin, "delete_material_movement", { p_movement_id: later });
    const [after] = await sql("select * from public.v_materials where id = $1", [f.materials[0].id]);
    expect(Number(after.qty)).toBe(20000);

    // fire kaydı da silinebilir; stok ve değer geri gelir
    const wo = await rpc<number>(f.admin, "write_off_material", {
      p_material_id: f.materials[0].id,
      p_qty: 2,
      p_unit: "kg",
      p_reason: "sayım",
    });
    await rpc(f.admin, "delete_material_movement", { p_movement_id: wo });
    const [back] = await sql("select * from public.v_materials where id = $1", [f.materials[0].id]);
    expect(Number(back.qty)).toBe(20000);
    expect(Number(back.value_usd)).toBeCloseTo(240, 4);
    expect(await query(f.admin, "select * from public.ledger_inconsistencies()")).toEqual([]);
  });

  it("hareketten sonra üretimde kullanılan malzemenin alışı değiştirilemez ve silinemez", async () => {
    const f = await setupProduct(admin);
    const tel = await receive(f.admin, f.materials[0].id, 30, "kg", 10, "USD", f.fxId);
    await receive(f.admin, f.materials[1].id, 200, "adet", 80, "TRY", f.fxId);
    await produce(f, 10);
    await expectError(rpc(f.admin, "delete_material_movement", { p_movement_id: tel }), /üretimde kullanıldı veya fire yazıldı/);
    await expectError(
      rpc(f.admin, "update_material_purchase", {
        p_movement_id: tel,
        p_qty: 40,
        p_unit: "kg",
        p_unit_price: 10,
        p_currency: "USD",
        p_fx_rate_id: f.fxId,
        p_received_on: null,
      }),
      /üretimde kullanıldı veya fire yazıldı/,
    );
  });

  it("görüntüleyici hareket silemez", async () => {
    const f = await setupProduct(admin);
    const viewer = await createUser("viewer");
    const tel = await receive(f.admin, f.materials[0].id, 5, "kg", 10, "USD", f.fxId);
    await expectError(rpc(viewer, "delete_material_movement", { p_movement_id: tel }), /yönetici yetkisi/);
  });
});
