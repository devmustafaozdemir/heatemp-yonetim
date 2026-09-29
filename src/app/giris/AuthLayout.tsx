import { Coins, Factory, Thermometer, TrendingUp, Warehouse, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Factory, title: "Üretim ve parti maliyeti", text: "Reçeteden üretim simülasyonu, parti başlatma ve gerçekleşen birim maliyet." },
  { icon: Warehouse, title: "Heatemp ve Mekonsis rafları", text: "Teslimatlar, raf stoku ve stok hareketleri; teslimat satış sayılmaz." },
  { icon: TrendingUp, title: "Satış ve brüt kâr", text: "Gerçekleşen satışlar, Heatemp/Mekonsis payları ve dönemsel kârlılık." },
  { icon: Coins, title: "Sabitlenen USD/TRY kuru", text: "Her işlem kendi günündeki kurla kaydedilir; geçmiş değişmez." },
];

/**
 * Giriş ve yetki sayfalarının ortak iki sütunlu düzeni: solda koyu lacivert marka paneli,
 * sağda form kartı. Dar ekranda marka paneli üstte kısa bir şerit olarak kalır.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen grid-cols-1 grid-rows-[auto_1fr] bg-canvas lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:grid-rows-1">
      <aside className="relative overflow-hidden bg-linear-to-br from-nav via-nav to-brand-800 px-5 py-5 text-nav-text sm:px-8 lg:flex lg:flex-col lg:px-12 lg:py-10 xl:px-16">
        {/* Dekoratif halkalar (yalnız görsel) */}
        <div
          className="pointer-events-none absolute -top-24 -right-24 hidden size-80 rounded-full border border-white/5 lg:block"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-8 -bottom-32 hidden size-96 rounded-full border border-white/5 lg:block"
          aria-hidden
        />

        <div className="relative flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-md bg-chart-blue text-white shadow-sm">
            <Thermometer className="size-5" aria-hidden />
          </span>
          <span className="leading-tight">
            <span className="block text-base font-semibold tracking-wide text-white">HEATEMP</span>
            <span className="block text-xs text-nav-title">Üretim · Stok · Satış yönetimi</span>
          </span>
        </div>

        <div className="relative hidden lg:mt-auto lg:block lg:pt-12">
          {/* Başlık etiketi değil: sayfanın ilk başlığı sağdaki formun h1'i olmalı. */}
          <p className="max-w-md text-[28px] leading-tight font-semibold text-white">
            Üretimden satışa maliyet, stok ve kârlılık tek panelde.
          </p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-nav-text">
            Heatemp üretir, Mekonsis satar. Hammadde alışından parti maliyetine, raf stokundan gerçekleşen satışın brüt kârına kadar tüm
            kayıtlar aynı veriden türetilir.
          </p>
          <ul className="mt-8 grid max-w-lg gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white/8 text-white" aria-hidden>
                  <f.icon className="size-4.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-white">{f.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-nav-text">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-3 text-xs text-nav-title lg:mt-auto lg:pt-10">
          <span className="lg:hidden">Üretim partileri, raf stoku, satış ve kârlılık tek panelde.</span>
          <span className="hidden lg:inline">Heatemp Yönetim · Tutarlar işlem günü kuruyla sabitlenir.</span>
        </p>
      </aside>

      <div className="flex items-start justify-center px-4 py-8 sm:items-center sm:px-8 sm:py-12">
        <div className="w-full max-w-[420px]">{children}</div>
      </div>
    </main>
  );
}
