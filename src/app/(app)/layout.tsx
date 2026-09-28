import Link from "next/link";
import { Nav } from "@/components/Nav";
import { FxBadge } from "@/components/FxBadge";
import { Toaster } from "@/components/Toaster";
import { requireMember } from "@/lib/auth";
import { ensureFreshFx } from "@/lib/fx/service";
import { signOut } from "@/app/giris/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireMember();
  const fx = await ensureFreshFx(ctx);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4 md:flex">
        <Link href="/" className="mb-5 px-3">
          <div className="text-xs font-semibold tracking-widest text-brand-600 uppercase">Heatemp</div>
          <div className="text-sm font-semibold text-slate-800">Yönetim</div>
        </Link>
        <Nav />
        <div className="mt-auto border-t border-slate-100 px-3 pt-3 text-xs text-slate-500">
          <div className="truncate" title={ctx.email ?? undefined}>
            {ctx.email}
          </div>
          <div className="mt-0.5">{ctx.role === "admin" ? "Yönetici" : "Görüntüleyici"}</div>
          <form action={signOut} className="mt-2">
            <button className="font-medium text-brand-700 hover:underline">Çıkış yap</button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-6 py-2.5 backdrop-blur">
          <details className="md:hidden">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">Menü</summary>
            <div className="absolute left-0 mt-2 w-64 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
              <Nav />
            </div>
          </details>
          <div className="hidden text-xs text-slate-400 md:block">
            {ctx.role === "viewer" ? "Salt okunur erişim" : null}
          </div>
          <FxBadge suggestion={fx.suggestion} warning={fx.warning} />
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-6">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
