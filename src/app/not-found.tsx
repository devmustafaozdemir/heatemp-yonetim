import { Compass, Home } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Sayfa bulunamadı" };

/** Bilinmeyen adresler için kök 404 sayfası (uygulama kabuğu dışında, aynı görsel dil). */
export default function RootNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="card w-full max-w-md p-8 text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600" aria-hidden>
          <Compass className="size-6" />
        </span>
        <p className="text-xs font-semibold tracking-wider text-ink-muted uppercase">Hata 404</p>
        <h1 className="mt-1 text-xl font-semibold text-ink">Sayfa bulunamadı</h1>
        <p className="mt-2 text-[13px] text-ink-muted">Aradığınız adres yok veya taşınmış olabilir. Adresi kontrol edin ya da ana sayfaya dönün.</p>
        <Link
          href="/"
          className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-3.5 text-[13px] font-medium text-white shadow-sm hover:bg-brand-700"
        >
          <Home className="size-4" aria-hidden />
          Dashboard&apos;a dön
        </Link>
      </div>
    </main>
  );
}
