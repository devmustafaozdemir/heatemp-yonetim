import { randomUUID } from "node:crypto";
import pg from "pg";

// Supabase CLI yerel veritabanı varsayılanı; DATABASE_URL ile değiştirilebilir.
export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// numeric sütunları metin olarak alıp testte Number'a çeviriyoruz.
export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 12 });

export type Role = "anon" | "authenticated" | "service_role";

export interface Actor {
  role: Role;
  userId?: string;
}

/** PostgREST'in yaptığı gibi: tek transaction, rol + JWT claim'leri ayarlı. */
export async function as<T>(actor: Actor, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const claims = JSON.stringify({ sub: actor.userId ?? null, role: actor.role });
    await client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    // Eski auth.uid() tanımları yalnızca bu ayarı okur (yalın supabase/postgres imajı).
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actor.userId ?? ""]);
    await client.query(`set local role ${actor.role}`);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Tek bir RPC çağrısı (kendi transaction'ı içinde). */
export async function rpc<T = unknown>(actor: Actor, fn: string, args: Record<string, unknown>): Promise<T> {
  const names = Object.keys(args);
  const params = names.map((n, i) => `${n} => $${i + 1}`).join(", ");
  const values = names.map((n) => {
    const v = args[n];
    return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
  });
  return as(actor, async (c) => {
    const r = await c.query(`select public.${fn}(${params}) as result`, values);
    return r.rows[0].result as T;
  });
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  actor: Actor,
  sql: string,
  values: unknown[] = [],
): Promise<T[]> {
  return as(actor, async (c) => (await c.query<T>(sql, values)).rows);
}

/** Süper kullanıcı (postgres) olarak doğrudan sorgu — yalnızca test kurulumu için. */
export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values: unknown[] = []) {
  return (await pool.query<T>(text, values)).rows;
}

export async function createUser(role: "admin" | "viewer" | null): Promise<Actor> {
  const id = randomUUID();
  await sql("insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')", [
    id,
    `test-${id}@heatemp.test`,
  ]);
  if (role) {
    await sql("insert into public.app_users (user_id, role) values ($1, $2)", [id, role]);
  }
  return { role: "authenticated", userId: id };
}

export const serviceRole: Actor = { role: "service_role" };
export const anon: Actor = { role: "anon" };

export async function todayTr(): Promise<string> {
  const rows = await sql<{ d: string }>("select public.today_tr()::text as d");
  return rows[0].d;
}

export async function addDays(date: string, days: number): Promise<string> {
  const rows = await sql<{ d: string }>("select ($1::date + $2::int)::text as d", [date, days]);
  return rows[0].d;
}

/** Bugün için TCMB kuru (testlerin hepsi aynı değeri kullanır: 40). */
export const TEST_RATE = 40;
export async function todaysFx(): Promise<number> {
  const today = await todayTr();
  const id = await rpc<string>(serviceRole, "record_auto_fx_rate", {
    p_source: "TCMB",
    p_rate_type: "ForexBuying",
    p_rate: TEST_RATE,
    p_rate_date: today,
  });
  const rows = await sql<{ rate: string }>("select rate from public.fx_rates where id = $1", [id]);
  if (Number(rows[0].rate) !== TEST_RATE) {
    throw new Error(`Bugünün test kuru ${TEST_RATE} değil (${rows[0].rate}); temiz veritabanında çalıştırın.`);
  }
  return Number(id);
}

export function uniq(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}`.toUpperCase();
}

export interface Fixture {
  admin: Actor;
  fxId: number;
  productId: string;
  variantId: string;
  materials: { id: string; code: string }[];
}

/**
 * Ürün + varyant + iki malzemelik reçete kurar.
 * Malzeme A: kütle (kg ile alınır, reçetede gram), Malzeme B: adet.
 */
export async function setupProduct(admin: Actor, opts: { name?: string } = {}): Promise<Fixture> {
  const fxId = await todaysFx();
  const code = uniq("URN");
  const [product] = await query<{ id: string }>(
    admin,
    "insert into public.products (code, name, default_sale_price, default_currency, unit_production_minutes, critical_stock, min_stock, target_stock) values ($1, $2, 50, 'USD', 12, 5, 10, 40) returning id",
    [code, opts.name ?? `Test Ürünü ${code}`],
  );
  const [variant] = await query<{ id: string }>(
    admin,
    "select id from public.product_variants where product_id = $1",
    [product.id],
  );
  const matA = uniq("HAM");
  const matB = uniq("KMP");
  const [a] = await query<{ id: string }>(
    admin,
    "insert into public.raw_materials (code, name, kind, unit_kind, display_unit) values ($1, 'Rezistans teli', 'raw', 'mass', 'kg') returning id",
    [matA],
  );
  const [b] = await query<{ id: string }>(
    admin,
    "insert into public.raw_materials (code, name, kind, unit_kind, display_unit) values ($1, 'Termostat', 'component', 'count', 'adet') returning id",
    [matB],
  );
  // 1 adet ürün = 250 g tel + 1 termostat
  await query(admin, "insert into public.bom_items (variant_id, material_id, entry_qty, entry_unit) values ($1, $2, 250, 'g')", [
    variant.id,
    a.id,
  ]);
  await query(admin, "insert into public.bom_items (variant_id, material_id, entry_qty, entry_unit) values ($1, $2, 1, 'adet')", [
    variant.id,
    b.id,
  ]);
  return {
    admin,
    fxId,
    productId: product.id,
    variantId: variant.id,
    materials: [
      { id: a.id, code: matA },
      { id: b.id, code: matB },
    ],
  };
}

export async function receive(
  admin: Actor,
  materialId: string,
  qty: number,
  unit: string,
  unitPrice: number,
  currency: "USD" | "TRY",
  fxId: number,
) {
  return rpc<number>(admin, "receive_material", {
    p_material_id: materialId,
    p_qty: qty,
    p_unit: unit,
    p_unit_price: unitPrice,
    p_currency: currency,
    p_fx_rate_id: fxId,
  });
}

export async function produce(f: Fixture, quantity: number, complete = true) {
  const batchId = await rpc<string>(f.admin, "start_production", {
    p_variant_id: f.variantId,
    p_quantity: quantity,
    p_fx_rate_id: f.fxId,
  });
  if (complete) {
    await rpc(f.admin, "complete_production", { p_batch_id: batchId });
  }
  return batchId;
}

export async function overview(variantId: string) {
  const rows = await sql("select * from public.v_variant_overview where variant_id = $1", [variantId]);
  const r = rows[0];
  const num = (k: string) => Number(r[k]);
  return {
    produced: num("produced_qty"),
    heatemp: num("heatemp_qty"),
    mekonsis: num("mekonsis_qty"),
    sold: num("sold_qty"),
    delivered: num("delivered_qty"),
    remaining: num("total_remaining"),
    revenueTry: num("revenue_try"),
    cogsTry: num("cogs_try"),
    profitTry: num("gross_profit_try"),
    heatempValueTry: num("heatemp_value_try"),
    mekonsisValueTry: num("mekonsis_value_try"),
    spendTry: num("production_spend_try"),
    wipTry: num("wip_value_try"),
    status: r.stock_status as string,
    costChangePct: r.unit_cost_usd_change_pct === null ? null : Number(r.unit_cost_usd_change_pct),
  };
}

export async function expectError(promise: Promise<unknown>, pattern: RegExp) {
  try {
    await promise;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!pattern.test(message)) {
      throw new Error(`Beklenen hata ${pattern} değil, gelen: ${message}`);
    }
    return message;
  }
  throw new Error(`Hata bekleniyordu (${pattern}) ama işlem başarılı oldu.`);
}
