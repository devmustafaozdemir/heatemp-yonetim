import type { Metadata } from "next";
import { signOut } from "../actions";

export const metadata: Metadata = { title: "Yetki gerekli" };

export default function NotAuthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Hesabınız uygulamaya eklenmemiş</h1>
        <p className="mt-2 text-sm text-slate-600">
          Giriş yaptınız ancak bu hesap Heatemp yönetim uygulamasına yetkili değil. Yöneticinin hesabınızı{" "}
          <code className="rounded bg-slate-100 px-1">app_users</code> tablosuna eklemesi gerekir (README&apos;deki
          “İlk yönetici” adımına bakın).
        </p>
        <form action={signOut} className="mt-4">
          <button className="text-sm font-medium text-brand-700 hover:underline">Çıkış yap</button>
        </form>
      </div>
    </main>
  );
}
