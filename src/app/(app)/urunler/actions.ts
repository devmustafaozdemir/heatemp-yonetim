"use server";

import { adminAction, unwrap } from "@/lib/action";
import type { FormReader } from "@/lib/form";

const CURRENCIES = ["USD", "TRY"] as const;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

function readThresholds(form: FormReader, required: boolean) {
  const critical = form.int("critical_stock", "Kritik stok", { required, min: 0 });
  const min = form.int("min_stock", "Minimum stok", { required, min: 0 });
  const target = form.int("target_stock", "Hedef stok", { required, min: 0 });
  if (critical !== null && min !== null && critical > min) {
    form.errors.min_stock ??= "Minimum stok, kritik stoktan küçük olamaz.";
  }
  if (min !== null && target !== null && min > target) {
    form.errors.target_stock ??= "Hedef stok, minimum stoktan küçük olamaz.";
  }
  return { critical, min, target };
}

function readProduct(form: FormReader) {
  const values = {
    code: form.text("code", "Ürün kodu", { required: true, max: 40 }),
    name: form.text("name", "Ürün adı", { required: true, max: 160 }),
    description: form.text("description", "Açıklama", { max: 2000 }),
    default_sale_price: form.decimal("default_sale_price", "Varsayılan satış fiyatı", { min: 0 }),
    default_currency: form.oneOf("default_currency", "Para birimi", CURRENCIES, "USD"),
    unit_production_minutes: form.decimal("unit_production_minutes", "Birim üretim süresi", { required: true, min: 0 }),
  };
  const t = readThresholds(form, true);
  return {
    ...values,
    critical_stock: t.critical,
    min_stock: t.min,
    target_stock: t.target,
  };
}

export async function createProduct(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const values = readProduct(form);
    form.assertValid();
    const product = unwrap(await ctx.supabase.from("products").insert(values).select("id").single());
    return { message: "Ürün oluşturuldu.", redirectTo: `/urunler/${product.id}` };
  });
}

export async function updateProduct(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("id", "Ürün");
    const values = { ...readProduct(form), is_active: form.bool("is_active") };
    form.assertValid();
    unwrap(await ctx.supabase.from("products").update(values).eq("id", id!).select("id").single());
    return { message: "Ürün güncellendi." };
  });
}

export async function deleteProduct(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("id", "Ürün");
    form.assertValid();
    unwrap(await ctx.supabase.from("product_variants").delete().eq("product_id", id!));
    unwrap(await ctx.supabase.from("products").delete().eq("id", id!));
    return { message: "Ürün silindi.", redirectTo: "/urunler" };
  });
}

export async function uploadProductImage(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("id", "Ürün");
    const file = formData.get("image");
    if (!(file instanceof File) || file.size === 0) form.errors.image = "Bir görsel dosyası seçin.";
    else if (!IMAGE_TYPES[file.type]) form.errors.image = "Yalnızca PNG, JPEG veya WEBP yüklenebilir.";
    else if (file.size > MAX_IMAGE_BYTES) form.errors.image = "Görsel en fazla 5 MB olabilir.";
    form.assertValid();
    const image = file as File;
    const path = `${id}/${crypto.randomUUID()}.${IMAGE_TYPES[image.type]}`;
    const { error } = await ctx.supabase.storage
      .from("product-images")
      .upload(path, image, { contentType: image.type, upsert: false });
    if (error) throw new Error(`Görsel yüklenemedi: ${error.message}`);
    const old = unwrap(await ctx.supabase.from("products").select("image_path").eq("id", id!).single());
    unwrap(await ctx.supabase.from("products").update({ image_path: path }).eq("id", id!));
    if (old?.image_path) await ctx.supabase.storage.from("product-images").remove([old.image_path]);
    return { message: "Görsel yüklendi." };
  });
}

export async function removeProductImage(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("id", "Ürün");
    form.assertValid();
    const old = unwrap(await ctx.supabase.from("products").select("image_path").eq("id", id!).single());
    unwrap(await ctx.supabase.from("products").update({ image_path: null }).eq("id", id!));
    if (old?.image_path) await ctx.supabase.storage.from("product-images").remove([old.image_path]);
    return { message: "Görsel kaldırıldı." };
  });
}

function readVariant(form: FormReader) {
  const price = form.decimal("sale_price", "Satış fiyatı", { min: 0 });
  const currency = price === null ? null : form.oneOf("currency", "Para birimi", CURRENCIES);
  const override = form.bool("override_thresholds");
  const t = override ? readThresholds(form, true) : { critical: null, min: null, target: null };
  return {
    code: form.text("code", "Varyant kodu", { required: true, max: 40 }),
    name: form.text("name", "Varyant adı / detay", { required: true, max: 160 }),
    sale_price: price,
    currency,
    unit_production_minutes: form.decimal("unit_production_minutes", "Birim üretim süresi", { min: 0 }),
    critical_stock: t.critical,
    min_stock: t.min,
    target_stock: t.target,
  };
}

export async function createVariant(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const productId = form.id("product_id", "Ürün");
    const values = readVariant(form);
    form.assertValid();
    const v = unwrap(
      await ctx.supabase
        .from("product_variants")
        .insert({ ...values, product_id: productId })
        .select("id")
        .single(),
    );
    return { message: "Varyant eklendi.", redirectTo: `/urunler/${productId}/varyant/${v.id}` };
  });
}

export async function updateVariant(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("id", "Varyant");
    const values = { ...readVariant(form), is_active: form.bool("is_active") };
    form.assertValid();
    unwrap(await ctx.supabase.from("product_variants").update(values).eq("id", id!).select("id").single());
    return { message: "Varyant güncellendi." };
  });
}

export async function deleteVariant(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("id", "Varyant");
    const productId = form.id("product_id", "Ürün");
    form.assertValid();
    const { count } = await ctx.supabase
      .from("product_variants")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId!);
    if ((count ?? 0) <= 1) throw new Error("Ürünün son varyantı silinemez; bunun yerine ürünü pasif yapın.");
    unwrap(await ctx.supabase.from("product_variants").delete().eq("id", id!));
    return { message: "Varyant silindi.", redirectTo: `/urunler/${productId}` };
  });
}

export async function saveBomItem(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const variantId = form.id("variant_id", "Varyant");
    const materialId = form.id("material_id", "Malzeme");
    const qty = form.decimal("entry_qty", "Miktar", { required: true, positive: true });
    const unit = form.text("entry_unit", "Birim", { required: true });
    const note = form.text("note", "Not", { max: 500 });
    form.assertValid();
    unwrap(
      await ctx.supabase.from("bom_items").upsert(
        { variant_id: variantId, material_id: materialId, entry_qty: qty, entry_unit: unit, qty_per_unit: 1, note },
        { onConflict: "variant_id,material_id" },
      ),
    );
    return { message: "Reçete satırı kaydedildi." };
  });
}

export async function deleteBomItem(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("id", "Reçete satırı");
    form.assertValid();
    unwrap(await ctx.supabase.from("bom_items").delete().eq("id", id!));
    return { message: "Reçete satırı silindi." };
  });
}

export async function copyBom(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const from = form.id("from_variant_id", "Kaynak varyant");
    const to = form.id("variant_id", "Varyant");
    form.assertValid();
    const count = unwrap(await ctx.supabase.rpc("copy_bom", { p_from_variant_id: from, p_to_variant_id: to }));
    return { message: `${count} reçete satırı kopyalandı.` };
  });
}
