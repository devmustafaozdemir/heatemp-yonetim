"use client";

import { Alert, Button } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-xl space-y-4">
      <Alert tone="error" title="Sayfa yüklenemedi">
        {error.message && !error.message.includes("digest")
          ? error.message
          : "Beklenmeyen bir hata oluştu. Bağlantınızı kontrol edip tekrar deneyin."}
      </Alert>
      <Button variant="secondary" onClick={reset}>
        Tekrar dene
      </Button>
    </div>
  );
}
