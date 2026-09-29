"use client";

import { AlertOctagon, LayoutDashboard, RotateCcw } from "lucide-react";
import { useEffect, useTransition } from "react";
import { Button, ButtonLink, IconBox } from "@/components/ui";

/**
 * Uygulama içi hata sınırı. Sunucu hataları üretimde genel bir iletiyle gelir; bu durumda
 * anlaşılır bir Türkçe açıklama ve eşleştirme için hata kodu (digest) gösterilir.
 */

const IS_DEV = process.env.NODE_ENV === "development";

/**
 * Kullanıcıya gösterilebilecek ileti mi? Uygulamanın kendi hataları Türkçedir (toUserMessage); üretimde
 * ham İngilizce çalışma zamanı iletileri ("Cannot read properties of undefined" gibi) gösterilmez.
 */
function readableMessage(message: string | undefined): string | null {
  if (!message || /digest|Server Components render/i.test(message)) return null;
  if (IS_DEV) return message;
  return /[çğıöşüÇĞİÖŞÜ]/.test(message) ? message : null;
}
export default function ErrorPage({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset?: () => void }) {
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    console.error(error);
  }, [error]);

  const readable = readableMessage(error.message);

  return (
    <div className="flex min-h-[60vh] items-center justify-center py-6">
      <div className="card w-full max-w-xl p-6 sm:p-8" role="alert">
        <IconBox icon={AlertOctagon} tone="red" size="lg" />
        <h1 className="mt-4 text-xl font-semibold text-ink">Sayfa yüklenemedi</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          {readable ??
            `Beklenmeyen bir hata oluştu. Bağlantınızı kontrol edip tekrar deneyin; sorun sürerse ${
              error.digest ? "yöneticiye aşağıdaki hata kodunu iletin." : "yöneticiye bildirin."
            }`}
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-ink-muted">
            Hata kodu: <span className="code">{error.digest}</span>
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button type="button" onClick={() => startTransition(() => (retry ?? reset)?.())} disabled={pending} aria-busy={pending}>
            <RotateCcw className={pending ? "animate-spin" : undefined} aria-hidden />
            Tekrar dene
          </Button>
          <ButtonLink href="/" variant="secondary">
            <LayoutDashboard aria-hidden />
            Dashboard&apos;a dön
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
