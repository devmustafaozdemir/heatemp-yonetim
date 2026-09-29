import { FileQuestion, LayoutDashboard, Package, Receipt, Truck } from "lucide-react";
import Link from "next/link";
import { ButtonLink, IconBox } from "@/components/ui";

const LINKS = [
  { href: "/satislar", label: "Satışlar", icon: Receipt },
  { href: "/teslimatlar", label: "Teslimatlar", icon: Truck },
  { href: "/urunler", label: "Ürünler ve BOM", icon: Package },
];

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center py-6">
      <div className="card w-full max-w-xl p-6 sm:p-8">
        <IconBox icon={FileQuestion} tone="slate" size="lg" />
        <h1 className="mt-4 text-xl font-semibold text-ink">Kayıt bulunamadı</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          Aradığınız kayıt silinmiş, iptal edilip listeden kaldırılmış veya hiç oluşturulmamış olabilir. Bağlantıyı kontrol edin ya da
          ilgili listeden arayın.
        </p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
              >
                <l.icon className="size-3.5" aria-hidden />
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-6 border-t border-line pt-4">
          <ButtonLink href="/">
            <LayoutDashboard aria-hidden />
            Dashboard&apos;a dön
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
