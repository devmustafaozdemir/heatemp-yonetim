import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { AuthLayout } from "./AuthLayout";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Giriş" };

export default async function LoginPage() {
  const ctx = await getAuthContext().catch(() => null);
  if (ctx?.role) redirect("/");

  return (
    <AuthLayout>
      <div className="card px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-ink">Giriş yap</h1>
          <p className="mt-1 text-[13px] text-ink-muted">Heatemp yönetim paneline devam etmek için hesabınızla oturum açın.</p>
        </div>
        <LoginForm />
        <p className="mt-6 flex items-start gap-2 border-t border-line pt-4 text-xs text-ink-muted">
          <ShieldCheck className="mt-px size-4 shrink-0 text-ink-muted" aria-hidden />
          <span>Hesaplar yönetici tarafından açılır; şifre sıfırlama için yöneticinize başvurun.</span>
        </p>
      </div>
    </AuthLayout>
  );
}
