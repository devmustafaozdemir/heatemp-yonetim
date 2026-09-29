"use client";

import { PackageX, Truck } from "lucide-react";
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { EmptyState } from "@/components/ui";
import { Drawer } from "@/components/ui/dialog";
import { DeliverForm } from "../DeliverForm";
import type { DeliverOption } from "./types";

interface DeliveryRequest {
  /** Her açma isteğinde artar; pencere yeni varyantla yeniden kurulur. */
  n: number;
  variant?: string;
}

interface DeliveryContextValue {
  request: DeliveryRequest;
  open: (variantId?: string) => void;
  /** Pencere kapanınca istenen varyantı unutur (yalnız aynı istek hâlâ geçerliyse). */
  clear: (n: number) => void;
}

const DeliveryContext = createContext<DeliveryContextValue | null>(null);

/**
 * Teslimat penceresini sayfanın farklı yerlerinden (başlık düğmesi, tablo satırı)
 * açabilmek için paylaşılan durum.
 */
export function DeliveryProvider({ initialVariant, children }: { initialVariant?: string; children: ReactNode }) {
  const [request, setRequest] = useState<DeliveryRequest>({ n: 0, variant: initialVariant });
  const open = useCallback((variant?: string) => setRequest((r) => ({ n: r.n + 1, variant })), []);
  const clear = useCallback((n: number) => setRequest((r) => (r.n === n && r.variant ? { n, variant: undefined } : r)), []);
  const value = useMemo(() => ({ request, open, clear }), [request, open, clear]);
  return <DeliveryContext value={value}>{children}</DeliveryContext>;
}

/** Satırdan teslimat penceresini açar; sağlayıcı yoksa null. */
export function useOpenDelivery() {
  return use(DeliveryContext)?.open ?? null;
}

/**
 * Pencere içeriği yalnız açıkken bağlanır; kapanınca (içerik ayrılınca) satırdan gelen
 * varyant seçimi temizlenir. Böylece başlıktaki "Yeni teslimat" varsayılan seçimle açılır.
 */
function ForgetVariantOnClose({ n }: { n: number }) {
  const clear = use(DeliveryContext)?.clear;
  useEffect(() => () => clear?.(n), [clear, n]);
  return null;
}

export function DeliveryDrawer({ options, today, initialOpen }: { options: DeliverOption[]; today: string; initialOpen: boolean }) {
  const ctx = use(DeliveryContext);
  const request = ctx?.request ?? { n: 0 };

  // ?islem=teslimat tek seferlik bir komuttur: pencere açıldıktan sonra adresten kaldırılır.
  // Böylece kayıttan sonra sayfa yenilenince veya bağlantı paylaşılınca pencere yeniden açılmaz.
  useEffect(() => {
    if (!initialOpen) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("islem") !== "teslimat") return;
    url.searchParams.delete("islem");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [initialOpen]);

  return (
    <Drawer
      key={request.n}
      defaultOpen={request.n > 0 || initialOpen}
      trigger={
        <>
          <Truck aria-hidden />
          Yeni teslimat
        </>
      }
      title="Mekonsis'e teslimat"
      description="Heatemp rafından Mekonsis satış rafına transfer. Satış değildir; ciro ve kâr oluşturmaz."
      size="lg"
    >
      <ForgetVariantOnClose n={request.n} />
      {options.length === 0 ? (
        <EmptyState title="Teslim edilecek ürün yok" icon={PackageX} compact>
          Heatemp rafı boş. Tamamlanan üretim partileri ve açılış stoğu rafa girince teslim edilebilir.
        </EmptyState>
      ) : (
        <DeliverForm options={options} today={today} initialVariant={request.variant} />
      )}
    </Drawer>
  );
}
