"use client";

import { AlertCircle, Loader2, Lock, LogIn, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Alert, Button, cx } from "@/components/ui";
import type { ActionState } from "@/lib/form";
import { signIn } from "./actions";

type FieldErrors = { email?: string; password?: string };

/**
 * Giriş formu. Boş/geçersiz alanlar gönderilmeden alan yanında gösterilir; sunucudan gelen
 * hata (ör. "E-posta veya şifre hatalı.") formun üstünde, alanlar korunarak gösterilir.
 */
export function LoginForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const busy = pending || done;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const errors: FieldErrors = {};
    if (!email) errors.email = "E-posta adresinizi girin.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Geçerli bir e-posta adresi girin.";
    if (!password) errors.password = "Şifrenizi girin.";
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      setError(null);
      (errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    startTransition(async () => {
      let result: ActionState;
      try {
        result = await signIn(formData);
      } catch {
        result = { ok: false, message: "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin." };
      }
      if (result.ok) {
        setError(null);
        setDone(true);
        router.push(result.redirectTo ?? "/");
      } else {
        setError(result.message ?? "Giriş yapılamadı.");
        passwordRef.current?.select();
      }
    });
  }

  const inputCls = "input h-10 pl-9";

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-describedby={error ? "giris-hata" : undefined}>
      {error ? (
        <div id="giris-hata">
          <Alert tone="error" title="Giriş yapılamadı">
            {error}
          </Alert>
        </div>
      ) : null}

      <div data-invalid={fieldErrors.email ? "" : undefined}>
        <label htmlFor="giris-eposta" className="label">
          E-posta
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            ref={emailRef}
            id="giris-eposta"
            className={inputCls}
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            placeholder="ad@firma.com"
            required
            aria-required
            aria-invalid={fieldErrors.email || error ? true : undefined}
            aria-describedby={fieldErrors.email ? "giris-eposta-hata" : undefined}
            onChange={() => fieldErrors.email && setFieldErrors((f) => ({ ...f, email: undefined }))}
            autoFocus
          />
        </div>
        {fieldErrors.email ? (
          <span id="giris-eposta-hata" className="field-error" role="alert">
            <AlertCircle className="size-3.5" aria-hidden />
            {fieldErrors.email}
          </span>
        ) : null}
      </div>

      <div data-invalid={fieldErrors.password ? "" : undefined}>
        <label htmlFor="giris-sifre" className="label">
          Şifre
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            ref={passwordRef}
            id="giris-sifre"
            className={cx(inputCls, "pr-20")}
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            required
            aria-required
            aria-invalid={fieldErrors.password || error ? true : undefined}
            aria-describedby={fieldErrors.password ? "giris-sifre-hata" : undefined}
            onChange={() => fieldErrors.password && setFieldErrors((f) => ({ ...f, password: undefined }))}
          />
          {/* Görünen etiket durumu söyler (Göster/Gizle); aria-pressed eklenmez, yoksa "Gizle, basılı" gibi çelişkili okunur.
              Bağlam title ile verilir; erişilebilir ada "Şifre" eklenmez (getByLabel("Şifre") yalnız alanı bulmalı). */}
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-controls="giris-sifre"
            title={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
            className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            {showPassword ? "Gizle" : "Göster"}
          </button>
        </div>
        {fieldErrors.password ? (
          <span id="giris-sifre-hata" className="field-error" role="alert">
            <AlertCircle className="size-3.5" aria-hidden />
            {fieldErrors.password}
          </span>
        ) : null}
      </div>

      <Button type="submit" className="h-10 w-full text-sm" disabled={busy} aria-busy={busy}>
        {busy ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            Giriş yapılıyor…
          </>
        ) : (
          <>
            <LogIn aria-hidden />
            Giriş yap
          </>
        )}
      </Button>
    </form>
  );
}
