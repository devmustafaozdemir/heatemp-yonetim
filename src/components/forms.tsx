"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, use, useEffect, useId, useRef, useState, useTransition, type ComponentProps, type ReactNode } from "react";
import { notifySuccess } from "@/components/Toaster";
import { Alert, Button, cx, RequiredMark, type ButtonVariant } from "@/components/ui";
import { useDialog } from "@/components/ui/dialog";
import { initialActionState, type ActionState } from "@/lib/form";

export type ServerAction = (formData: FormData) => Promise<ActionState>;

function newRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
}

/**
 * Sunucu işlemi çağıran form. Her gönderime bir istek kimliği (request_id)
 * ekler; aynı istek tekrarlanırsa veritabanı ikinci kaydı oluşturmaz.
 * Hata durumunda girilen değerler korunur.
 */
export function ActionForm({
  action,
  children,
  className,
  confirmMessage,
  resetOnSuccess = false,
  showSuccess = true,
  onSuccess,
  closeDialogOnSuccess = true,
  showErrorMessage = true,
}: {
  action: ServerAction;
  children: ReactNode | ((state: { pending: boolean; result: ActionState }) => ReactNode);
  className?: string;
  confirmMessage?: string;
  resetOnSuccess?: boolean;
  showSuccess?: boolean;
  onSuccess?: (result: ActionState) => void;
  /** Modal/yan panel içindeyse başarıdan sonra kapat (varsayılan). */
  closeDialogOnSuccess?: boolean;
  /** false: genel hata mesajını formun altında gösterme (children fonksiyonunda result.message ile kendiniz yerleştirin). */
  showErrorMessage?: boolean;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const formRef = useRef<HTMLFormElement>(null);
  const [requestId, setRequestId] = useState(newRequestId);
  const [result, setResult] = useState<ActionState>(initialActionState);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      let next: ActionState;
      try {
        next = await action(formData);
      } catch {
        next = { ok: false, message: "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin." };
      }
      // Başarı mesajı kalıcı bildirim alanında gösterilir: işlem sonrası yenilenen
      // sayfada bu form kaldırılsa bile kullanıcı sonucu görür. Hatalar formun yanında kalır.
      setResult(next.ok ? { ...next, message: null } : next);
      if (next.ok) {
        if (showSuccess && next.message) notifySuccess(next.message);
        setRequestId(newRequestId());
        if (resetOnSuccess) formRef.current?.reset();
        onSuccess?.(next);
        if (closeDialogOnSuccess) dialog?.close();
        if (next.redirectTo) router.push(next.redirectTo);
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className={className} noValidate>
      <input type="hidden" name="request_id" value={requestId} />
      <FormState value={{ pending, fieldErrors: result.fieldErrors ?? {} }}>
        {typeof children === "function" ? children({ pending, result }) : children}
      </FormState>
      {showErrorMessage && result.message && !result.ok ? (
        <div className="mt-3">
          <Alert tone="error">{result.message}</Alert>
        </div>
      ) : null}
    </form>
  );
}

const FormStateContext = createContext<{ pending: boolean; fieldErrors: Record<string, string> }>({
  pending: false,
  fieldErrors: {},
});
function FormState({ value, children }: { value: { pending: boolean; fieldErrors: Record<string, string> }; children: ReactNode }) {
  return <FormStateContext value={value}>{children}</FormStateContext>;
}

export function useFieldError(name: string): string | undefined {
  return use(FormStateContext).fieldErrors[name];
}

export function useFormPending(): boolean {
  return use(FormStateContext).pending;
}

export function FieldError({ name }: { name: string }) {
  const error = useFieldError(name);
  return error ? (
    <span className="field-error" role="alert">
      <AlertCircle className="size-3.5" aria-hidden />
      {error}
    </span>
  ) : null;
}

export function FormField({
  name,
  label,
  hint,
  children,
  className,
  required,
}: {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Etikette zorunlu alan işareti (*) gösterir. */
  required?: boolean;
}) {
  const error = useFieldError(name);
  const descId = `${useId()}-aciklama`;
  const described = error || hint ? descId : null;
  const labelRef = useRef<HTMLLabelElement>(null);
  // İpucu/hata girdiye aria-describedby ile bağlanır. Öznitelikler hidrasyondan sonra DOM'a yazılır:
  // sunucudan gelen çocuk öğeyi klonlamak sunucu/istemci farkına (hidrasyon uyuşmazlığı) yol açıyordu.
  useEffect(() => {
    const el = labelRef.current?.querySelector<HTMLElement>("input, select, textarea");
    if (!el) return;
    if (described) el.setAttribute("aria-describedby", described);
    else el.removeAttribute("aria-describedby");
    if (error) el.setAttribute("aria-invalid", "true");
    else el.removeAttribute("aria-invalid");
    if (required) el.setAttribute("aria-required", "true");
  }, [described, error, required]);
  return (
    <div className={cx("block min-w-0", className)} data-invalid={error ? "" : undefined}>
      <label ref={labelRef} className="block">
        <span className="label">
          {label}
          {required ? <RequiredMark /> : null}
        </span>
        {children}
      </label>
      {error ? (
        <span id={descId} className="field-error" role="alert">
          <AlertCircle className="size-3.5" aria-hidden />
          {error}
        </span>
      ) : hint ? (
        <span id={descId} className="help">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** Form işlem çubuğu: yan panel/modal içinde altta yapışık, sayfada sağa hizalı. */
export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("form-actions", className)}>{children}</div>;
}

export function SubmitButton({
  children,
  pending: pendingProp,
  variant = "primary",
  size = "md",
  disabled,
  ...rest
}: {
  children: ReactNode;
  pending?: boolean;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  disabled?: boolean;
} & Omit<ComponentProps<"button">, "type" | "children" | "disabled">) {
  const pendingCtx = useFormPending();
  const pending = pendingProp ?? pendingCtx;
  return (
    <Button {...rest} type="submit" variant={variant} size={size} disabled={pending || disabled} aria-busy={pending}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          Kaydediliyor…
        </>
      ) : (
        children
      )}
    </Button>
  );
}
