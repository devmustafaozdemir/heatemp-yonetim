import { LogOut, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, IconBox } from "@/components/ui";
import { getAuthContext } from "@/lib/auth";
import { signOut } from "../actions";
import { AuthLayout } from "../AuthLayout";

export const metadata: Metadata = { title: "Yetki gerekli" };

export default async function NotAuthorizedPage() {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect("/giris");
  if (ctx.role) redirect("/");

  return (
    <AuthLayout>
      <div className="card px-5 py-6 sm:px-8 sm:py-8">
        <IconBox icon={ShieldAlert} tone="amber" size="lg" />
        <h1 className="mt-4 text-xl font-semibold text-ink">Hesabınız uygulamaya eklenmemiş</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          Oturum açtınız ancak bu hesap Heatemp yönetim uygulamasında yetkili değil. Erişim için yöneticinin hesabınızı{" "}
          <code className="code rounded bg-canvas px-1 py-0.5">app_users</code> tablosuna <strong className="font-medium">yönetici</strong>{" "}
          veya <strong className="font-medium">görüntüleyici</strong> rolüyle eklemesi gerekir (README&apos;deki “İlk yönetici” adımı).
        </p>
        {ctx.email ? (
          <dl className="mt-4 rounded-md border border-line bg-canvas/60 px-3 py-2.5 text-[13px]">
            <dt className="text-xs text-ink-muted">Oturum açılan hesap</dt>
            <dd className="mt-0.5 font-medium break-all text-ink">{ctx.email}</dd>
          </dl>
        ) : null}
        <form action={signOut} className="mt-6 border-t border-line pt-4">
          <Button type="submit" variant="secondary" className="w-full sm:w-auto">
            <LogOut aria-hidden />
            Çıkış yap ve başka hesapla gir
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
