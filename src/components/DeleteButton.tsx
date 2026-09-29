"use client";

import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { ActionForm, FormActions, SubmitButton, type ServerAction } from "@/components/forms";
import { Modal } from "@/components/ui/dialog";

/**
 * Onaylı silme düğmesi: tıklayınca açıklamalı onay penceresi açılır, "Sil" ile sunucu işlemi çalışır.
 * `compact` tabloda yalnız ikon gösterir (erişilebilir ad `label`).
 */
export function DeleteButton({
  action,
  fields,
  title,
  children,
  label = "Sil",
  compact = false,
  variant = "ghost",
}: {
  action: ServerAction;
  /** Gizli form alanları (ör. { id }) */
  fields: Record<string, string>;
  title: string;
  /** Onay penceresindeki açıklama */
  children: ReactNode;
  label?: string;
  compact?: boolean;
  variant?: "ghost" | "secondary" | "danger";
}) {
  return (
    <Modal
      trigger={
        <>
          <Trash2 aria-hidden />
          {compact ? null : label}
        </>
      }
      triggerVariant={variant}
      triggerSize="sm"
      triggerClassName={variant === "danger" ? undefined : "text-chart-red"}
      triggerLabel={compact ? label : undefined}
      title={title}
      size="sm"
    >
      <ActionForm action={action} className="space-y-4">
        {Object.entries(fields).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <div className="text-[13px] text-ink-soft">{children}</div>
        <FormActions>
          <SubmitButton variant="danger">Sil</SubmitButton>
        </FormActions>
      </ActionForm>
    </Modal>
  );
}
