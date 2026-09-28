"use client";

import { PackageX, Truck } from "lucide-react";
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from "react";
import { EmptyState } from "@/components/ui";
import { Drawer } from "@/components/ui/dialog";
import { DeliverForm } from "../DeliverForm";
import type { DeliverOption } from "./types";

interface DeliveryRequest {
  /** Her açma isteğinde artar; pencere yeni varyantla yeniden kurulur. */
  n: number;
  variant?: string;
}

const DeliveryContext = createContext<{ request: DeliveryRequest; open: (variantId?: string) => void } | null>(null);

/**
 * Teslimat penceresini sayfanın farklı yerlerinden (başlık düğmesi, tablo satırı)
 * açabilmek için paylaşılan durum.
 */
export function DeliveryProvider({ initialVariant, children }: { initialVariant?: string; children: ReactNode }) {
  const [request, setRequest] = useState<DeliveryRequest>({ n: 0, variant: initialVariant });
  const open = useCallback((variant?: string) => setRequest((r) => ({ n: r.n + 1, variant })), []);
  const value = useMemo(() => ({ request, open }), [request, open]);
  return <DeliveryContext value={value}>{children}</DeliveryContext>;
}

/** Satırdan teslimat penceresini açar; sağlayıcı yoksa null. */
export function useOpenDelivery() {
  return use(DeliveryContext)?.open ?? null;
}

export function DeliveryDrawer({ options, today, initialOpen }: { options: DeliverOption[]; today: string; initialOpen: boolean }) {
  const ctx = use(DeliveryContext);
  const request = ctx?.request ?? { n: 0 };
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
