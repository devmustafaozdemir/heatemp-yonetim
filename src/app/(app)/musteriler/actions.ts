"use server";

import { adminAction, unwrap } from "@/lib/action";
import type { FormReader } from "@/lib/form";

const DUPLICATE_NAME = "Bu isimde bir müşteri zaten kayıtlı.";

/** Firma adı benzersizlik ihlali (customers_name_unique, büyük/küçük harf duyarsız). */
function isDuplicateName(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; details?: string | null };
  return e.code === "23505" && `${e.message ?? ""} ${e.details ?? ""}`.includes("customers_name_unique");
}

/** Aynı adlı müşteri hatasını formun genelinde değil "Firma adı" alanının yanında gösterir. */
function flagDuplicateName(form: FormReader, error: unknown) {
  if (isDuplicateName(error)) {
    form.errors.name = DUPLICATE_NAME;
    form.assertValid();
  }
}

function readCustomer(form: FormReader) {
  const email = form.text("email", "E-posta", { max: 200 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) form.errors.email = "Geçerli bir e-posta adresi girin.";
  return {
    name: form.text("name", "Firma adı", { required: true, max: 200 }),
    tax_number: form.text("tax_number", "Vergi no", { max: 40 }),
    contact_name: form.text("contact_name", "Yetkili", { max: 160 }),
    phone: form.text("phone", "Telefon", { max: 40 }),
    email,
    address: form.text("address", "Adres", { max: 500 }),
    note: form.text("note", "Not", { max: 1000 }),
  };
}

export async function createCustomer(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const values = readCustomer(form);
    form.assertValid();
    const res = await ctx.supabase.from("customers").insert(values).select("id").single();
    flagDuplicateName(form, res.error);
    const c = unwrap(res);
    return { message: "Müşteri eklendi.", redirectTo: `/musteriler/${c.id}` };
  });
}

export async function updateCustomer(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("id", "Müşteri");
    const values = { ...readCustomer(form), is_active: form.bool("is_active") };
    form.assertValid();
    const res = await ctx.supabase.from("customers").update(values).eq("id", id!).select("id").single();
    flagDuplicateName(form, res.error);
    unwrap(res);
    return { message: "Müşteri güncellendi." };
  });
}

/** Satışı veya teklifi olmayan müşteriyi kalıcı siler; geçmişi olan müşteri pasif yapılır. */
export async function deleteCustomer(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("id", "Müşteri");
    const redirect = form.bool("redirect");
    form.assertValid();
    const [sales, quotes] = await Promise.all([
      ctx.supabase.from("sales").select("id", { count: "exact", head: true }).eq("customer_id", id!),
      ctx.supabase.from("quotes").select("id", { count: "exact", head: true }).eq("customer_id", id!),
    ]);
    if ((sales.count ?? 0) > 0 || (quotes.count ?? 0) > 0) {
      throw new Error("Bu müşterinin satış veya teklif kaydı var; silinemez. Bunun yerine düzenleme ekranından pasif yapabilirsiniz.");
    }
    unwrap(await ctx.supabase.from("customers").delete().eq("id", id!).select("id").single());
    return { message: "Müşteri silindi.", redirectTo: redirect ? "/musteriler" : undefined };
  });
}

export async function createQuote(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const values = {
      customer_id: form.id("customer_id", "Müşteri"),
      currency: form.oneOf("currency", "Para birimi", ["USD", "TRY"] as const),
      quote_date: form.date("quote_date", "Teklif tarihi", { required: true }),
      valid_until: form.date("valid_until", "Geçerlilik tarihi"),
      note: form.text("note", "Not", { max: 1000 }),
    };
    form.assertValid();
    const q = unwrap(await ctx.supabase.from("quotes").insert(values).select("id").single());
    return { message: "Teklif oluşturuldu.", redirectTo: `/musteriler/teklif/${q.id}` };
  });
}

export async function updateQuote(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("id", "Teklif");
    const values = {
      currency: form.oneOf("currency", "Para birimi", ["USD", "TRY"] as const),
      quote_date: form.date("quote_date", "Teklif tarihi", { required: true }),
      valid_until: form.date("valid_until", "Geçerlilik tarihi"),
      note: form.text("note", "Not", { max: 1000 }),
    };
    form.assertValid();
    unwrap(await ctx.supabase.from("quotes").update(values).eq("id", id!).select("id").single());
    return { message: "Teklif güncellendi." };
  });
}

export async function setQuoteStatus(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("id", "Teklif");
    const status = form.oneOf("status", "Durum", ["open", "cancelled"] as const);
    form.assertValid();
    unwrap(await ctx.supabase.from("quotes").update({ status }).eq("id", id!).select("id").single());
    return { message: status === "cancelled" ? "Teklif iptal edildi." : "Teklif yeniden açıldı." };
  });
}

export async function saveQuoteItem(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const values = {
      quote_id: form.id("quote_id", "Teklif"),
      variant_id: form.id("variant_id", "Varyant"),
      quantity: form.int("quantity", "Adet", { required: true, positive: true }),
      unit_price: form.decimal("unit_price", "Özel birim fiyat", { required: true, positive: true }),
      note: form.text("note", "Not", { max: 500 }),
    };
    form.assertValid();
    unwrap(await ctx.supabase.from("quote_items").upsert(values, { onConflict: "quote_id,variant_id" }));
    return { message: "Teklif kalemi kaydedildi." };
  });
}

export async function deleteQuoteItem(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("id", "Kalem");
    form.assertValid();
    unwrap(await ctx.supabase.from("quote_items").delete().eq("id", id!));
    return { message: "Kalem silindi." };
  });
}

export async function convertQuote(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const args = {
      p_quote_id: form.id("quote_id", "Teklif"),
      p_sold_on: form.date("sold_on", "Satış tarihi", { required: true }),
      p_fx_rate_id: form.bigintId("fx_rate_id", "İşlem kuru"),
      p_request_id: form.requestId(),
    };
    if (!args.p_fx_rate_id) form.errors.fx_rate_id = "Geçerli bir işlem kuru yok. Kuru güncelleyin veya manuel kur girin.";
    form.assertValid();
    const saleId = unwrap(await ctx.supabase.rpc("convert_quote_to_sale", args)) as string;
    return { message: "Teklif satışa dönüştürüldü.", redirectTo: `/satislar/${saleId}` };
  });
}
