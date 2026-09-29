import { History, Info, PenLine, Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, FormField, SubmitButton } from "@/components/forms";
import { Alert, Card, ErrorState, FormSection } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtRate, todayTr } from "@/lib/format";
import { ensureFreshFx, suggestFx, type FxSuggestion } from "@/lib/fx/service";
import { load } from "@/lib/query";
import type { AppSettings } from "@/lib/types";
import { addManualRate, saveFxSettings } from "./actions";
import { FxStatusCard, type LastAutoRate } from "./_components/FxStatusCard";
import { nowMs } from "./_components/fx";
import { SettingsHeader } from "./_components/SettingsHeader";

export const metadata: Metadata = { title: "Ayarlar" };

export default async function SettingsPage() {
  const ctx = await requireMember();
  const sb = ctx.supabase;
  const isAdmin = ctx.role === "admin";
  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY);

  const [settingsRes, lastAutoRes, countRes, currentRes, manualRes, freshness] = await Promise.all([
    load(sb.from("app_settings").select("*").single<AppSettings>()),
    load(
      sb
        .from("fx_rates")
        .select("source, rate_type, rate, rate_date, fetched_at, last_checked_at")
        .neq("source", "MANUAL")
        .order("last_checked_at", { ascending: false })
        .limit(1)
        .maybeSingle<LastAutoRate>(),
    ),
    load(sb.from("fx_rates").select("id", { count: "exact", head: true })),
    suggestFx(ctx, null).then(
      (data) => ({ data, error: null as string | null }),
      (err: unknown) => ({ data: null as FxSuggestion | null, error: err instanceof Error ? err.message : String(err) }),
    ),
    load(
      sb
        .from("fx_rates")
        .select("id, rate, rate_date, fetched_at, note")
        .eq("source", "MANUAL")
        .order("fetched_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(4)
        .returns<{ id: number; rate: number; rate_date: string; fetched_at: string; note: string | null }[]>(),
    ),
    // Son otomatik denemenin hata nedeni (arka plan denemesi başarısızsa). Arka plan denemesi zaten düzen
    // (layout) tarafından planlanır; aynı sunucuda 5 dk içinde tekrar denenmez.
    ensureFreshFx(ctx).catch((err: unknown) => ({ warning: err instanceof Error ? err.message : String(err) })),
  ]);
  const current = currentRes.data;
  const currentRowRes = current
    ? await load(
        sb
          .from("fx_rates")
          .select("last_checked_at, note")
          .eq("id", current.id)
          .maybeSingle<{ last_checked_at: string; note: string | null }>(),
      )
    : null;
  const settings = settingsRes.data;
  const now = nowMs();

  return (
    <>
      <SettingsHeader active="kur" isAdmin={isAdmin} historyCount={countRes.count} />

      <FxStatusCard
        current={current}
        currentError={currentRes.error}
        currentRow={currentRowRes?.data ?? null}
        settings={settings}
        lastAuto={lastAutoRes.data}
        lastAutoError={lastAutoRes.error}
        lastAttemptError={freshness.warning}
        hasServiceKey={hasServiceKey}
        isAdmin={isAdmin}
        now={now}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-7">
          <Card
            title="Kur ayarları"
            icon={Settings2}
            description="Otomatik kurun hangi kaynaktan, ne sıklıkla alınacağı ve bir işlemde en fazla kaç günlük kur kullanılabileceği."
            className="h-full"
            footer={settings ? <span>Son değişiklik: {fmtDateTime(settings.updated_at)}</span> : undefined}
          >
            {settingsRes.error || !settings ? (
              <ErrorState message={settingsRes.error ?? "Ayar kaydı bulunamadı."} compact />
            ) : (
              <ActionForm action={saveFxSettings}>
                {!isAdmin ? (
                  <Alert tone="info" className="mb-4">
                    Salt okunur erişim: kur ayarlarını yalnız yönetici değiştirebilir.
                  </Alert>
                ) : null}
                <fieldset disabled={!isAdmin} className="grid min-w-0 grid-cols-1 gap-5">
                  <FormSection title="Kur kaynağı" description="Birincil kaynağa erişilemezse diğer kaynak otomatik olarak denenir.">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <FormField name="fx_primary_source" label="Birincil kur kaynağı" required>
                        <select className="input" name="fx_primary_source" defaultValue={settings.fx_primary_source} aria-required>
                          <option value="TCMB">TCMB (Merkez Bankası)</option>
                          <option value="FRANKFURTER">ECB referans (Frankfurter)</option>
                        </select>
                      </FormField>
                      <FormField name="fx_tcmb_rate_type" label="TCMB kur türü" required hint="Yalnız TCMB kurlarında kullanılır.">
                        <select className="input" name="fx_tcmb_rate_type" defaultValue={settings.fx_tcmb_rate_type} aria-required>
                          <option value="ForexBuying">Döviz alış</option>
                          <option value="ForexSelling">Döviz satış</option>
                        </select>
                      </FormField>
                    </div>
                  </FormSection>
                  <FormSection title="Güncelleme ve geçerlilik">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <FormField
                        name="fx_refresh_minutes"
                        label="Otomatik kontrol aralığı (dakika)"
                        required
                        hint="5–1440 dk. Kontrol, süre dolduktan sonraki ilk sayfa açılışında arka planda yapılır."
                      >
                        <input
                          className="input tabular-nums"
                          name="fx_refresh_minutes"
                          inputMode="numeric"
                          defaultValue={settings.fx_refresh_minutes}
                          aria-required
                        />
                      </FormField>
                      <FormField
                        name="fx_max_age_days"
                        label="Kur en fazla kaç gün eski olabilir"
                        required
                        hint="0–30 gün. Hafta sonu/tatil toleransı; daha eski kurla işlem kaydedilmez."
                      >
                        <input
                          className="input tabular-nums"
                          name="fx_max_age_days"
                          inputMode="numeric"
                          defaultValue={settings.fx_max_age_days}
                          aria-required
                        />
                      </FormField>
                    </div>
                  </FormSection>
                </fieldset>
                {isAdmin ? (
                  <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                    <SubmitButton>Kur ayarlarını kaydet</SubmitButton>
                    <span className="text-xs text-ink-muted">Değişiklik geçmiş işlemlerin kurunu değiştirmez.</span>
                  </div>
                ) : null}
              </ActionForm>
            )}
            <div className="mt-5 rounded-md bg-canvas/70 px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                <Info className="size-4 text-chart-sky" aria-hidden />
                Kur nasıl seçilir?
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed text-ink-soft marker:text-ink-muted">
                <li>
                  İşlem için, işlem tarihine en yakın (aynı gün veya önceki) tarihli kur önerilir; aynı tarihte birden çok kur varsa önce
                  birincil kaynak, sonra diğer otomatik kaynak, en son manuel kur gelir.
                </li>
                <li>Kurun tarihi işlem tarihinden en fazla ayarlanan gün kadar eski olabilir; daha eski kurla kayıt yapılmaz.</li>
                <li>
                  İşlemde kullanılan kur kayda sabitlenir; sonradan gelen kurlar veya ayar değişiklikleri geçmiş tutarları değiştirmez.
                </li>
              </ul>
            </div>
          </Card>
        </div>

        <div className="min-w-0 xl:col-span-5">
          <Card
            id="manuel-kur"
            title="Manuel kur"
            icon={PenLine}
            description="Otomatik kaynaklara erişilemediğinde veya belirli bir gün için kur girmek gerektiğinde."
            className="h-full scroll-mt-20"
            footer={
              <span>
                Aynı tarih için otomatik kur varsa işlemlerde önce otomatik kur önerilir.{" "}
                <Link href="/ayarlar/kur-gecmisi?kaynak=MANUAL" className="link">
                  <History className="mr-0.5 inline size-3.5 align-[-2px]" aria-hidden />
                  Manuel kur geçmişi
                </Link>
              </span>
            }
          >
            {!isAdmin ? (
              <Alert tone="info" className="mb-4">
                Salt okunur erişim: manuel kur girişi yalnız yönetici yetkisiyle yapılabilir.
              </Alert>
            ) : null}
            <ActionForm action={addManualRate} resetOnSuccess>
              <fieldset disabled={!isAdmin} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField name="rate" label="USD/TRY" required hint="1 USD karşılığı TL, ör. 41,2345">
                  <input
                    className="input tabular-nums"
                    name="rate"
                    inputMode="decimal"
                    placeholder="ör. 41,2345"
                    autoComplete="off"
                    aria-required
                  />
                </FormField>
                <FormField name="rate_date" label="Kur tarihi" required hint="Bugün veya geçmiş bir gün">
                  <input
                    className="input tabular-nums"
                    type="date"
                    name="rate_date"
                    defaultValue={todayTr()}
                    max={todayTr()}
                    aria-required
                  />
                </FormField>
                <FormField name="note" label="Kaynak / not" className="sm:col-span-2">
                  <input className="input" name="note" maxLength={300} placeholder="ör. banka kuru, fatura kuru" />
                </FormField>
              </fieldset>
              {isAdmin ? (
                <div className="mt-4">
                  <SubmitButton>Manuel kuru kaydet</SubmitButton>
                </div>
              ) : null}
            </ActionForm>
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">Son manuel girişler</p>
              {manualRes.error ? (
                <p className="text-xs text-chart-red">Okunamadı: {manualRes.error}</p>
              ) : (manualRes.data ?? []).length === 0 ? (
                <p className="text-xs text-ink-muted">Henüz manuel kur girilmedi.</p>
              ) : (
                <ul className="divide-y divide-dashed divide-line text-[13px]">
                  {(manualRes.data ?? []).map((m) => (
                    <li key={m.id} className="flex items-baseline justify-between gap-3 py-1.5">
                      <span className="min-w-0">
                        <span className="font-medium text-ink tabular-nums">{fmtDate(m.rate_date)}</span>
                        <span className="ml-1.5 text-xs text-ink-muted">{m.note ?? "not yok"}</span>
                      </span>
                      <span className="shrink-0 text-right tabular-nums">
                        <span className="font-medium text-ink">{fmtRate(m.rate)}</span>
                        <span className="block text-[11px] text-ink-muted">{fmtDateTime(m.fetched_at)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
