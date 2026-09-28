import type { Metadata } from "next";
import { ActionForm, FormField, SubmitButton } from "@/components/forms";
import { fxSourceLabel } from "@/components/FxBadge";
import { Alert, Badge, Card, PageHeader, TableWrap } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtRate, todayTr } from "@/lib/format";
import { suggestFx } from "@/lib/fx/service";
import type { AppSettings, FxRateRow } from "@/lib/types";
import { addManualRate, refreshFxNow, saveSettings } from "./actions";

export const metadata: Metadata = { title: "Ayarlar" };

export default async function SettingsPage() {
  const ctx = await requireMember();
  const [{ data: settings }, { data: rates }, { data: users }, current] = await Promise.all([
    ctx.supabase.from("app_settings").select("*").single<AppSettings>(),
    ctx.supabase.from("fx_rates").select("*").order("rate_date", { ascending: false }).order("id", { ascending: false }).limit(30).returns<FxRateRow[]>(),
    ctx.supabase.from("app_users").select("user_id, role, full_name, created_at"),
    suggestFx(ctx, null).catch(() => null),
  ]);
  const isAdmin = ctx.role === "admin";
  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY);

  return (
    <>
      <PageHeader title="Ayarlar" description="Kur kaynağı ve temel gösterim ayarları." />

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Genel ve kur ayarları">
          {settings ? (
            <ActionForm action={saveSettings}>
              <fieldset disabled={!isAdmin} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField name="company_name" label="Firma adı" className="sm:col-span-2">
                  <input className="input" name="company_name" defaultValue={settings.company_name} />
                </FormField>
                <FormField name="fx_primary_source" label="Birincil kur kaynağı" hint="Erişilemezse diğer kaynak denenir">
                  <select className="input" name="fx_primary_source" defaultValue={settings.fx_primary_source}>
                    <option value="TCMB">TCMB (Merkez Bankası)</option>
                    <option value="FRANKFURTER">ECB referans (Frankfurter)</option>
                  </select>
                </FormField>
                <FormField name="fx_tcmb_rate_type" label="TCMB kur türü">
                  <select className="input" name="fx_tcmb_rate_type" defaultValue={settings.fx_tcmb_rate_type}>
                    <option value="ForexBuying">Döviz alış</option>
                    <option value="ForexSelling">Döviz satış</option>
                  </select>
                </FormField>
                <FormField name="fx_refresh_minutes" label="Otomatik kontrol aralığı (dk)">
                  <input className="input" name="fx_refresh_minutes" inputMode="numeric" defaultValue={settings.fx_refresh_minutes} />
                </FormField>
                <FormField
                  name="fx_max_age_days"
                  label="Kur en fazla kaç gün eski olabilir"
                  hint="Hafta sonu/tatil toleransı. Daha eski kurla işlem kaydedilmez."
                >
                  <input className="input" name="fx_max_age_days" inputMode="numeric" defaultValue={settings.fx_max_age_days} />
                </FormField>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" name="show_usd_info" defaultChecked={settings.show_usd_info} />
                  Kasa ekranında bilgi amaçlı USD karşılıklarını göster
                </label>
              </fieldset>
              {isAdmin ? (
                <div className="mt-4">
                  <SubmitButton>Kaydet</SubmitButton>
                </div>
              ) : null}
            </ActionForm>
          ) : (
            <Alert tone="error">Ayarlar okunamadı.</Alert>
          )}
        </Card>

        <Card title="Güncel kur" className="scroll-mt-20">
          <div id="kur" />
          {current ? (
            <p className="text-sm">
              <span className="text-lg font-semibold tabular-nums">{fmtRate(current.rate)}</span> USD/TRY —{" "}
              {fxSourceLabel(current.source, current.rate_type)}, {fmtDate(current.rate_date)} tarihli (son alım{" "}
              {fmtDateTime(current.fetched_at)}){" "}
              {current.is_valid ? <Badge tone="green">Geçerli</Badge> : <Badge tone="amber">Eski</Badge>}
            </p>
          ) : (
            <Alert tone="warning">Kayıtlı kur yok. Otomatik kur alınamadıysa manuel kur girin.</Alert>
          )}
          {!hasServiceKey ? (
            <div className="mt-3">
              <Alert tone="warning">
                Sunucuda <code>SUPABASE_SERVICE_ROLE_KEY</code> tanımlı değil; otomatik kur kaydedilemez. Manuel kur girişi
                kullanılabilir.
              </Alert>
            </div>
          ) : null}
          {isAdmin ? (
            <>
              <ActionForm action={refreshFxNow} className="mt-3">
                <SubmitButton size="sm" variant="secondary">
                  Kuru şimdi güncelle
                </SubmitButton>
              </ActionForm>
              <hr className="my-4 border-slate-100" />
              <h3 className="mb-2 text-sm font-medium">Manuel kur girişi</h3>
              <ActionForm action={addManualRate} resetOnSuccess>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <FormField name="rate" label="USD/TRY *">
                    <input className="input" name="rate" inputMode="decimal" placeholder="ör. 41,2345" />
                  </FormField>
                  <FormField name="rate_date" label="Kur tarihi *">
                    <input className="input" type="date" name="rate_date" defaultValue={todayTr()} max={todayTr()} />
                  </FormField>
                  <FormField name="note" label="Kaynak / not">
                    <input className="input" name="note" maxLength={300} placeholder="ör. banka kuru" />
                  </FormField>
                </div>
                <div className="mt-3">
                  <SubmitButton size="sm">Manuel kuru kaydet</SubmitButton>
                </div>
              </ActionForm>
            </>
          ) : null}
        </Card>
      </div>

      <Card title="Kur geçmişi (son 30 kayıt)" padded={false} className="mb-6">
        <TableWrap>
          <table className="table-base">
            <thead>
              <tr>
                <th>Kur tarihi</th>
                <th>Kaynak</th>
                <th className="num">USD/TRY</th>
                <th>Alındığı zaman</th>
                <th>Son kontrol</th>
                <th>Not</th>
              </tr>
            </thead>
            <tbody>
              {(rates ?? []).map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.rate_date)}</td>
                  <td>{fxSourceLabel(r.source, r.rate_type)}</td>
                  <td className="num">{fmtRate(r.rate)}</td>
                  <td className="text-xs">{fmtDateTime(r.fetched_at)}</td>
                  <td className="text-xs">{fmtDateTime(r.last_checked_at)}</td>
                  <td className="text-xs">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card title="Kullanıcılar">
        <p className="mb-3 text-sm text-slate-600">
          Tek firma / tek yönetici kullanımı için tasarlandı. Yeni kullanıcı Supabase Auth panelinden oluşturulur ve SQL ile{" "}
          <code>app_users</code> tablosuna <code>admin</code> veya <code>viewer</code> rolüyle eklenir (README).
        </p>
        <ul className="text-sm">
          {(users ?? []).map((u) => (
            <li key={u.user_id} className="flex gap-2 border-b border-slate-100 py-1">
              <span className="font-mono text-xs text-slate-500">{u.user_id}</span>
              <Badge tone={u.role === "admin" ? "orange" : "gray"}>{u.role === "admin" ? "Yönetici" : "Görüntüleyici"}</Badge>
              {u.user_id === ctx.userId ? <span className="text-xs text-slate-500">(siz)</span> : null}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
