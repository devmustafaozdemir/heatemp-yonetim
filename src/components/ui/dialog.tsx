"use client";

import { X } from "lucide-react";
import { createContext, use, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { buttonClass, cx, type ButtonVariant } from "@/components/ui";

/**
 * Modal ve yan panel (drawer). Yerel <dialog> öğesi kullanılır: odak içeride tutulur,
 * Esc ile kapanır, arka plan etkileşimi engellenir. İçindeki ActionForm başarıyla
 * kaydedince pencereyi kendiliğinden kapatır (bkz. useDialog).
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
  footer,
}: {
  /** Açma düğmesinin içeriği (metin + ikon). */
  trigger: ReactNode;
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
  /** Sayfa ?islem=… ile açıldığında olduğu gibi, ilk yüklemede açık başlat. */
  defaultOpen?: boolean;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(defaultOpen);
  const titleId = useId();
  const descId = useId();

  const show = useCallback(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    ref.current?.close();
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (defaultOpen && d && !d.open) d.showModal();
  }, [defaultOpen]);

  const widths: Record<Size, string> = {
    sm: "sm:max-w-md",
    md: "sm:max-w-xl",
    lg: "sm:max-w-3xl",
    xl: "sm:max-w-5xl",
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-haspopup="dialog"
        aria-label={triggerLabel}
        className={cx(buttonClass(triggerVariant, triggerSize), triggerClassName)}
      >
        {trigger}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // Arka plana tıklayınca kapat (içerik alanı dışı).
          if (e.target === ref.current) close();
        }}
        className={cx(
          "m-0 max-h-none max-w-none bg-transparent p-0 backdrop:backdrop-blur-[1px]",
          variant === "drawer"
            ? "fixed inset-y-0 right-0 left-auto h-full w-full sm:w-auto"
            : "fixed inset-0 flex h-full w-full items-end justify-center sm:items-center",
          !open && "hidden",
        )}
      >
        <DialogContext value={{ close }}>
          <div
            className={cx(
              "flex w-full flex-col bg-white shadow-(--shadow-pop)",
              variant === "drawer"
                ? cx("h-full", widths[size], size === "sm" ? "sm:w-[28rem]" : size === "md" ? "sm:w-[36rem]" : size === "lg" ? "sm:w-[48rem]" : "sm:w-[64rem]")
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
              <button type="button" onClick={close} className="-mr-1.5 rounded-md p-1.5 text-ink-muted hover:bg-canvas hover:text-ink" aria-label="Kapat">
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
