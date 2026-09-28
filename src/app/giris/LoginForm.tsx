"use client";

import { ActionForm, SubmitButton } from "@/components/forms";
import { signIn } from "./actions";

export function LoginForm() {
  return (
    <ActionForm action={signIn} showSuccess={false} className="space-y-4">
      {({ pending }) => (
        <>
          <label className="block">
            <span className="label">E-posta</span>
            <input className="input" type="email" name="email" autoComplete="username" required autoFocus />
          </label>
          <label className="block">
            <span className="label">Şifre</span>
            <input className="input" type="password" name="password" autoComplete="current-password" required />
          </label>
          <div className="pt-1">
            <SubmitButton pending={pending}>Giriş yap</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
