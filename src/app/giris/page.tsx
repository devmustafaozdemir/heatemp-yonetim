import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Giriş" };

export default async function LoginPage() {
  const ctx = await getAuthContext().catch(() => null);
  if (ctx?.role) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <div className="text-xs font-semibold tracking-widest text-brand-600 uppercase">Heatemp</div>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">Üretim, stok ve satış yönetimi</h1>
          <p className="mt-1 text-sm text-slate-500">Devam etmek için giriş yapın.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
