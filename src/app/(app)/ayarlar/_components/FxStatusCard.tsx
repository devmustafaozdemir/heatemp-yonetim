import { AlertTriangle, CheckCircle2, Clock, DollarSign, RefreshCw, ServerOff } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { fxSourceLabel } from "@/components/FxBadge";
import { Alert, Badge, Card, ProgressBar } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtInt, fmtRate } from "@/lib/format";
import type { FxSuggestion } from "@/lib/fx/service";
import type { AppSettings } from "@/lib/types";
import { refreshFxNow } from "../actions";
import { ago, everyLabel, RATE_TYPE_LABEL, SOURCE_LONG } from "./fx";

export interface LastAutoRate {
  source: string;
  rate_type: string;
  rate: number;
  rate_date: string;
  fetched_at: string;
  last_checked_at: string;
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-line py-1.5 last:border-b-0">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-ink tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * Güncel kur (kaynak tarihi, alınma ve son kontrol zamanı, geçerlilik) ve otomatik güncelleme
 * durumu. Üst bardaki kur rozeti bu karta (/ayarlar#kur) bağlanır.
 */
export function FxStatusCard({
  current,
  currentError,
  currentRow,
  settings,
  lastAuto,
  lastAutoError,
  lastAttemptError,
  hasServiceKey,
  isAdmin,
  now,
}: {
  current: FxSuggestion | null;
  currentError: string | null;
  currentRow: { last_checked_at: string; note: string | null } | null;
  settings: AppSettings | null;
  lastAuto: LastAutoRate | null;
  lastAutoError: string | null;
  /** Son otomatik denemenin hata nedeni (ensureFreshFx uyarısı); yoksa null. */
  lastAttemptError: string | null;
  hasServiceKey: boolean;
  isAdmin: boolean;
  now: number;
}) {
  const refreshMs = (settings?.fx_refresh_minutes ?? 60) * 60_000;
  const lastCheckMs = lastAuto ? new Date(lastAuto.last_checked_at).getTime() : null;
  const fresh = lastCheckMs !== null && now - lastCheckMs <= refreshMs;
  const nextCheck = lastCheckMs !== null ? new Date(lastCheckMs + refreshMs).toISOString() : null;

  // Servis anahtarı yokken uyarı zaten durum metnidir; ayrıca deneme hatası gösterilmez.
  const attemptError = hasServiceKey ? lastAttemptError : null;
  // Görüntüleyici "Şimdi güncelle" düğmesini ve manuel kur formunu görmez; ona yöneticiye başvurması söylenir.
  const whatToDo = isAdmin ? "“Şimdi güncelle” ile deneyin ya da manuel kur girin." : "Kur girişi için yöneticinize başvurun.";
  const status: { tone: "green" | "amber" | "sky"; icon: typeof CheckCircle2; text: string; detail: string } = !hasServiceKey
    ? {
        tone: "amber",
        icon: ServerOff,
        text: "Otomatik kayıt kapalı",
        detail: `Sunucuda SUPABASE_SERVICE_ROLE_KEY tanımlı değil; otomatik kur alınamaz ve kaydedilemez. ${
          isAdmin ? "Manuel kur girişi kullanılabilir." : "Kur girişi için yöneticinize başvurun."
        }`,
      }
    : !lastAuto
      ? {
          tone: "amber",
          icon: AlertTriangle,
          text: "Henüz otomatik kur alınmadı",
          detail: attemptError
            ? `Otomatik kaynaklardan kur alınamıyor. ${whatToDo}`
            : `Kaynaklara erişilemedi veya henüz deneme yapılmadı. ${whatToDo}`,
        }
      : fresh
        ? {
            tone: "green",
            icon: CheckCircle2,
            text: "Etkin — güncel",
            detail: `Son kontrol ${ago(lastAuto.last_checked_at, now)}. Sonraki kontrol ${fmtDateTime(nextCheck)} sonrasında ilk sayfa açılışında yapılır.`,
          }
        : attemptError
          ? {
              tone: "amber",
              icon: AlertTriangle,
              text: "Son deneme başarısız",
              detail: `Son başarılı kontrol ${ago(lastAuto.last_checked_at, now)}; bir sonraki sayfa açılışında arka planda yeniden denenir. ${whatToDo}`,
            }
          : {
              tone: "sky",
              icon: Clock,
              text: "Kontrol zamanı geldi",
              detail: `Son başarılı kontrol ${ago(lastAuto.last_checked_at, now)}; bir sonraki sayfa açılışında arka planda yeniden denenir.`,
            };

  const ageRatio = current ? Math.min(current.age_days, current.max_age_days + 1) : 0;

  return (
    <Card
      id="kur"
      title="Güncel kur ve otomatik güncelleme"
      icon={DollarSign}
      description="İşlemlerde önerilen USD/TRY kuru; her işlem kendi günündeki kuru sabitler, sonradan gelen kur geçmişi değiştirmez."
      className="mb-4 scroll-mt-20"
      padded={false}
    >
      <div className="grid grid-cols-1 divide-y divide-line md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:divide-x md:divide-y-0">
        {/* Güncel kur */}
        <div className="min-w-0 p-4">
          {currentError ? (
            <Alert tone="error" title="Güncel kur okunamadı">
              {currentError}
            </Alert>
          ) : current ? (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">USD/TRY · önerilen kur</p>
                {current.is_valid ? (
                  <Badge tone="green" icon={CheckCircle2}>
                    Geçerli
                  </Badge>
                ) : (
                  <Badge tone="amber" icon={AlertTriangle}>
                    Eski — işlem kaydedilmez
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-[32px] leading-none font-semibold text-ink tabular-nums">{fmtRate(current.rate)}</p>
              <p className="mt-1.5 text-[13px] text-ink-soft">{fxSourceLabel(current.source, current.rate_type)}</p>
              <dl className="mt-3 text-[13px]">
                <Row label="Kaynak tarihi">
                  {fmtDate(current.rate_date)}{" "}
                  <span className="text-xs font-normal text-ink-muted">
                    ({current.age_days === 0 ? "bugün" : `${fmtInt(current.age_days)} gün önce`})
                  </span>
                </Row>
                <Row label="Alınma zamanı">{fmtDateTime(current.fetched_at)}</Row>
                <Row label="Son kontrol">{currentRow ? fmtDateTime(currentRow.last_checked_at) : "—"}</Row>
                {currentRow?.note ? <Row label="Not">{currentRow.note}</Row> : null}
              </dl>
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
                  <span>Kur yaşı</span>
                  <span className="tabular-nums">
                    {fmtInt(current.age_days)} / en fazla {fmtInt(current.max_age_days)} gün
                  </span>
                </div>
                <ProgressBar
                  value={ageRatio}
                  max={Math.max(1, current.max_age_days)}
                  tone={current.is_valid ? "teal" : "amber"}
                  label="Kur yaşının izin verilen en fazla yaşa oranı"
                />
              </div>
            </>
          ) : (
            <Alert tone="warning" title="Kayıtlı kur yok">
              {isAdmin ? (
                <>
                  Otomatik kur alınamadıysa{" "}
                  <Link href="#manuel-kur" className="link">
                    manuel kur girin
                  </Link>
                  ; kur olmadan alış, üretim ve satış kaydedilemez.
                </>
              ) : (
                "Kur olmadan alış, üretim ve satış kaydedilemez; kur girişi için yöneticinize başvurun."
              )}
            </Alert>
          )}
        </div>

        {/* Otomatik güncelleme durumu */}
        <div className="min-w-0 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Otomatik güncelleme durumu</p>
            <Badge tone={status.tone} icon={status.icon}>
              {status.text}
            </Badge>
          </div>
          {status.tone === "amber" ? (
            <Alert tone="warning" className="mt-2">
              {status.detail}
              {attemptError ? (
                <span className="mt-1 block break-words">
                  <strong className="font-semibold">Son deneme hatası:</strong> {attemptError}
                </span>
              ) : null}
            </Alert>
          ) : (
            <p className="mt-2 text-[13px] text-ink-soft">{status.detail}</p>
          )}
          {settings ? (
            <dl className="mt-2 grid grid-cols-1 gap-x-6 text-[13px] xl:grid-cols-2">
              <div>
                <Row label="Birincil kaynak">{SOURCE_LONG[settings.fx_primary_source]}</Row>
                <Row label="Yedek kaynak">{SOURCE_LONG[settings.fx_primary_source === "TCMB" ? "FRANKFURTER" : "TCMB"]}</Row>
                <Row label="TCMB kur türü">{RATE_TYPE_LABEL[settings.fx_tcmb_rate_type]}</Row>
              </div>
              <div>
                <Row label="Yenileme sıklığı">Her {everyLabel(settings.fx_refresh_minutes)}</Row>
                <Row label="En fazla kur yaşı">{fmtInt(settings.fx_max_age_days)} gün</Row>
                <Row label="Son başarılı otomatik kur">
                  {lastAutoError ? (
                    <span className="text-chart-red">okunamadı</span>
                  ) : lastAuto ? (
                    <span title={fmtDateTime(lastAuto.last_checked_at)}>{ago(lastAuto.last_checked_at, now)}</span>
                  ) : (
                    <span className="font-normal text-ink-muted">henüz yok</span>
                  )}
                </Row>
              </div>
            </dl>
          ) : (
            <Alert tone="error" className="mt-2">
              Kur ayarları okunamadı.
            </Alert>
          )}
          {lastAuto ? (
            <p className="mt-2 text-xs text-ink-muted">
              Son otomatik kur: {fxSourceLabel(lastAuto.source, lastAuto.rate_type)} · {fmtDate(lastAuto.rate_date)} ·{" "}
              <span className="tabular-nums">{fmtRate(lastAuto.rate)}</span> (alınma {fmtDateTime(lastAuto.fetched_at)})
            </p>
          ) : null}
          {isAdmin ? (
            <ActionForm action={refreshFxNow} className="mt-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <SubmitButton size="sm" variant="secondary">
                  <RefreshCw aria-hidden />
                  Şimdi güncelle
                </SubmitButton>
                <span className="text-xs text-ink-muted">Birincil, erişilemezse yedek kaynaktan bugünün kurunu hemen almayı dener.</span>
              </div>
            </ActionForm>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
