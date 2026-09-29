"use client";

import { X } from "lucide-react";
import { createContext, use, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { buttonClass, cx, type ButtonVariant } from "@/components/ui";

/**
 * Modal ve yan panel (drawer). Yerel <dialog> öğesi kullanılır: odak içeride tutulur,
 * Esc ile kapanır, arka plan etkileşimi engellenir. İçindeki ActionForm başarıyla
 * kaydedince pencereyi kendiliğinden kapatır (bkz. useDialog). İçerik yalnız açıkken
 * oluşturulur (kapalı pencerenin alanları DOM'da yoktur).
 *
 * Kullanım:
 *  - Düğmeli: <Drawer trigger={<><Plus />Yeni</>} title="…">…</Drawer>
 *  - Kontrollü (ör. tablo satırından açmak): <Drawer open={x} onOpenChange={setX} title="…">…</Drawer>
 *  - ?islem=… ile açılış: <Drawer defaultOpen={sp.islem === "giris"} clearParam="islem" …>
 */
const DialogContext = createContext<{ close: () => void } | null>(null);

/** Dialog içindeyse kapatma fonksiyonu; değilse null. */
export function useDialog() {
  return use(DialogContext);
}

type Size = "sm" | "md" | "lg" | "xl";

export function Dialog({
  trigger,
  title,
  description,
  children,
  variant = "modal",
  size = "md",
  triggerVariant = "primary",
  triggerSize = "md",
  triggerClassName,
  triggerLabel,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  onClose,
  clearParam,
  footer,
}: {
  /** Açma düğmesinin içeriği (metin + ikon). Kontrollü kullanımda verilmeyebilir. */
  trigger?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** modal: ortada; drawer: sağdan açılan panel */
  variant?: "modal" | "drawer";
  size?: Size;
  triggerVariant?: ButtonVariant;
  triggerSize?: "sm" | "md";
  triggerClassName?: string;
  /** Düğme yalnız ikon içeriyorsa erişilebilir ad. */
  triggerLabel?: string;
  /** Sayfa ?islem=… ile açıldığında olduğu gibi, açık başlat (sonradan true olursa da açılır). */
  defaultOpen?: boolean;
  /** Kontrollü kullanım */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Pencere kapandığında */
  onClose?: () => void;
  /** Açılınca adresten kaldırılacak arama parametresi (yenilemede tekrar açılmasın). */
  clearParam?: string;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const controlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = controlled ? openProp : internalOpen;

  // defaultOpen sonradan true olursa (aynı sayfada ?islem=… ile istemci gezinmesi) aç.
  const [prevDefault, setPrevDefault] = useState(defaultOpen);
  if (defaultOpen !== prevDefault) {
    setPrevDefault(defaultOpen);
    if (defaultOpen && !controlled) setInternalOpen(true);
  }

  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );

  // <dialog> öğesini durumla eşitle.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Açılınca işlem parametresini adresten kaldır.
  useEffect(() => {
    if (!open || !clearParam) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has(clearParam)) {
      url.searchParams.delete(clearParam);
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  }, [open, clearParam]);

  const close = useCallback(() => ref.current?.close(), []);

  const widths: Record<Size, string> = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-3xl", xl: "sm:max-w-5xl" };
  const drawerWidths: Record<Size, string> = { sm: "sm:w-[28rem]", md: "sm:w-[36rem]", lg: "sm:w-[48rem]", xl: "sm:w-[64rem]" };

  return (
    <>
      {trigger !== undefined ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={triggerLabel}
          className={cx(buttonClass(triggerVariant, triggerSize), triggerClassName)}
        >
          {trigger}
        </button>
      ) : null}
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
        onClick={(e) => {
          // Arka plana tıklayınca kapat (içerik alanı dışı).
          if (e.target === ref.current) close();
        }}
        className={cx(
          "m-0 max-h-none max-w-none bg-transparent p-0 text-left font-normal whitespace-normal text-ink-soft backdrop:backdrop-blur-[1px] [&:not([open])]:hidden",
          variant === "drawer"
            ? "fixed inset-y-0 right-0 left-auto h-full w-full sm:w-auto"
            : "fixed inset-0 flex h-full w-full items-end justify-center sm:items-center",
        )}
      >
        <DialogContext value={{ close }}>
          <div
            className={cx(
              "flex w-full flex-col bg-white shadow-(--shadow-pop)",
              variant === "drawer"
                ? cx("h-full", widths[size], drawerWidths[size])
                : cx("max-h-[92vh] rounded-t-lg sm:m-4 sm:rounded-lg", widths[size]),
            )}
          >
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
              <div className="min-w-0">
                <h2 id={titleId} className="text-[15px] font-semibold text-ink">
                  {title}
                </h2>
                {description ? (
                  <p id={descId} className="mt-0.5 text-xs text-ink-muted">
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={close}
                className="-mr-1.5 rounded-md p-1.5 text-ink-muted hover:bg-canvas hover:text-ink"
                aria-label="Kapat"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{open ? children : null}</div>
            {footer ? <div className="border-t border-line px-5 py-3">{footer}</div> : null}
          </div>
        </DialogContext>
      </dialog>
    </>
  );
}

/** Kısa kısayollar */
export function Modal(props: Omit<Parameters<typeof Dialog>[0], "variant">) {
  return <Dialog {...props} variant="modal" />;
}
export function Drawer(props: Omit<Parameters<typeof Dialog>[0], "variant">) {
  return <Dialog {...props} variant="drawer" />;
}
