import { Building2, Eye, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import { ActionForm, FormField, SubmitButton } from "@/components/forms";
import { Alert, Badge, Card, EmptyState, ErrorState, FormSection, TableWrap } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { load } from "@/lib/query";
import type { AppSettings } from "@/lib/types";
import { saveGeneralSettings } from "../actions";
import { SettingsHeader } from "../_components/SettingsHeader";

export const metadata: Metadata = { title: "Genel ayarlar" };

interface AppUserRow {
  user_id: string;
  role: "admin" | "viewer";
  full_name: string | null;
  created_at: string;
}

export default async function GeneralSettingsPage() {
  const ctx = await requireMember();
  const sb = ctx.supabase;
  const isAdmin = ctx.role === "admin";

  const [settingsRes, usersRes, countRes] = await Promise.all([
    load(sb.from("app_settings").select("*").single<AppSettings>()),
    load(sb.from("app_users").select("user_id, role, full_name, created_at").order("created_at").returns<AppUserRow[]>()),
    load(sb.from("fx_rates").select("id", { count: "exact", head: true })),
  ]);
  const settings = settingsRes.data;
  const users = usersRes.data ?? [];

  return (
    <>
      <SettingsHeader active="genel" isAdmin={isAdmin} historyCount={countRes.count} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-6">
          <Card
            title="Genel"
            icon={Building2}
            description="Firma bilgisi ve gösterim tercihleri."
            className="h-full"
            footer={settings ? <span>Son değişiklik: {fmtDateTime(settings.updated_at)}</span> : undefined}
          >
            {settingsRes.error || !settings ? (
              <ErrorState message={settingsRes.error ?? "Ayar kaydı bulunamadı."} compact />
            ) : (
              <ActionForm action={saveGeneralSettings}>
                {!isAdmin ? (
                  <Alert tone="info" className="mb-4">
                    Salt okunur erişim: genel ayarları yalnız yönetici değiştirebilir.
                  </Alert>
                ) : null}
                <fieldset disabled={!isAdmin} className="grid min-w-0 grid-cols-1 gap-5">
                  <FormSection title="Firma">
                    <FormField name="company_name" label="Firma adı" required hint="En fazla 120 karakter.">
                      <input className="input" name="company_name" defaultValue={settings.company_name} maxLength={120} aria-required />
                    </FormField>
                  </FormSection>
                  <FormSection
                    title="Gösterim"
                    description="Tutarlar TL işlem günü değeriyle tutulur; USD yalnızca bilgi amaçlı çevrimdir."
                  >
                    <label className="flex items-start gap-2.5 rounded-md border border-line px-3 py-2.5 text-[13px] text-ink-soft has-[:checked]:border-brand-200 has-[:checked]:bg-brand-50/40">
                      <input
                        type="checkbox"
                        name="show_usd_info"
                        defaultChecked={settings.show_usd_info}
                        className="mt-0.5 size-4 accent-brand-600"
                      />
                      <span>
                        <span className="block font-medium text-ink">Kasa ekranında bilgi amaçlı USD karşılıklarını göster</span>
                        <span className="block text-xs text-ink-muted">
                          Satış günü kuruyla sabitlenmiş USD değerleri ciro ve brüt kâr yanında gösterilir.
                        </span>
                      </span>
                    </label>
                  </FormSection>
                </fieldset>
                {isAdmin ? (
                  <div className="mt-5 border-t border-line pt-4">
                    <SubmitButton>Genel ayarları kaydet</SubmitButton>
                  </div>
                ) : null}
              </ActionForm>
            )}
          </Card>
        </div>

        <div className="min-w-0 xl:col-span-6">
          <Card
            title="Kullanıcılar"
            icon={Users}
            description="Yönetici kayıt ekleyip değiştirebilir; görüntüleyici yalnız okur."
            padded={false}
            className="h-full"
            footer={
              <span>
                Yeni kullanıcı Supabase Auth panelinden oluşturulur ve <code className="code">app_users</code> tablosuna{" "}
                <code className="code">admin</code> veya <code className="code">viewer</code> rolüyle eklenir (README).
              </span>
            }
          >
            {usersRes.error ? (
              <ErrorState message={usersRes.error} compact />
            ) : users.length === 0 ? (
              <EmptyState title="Kullanıcı bulunamadı" compact />
            ) : (
              <TableWrap>
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Kullanıcı</th>
                      <th>Rol</th>
                      <th className="hidden sm:table-cell">Eklenme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.user_id}>
                        <td>
                          <span className="font-medium text-ink">
                            {u.full_name || (u.user_id === ctx.userId && ctx.email ? ctx.email : "Adsız kullanıcı")}
                          </span>
                          {u.user_id === ctx.userId ? <span className="ml-1.5 text-xs text-ink-muted">(siz)</span> : null}
                          <div className="font-mono text-[11px] break-all text-ink-muted">{u.user_id}</div>
                          <div className="mt-0.5 text-xs text-ink-muted sm:hidden">Eklenme: {fmtDate(u.created_at)}</div>
                        </td>
                        <td>
                          {u.role === "admin" ? (
                            <Badge tone="blue" icon={ShieldCheck}>
                              Yönetici
                            </Badge>
                          ) : (
                            <Badge tone="gray">Görüntüleyici</Badge>
                          )}
                        </td>
                        <td className="hidden whitespace-nowrap tabular-nums sm:table-cell">{fmtDate(u.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
            <dl className="grid grid-cols-1 gap-3 border-t border-line p-4 text-[13px] sm:grid-cols-2">
              <div>
                <dt className="flex items-center gap-1.5 font-medium text-ink">
                  <ShieldCheck className="size-4 text-chart-blue" aria-hidden />
                  Yönetici
                </dt>
                <dd className="mt-0.5 text-xs text-ink-muted">Tüm kayıtları ekler ve değiştirir; kur ve genel ayarları yönetir.</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 font-medium text-ink">
                  <Eye className="size-4 text-ink-muted" aria-hidden />
                  Görüntüleyici
                </dt>
                <dd className="mt-0.5 text-xs text-ink-muted">Tüm ekranları görür; kayıt ekleyemez, formlar salt okunurdur.</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
