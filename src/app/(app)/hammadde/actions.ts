"use server";

import { adminAction, unwrap } from "@/lib/action";

const UNIT_KINDS = ["count", "mass", "length", "area", "volume"] as const;
const CURRENCIES = ["USD", "TRY"] as const;

export async function createMaterial(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const values = {
      code: form.text("code", "Malzeme kodu", { required: true, max: 40 }),
      name: form.text("name", "Malzeme adı", { required: true, max: 160 }),
      kind: form.oneOf("kind", "Tür", ["raw", "component"] as const, "raw"),
      unit_kind: form.oneOf("unit_kind", "Birim türü", UNIT_KINDS),
      display_unit: form.text("display_unit", "Gösterim birimi", { required: true }),
      notes: form.text("notes", "Not", { max: 1000 }),
      vat_rate: form.decimal("vat_rate", "KDV oranı", { min: 0 }) ?? 20,
    };
    form.assertValid();
    const m = unwrap(await ctx.supabase.from("raw_materials").insert(values).select("id").single());
    return { message: "Malzeme oluşturuldu.", redirectTo: `/hammadde/${m.id}` };
  });
}

export async function updateMaterial(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("id", "Malzeme");
    const values = {
      code: form.text("code", "Malzeme kodu", { required: true, max: 40 }),
      name: form.text("name", "Malzeme adı", { required: true, max: 160 }),
      kind: form.oneOf("kind", "Tür", ["raw", "component"] as const, "raw"),
      display_unit: form.text("display_unit", "Gösterim birimi", { required: true }),
      notes: form.text("notes", "Not", { max: 1000 }),
      vat_rate: form.decimal("vat_rate", "KDV oranı", { min: 0 }) ?? 20,
      is_active: form.bool("is_active"),
    };
    form.assertValid();
    unwrap(await ctx.supabase.from("raw_materials").update(values).eq("id", id!).select("id").single());
    return { message: "Malzeme güncellendi." };
  });
}

export async function receiveMaterial(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const args = {
      p_material_id: form.id("material_id", "Malzeme"),
      p_qty: form.decimal("qty", "Miktar", { required: true, positive: true }),
      p_unit: form.text("unit", "Birim", { required: true }),
      p_unit_price: form.decimal("unit_price", "Birim fiyat", { required: true, positive: true }),
      p_currency: form.oneOf("currency", "Para birimi", CURRENCIES),
      p_fx_rate_id: form.bigintId("fx_rate_id", "İşlem kuru"),
      p_received_on: form.date("received_on", "Alış tarihi", { required: true }),
      p_supplier_id: form.id("supplier_id", "Tedarikçi", { required: false }),
      p_vat_rate: form.decimal("vat_rate", "KDV oranı", { min: 0 }),
      p_vat_amount: form.decimal("vat_amount", "KDV tutarı", { min: 0 }),
      p_note: form.text("note", "Not", { max: 500 }),
      p_request_id: form.requestId(),
    };
    if (!args.p_fx_rate_id) {
      form.errors.fx_rate_id = "Geçerli bir işlem kuru yok. Kuru güncelleyin veya manuel kur girin.";
    }
    form.assertValid();
    unwrap(await ctx.supabase.rpc("receive_material", args));
    return { message: "Alış kaydedildi; stok ve ortalama maliyet güncellendi." };
  });
}

/** Alışı yerinde düzenler (hareket geçmişine çıkış/giriş satırı eklenmez). */
export async function correctPurchase(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const args = {
      p_movement_id: form.bigintId("movement_id", "Hareket"),
      p_qty: form.decimal("qty", "Miktar", { required: true, positive: true }),
      p_unit: form.text("unit", "Birim", { required: true }),
      p_unit_price: form.decimal("unit_price", "Birim fiyat", { required: true, positive: true }),
      p_currency: form.oneOf("currency", "Para birimi", CURRENCIES),
      p_fx_rate_id: form.bigintId("fx_rate_id", "İşlem kuru"),
      p_received_on: form.date("received_on", "Alış tarihi", { required: true }),
      p_supplier_id: form.id("supplier_id", "Tedarikçi", { required: false }),
      p_vat_rate: form.decimal("vat_rate", "KDV oranı", { min: 0 }),
      p_vat_amount: form.decimal("vat_amount", "KDV tutarı", { min: 0 }),
      p_note: form.text("note", "Not", { max: 500 }),
    };
    if (!args.p_fx_rate_id) {
      form.errors.fx_rate_id = "Geçerli bir işlem kuru yok. Kuru güncelleyin veya manuel kur girin.";
    }
    form.assertValid();
    unwrap(await ctx.supabase.rpc("update_material_purchase", args));
    return { message: "Alış güncellendi; stok ve ortalama maliyet yeniden hesaplandı." };
  });
}

/** Alışın yalnız tedarikçisini değiştirir (maliyet ve stok aynen kalır). */
export async function setPurchaseSupplier(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const args = {
      p_movement_id: form.bigintId("movement_id", "Hareket"),
      p_supplier_id: form.id("supplier_id", "Tedarikçi", { required: false }),
    };
    form.assertValid();
    unwrap(await ctx.supabase.rpc("set_purchase_supplier", args));
    return { message: args.p_supplier_id ? "Tedarikçi kaydedildi." : "Tedarikçi kaldırıldı." };
  });
}

/** Alış veya fire hareketini siler. */
export async function deleteMovement(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.bigintId("movement_id", "Hareket");
    form.assertValid();
    unwrap(await ctx.supabase.rpc("delete_material_movement", { p_movement_id: id }));
    return { message: "Hareket silindi; stok ve ortalama maliyet yeniden hesaplandı." };
  });
}

export async function writeOffMaterial(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const args = {
      p_material_id: form.id("material_id", "Malzeme"),
      p_qty: form.decimal("qty", "Miktar", { required: true, positive: true }),
      p_unit: form.text("unit", "Birim", { required: true }),
      p_reason: form.text("reason", "Gerekçe", { required: true, max: 500 }),
      p_request_id: form.requestId(),
    };
    form.assertValid();
    unwrap(await ctx.supabase.rpc("write_off_material", args));
    return { message: "Stok düşümü kaydedildi." };
  });
}
