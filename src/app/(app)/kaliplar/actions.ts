"use server";

import { adminAction, unwrap } from "@/lib/action";
import type { FormReader } from "@/lib/form";

function readMold(form: FormReader) {
  return {
    name: form.text("name", "Kalıp adı", { required: true, max: 200 }),
    code: form.text("code", "Kalıp kodu", { max: 60 }),
    price: form.decimal("price", "Kalıp ücreti", { required: true, min: 0 }),
    currency: form.oneOf("currency", "Para birimi", ["USD", "TRY"] as const, "USD"),
    purchased_on: form.date("purchased_on", "Alış tarihi"),
    supplier_id: form.id("supplier_id", "Tedarikçi", { required: false }),
    product_id: form.id("product_id", "Ürün", { required: false }),
    note: form.text("note", "Not", { max: 1000 }),
  };
}

/** Aynı kodlu kalıp hatasını "Kalıp kodu" alanının yanında gösterir. */
function flagDuplicateCode(form: FormReader, error: unknown) {
  if (!error || typeof error !== "object") return;
  const e = error as { code?: string; message?: string; details?: string | null };
  if (e.code === "23505" && `${e.message ?? ""} ${e.details ?? ""}`.includes("molds_code_unique")) {
    form.errors.code = "Bu kodla bir kalıp zaten kayıtlı.";
    form.assertValid();
  }
}

export async function createMold(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const values = readMold(form);
    form.assertValid();
    const res = await ctx.supabase.from("molds").insert(values).select("id").single();
    flagDuplicateCode(form, res.error);
    unwrap(res);
    return { message: "Kalıp eklendi." };
  });
}

export async function updateMold(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("id", "Kalıp");
    const values = { ...readMold(form), is_active: form.bool("is_active") };
    form.assertValid();
    const res = await ctx.supabase.from("molds").update(values).eq("id", id!).select("id").single();
    flagDuplicateCode(form, res.error);
    unwrap(res);
    return { message: "Kalıp güncellendi." };
  });
}

export async function deleteMold(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("id", "Kalıp");
    form.assertValid();
    unwrap(await ctx.supabase.from("molds").delete().eq("id", id!).select("id").single());
    return { message: "Kalıp silindi." };
  });
}
