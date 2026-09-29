"use server";

import { adminAction, unwrap } from "@/lib/action";
import type { FormReader } from "@/lib/form";

/** Aynı adlı tedarikçi hatasını "Tedarikçi adı" alanının yanında gösterir (suppliers_name_unique). */
function flagDuplicateName(form: FormReader, error: unknown) {
  if (!error || typeof error !== "object") return;
  const e = error as { code?: string; message?: string; details?: string | null };
  if (e.code === "23505" && `${e.message ?? ""} ${e.details ?? ""}`.includes("suppliers_name_unique")) {
    form.errors.name = "Bu isimde bir tedarikçi zaten kayıtlı.";
    form.assertValid();
  }
}

function readSupplier(form: FormReader) {
  const email = form.text("email", "E-posta", { max: 200 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) form.errors.email = "Geçerli bir e-posta adresi girin.";
  return {
    name: form.text("name", "Tedarikçi adı", { required: true, max: 200 }),
    tax_number: form.text("tax_number", "Vergi no", { max: 40 }),
    contact_name: form.text("contact_name", "Yetkili", { max: 160 }),
    phone: form.text("phone", "Telefon", { max: 40 }),
    email,
    address: form.text("address", "Adres", { max: 500 }),
    note: form.text("note", "Not", { max: 1000 }),
  };
}

export async function createSupplier(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const values = readSupplier(form);
    form.assertValid();
    const res = await ctx.supabase.from("suppliers").insert(values).select("id").single();
    flagDuplicateName(form, res.error);
    unwrap(res);
    return { message: "Tedarikçi eklendi; hammadde alışında seçilebilir." };
  });
}

export async function updateSupplier(formData: FormData) {
  return adminAction(formData, async (ctx, form) => {
    const id = form.id("id", "Tedarikçi");
    const values = { ...readSupplier(form), is_active: form.bool("is_active") };
    form.assertValid();
    const res = await ctx.supabase.from("suppliers").update(values).eq("id", id!).select("id").single();
    flagDuplicateName(form, res.error);
    unwrap(res);
    return { message: "Tedarikçi güncellendi." };
  });
}
