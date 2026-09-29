import { CheckCircle2, History, LineChart } from "lucide-react";
import type { Metadata } from "next";
import { fxSourceLabel } from "@/components/FxBadge";
import { Alert, Badge, Card, EmptyState, ErrorState, TableWrap, type BadgeTone } from "@/components/ui";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { Pagination, SortTh } from "@/components/ui/list";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtInt, fmtNum, fmtRate, pctChange, todayTr } from "@/lib/format";
import { suggestFx, type FxSuggestion } from "@/lib/fx/service";
import { isoDateOrNull, parseListParams, type SearchParams } from "@/lib/list-params";
import { addDays } from "@/lib/period";
import { load } from "@/lib/query";
import type { AppSettings, FxRateRow } from "@/lib/types";
import { effectiveDailyRates, RATE_TYPE_LABEL, SOURCE_NAME } from "../_components/fx";
import { FxTrendChart } from "../_components/FxTrendChart";
import { SettingsHeader } from "../_components/SettingsHeader";

export const metadata: Metadata = { title: "Kur geçmişi" };

const BASE = "/ayarlar/kur-gecmisi";
const SOURCES = ["TCMB", "FRANKFURTER", "MANUAL"] as const;
const TYPES = ["ForexBuying", "ForexSelling", "Reference", "Manual"] as const;
const SOURCE_TONE: Record<string, BadgeTone> = { TCMB: "blue", FRANKFURTER: "violet", MANUAL: "amber" };
const WINDOW_DAYS = 90;

export default async function FxHistoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireMember();
  const sb = ctx.supabase;
  const lp = parseListParams(await searchParams, {
    sortable: ["rate_date", "rate", "fetched_at", "last_checked_at"],
    defaultSort: "rate_date",
    defaultDir: "desc",
  });
  const v = lp.values;
  const kaynak = (SOURCES as readonly string[]).includes(v.kaynak) ? v.kaynak : null;
  const tur = (TYPES as readonly string[]).includes(v.tur) ? v.tur : null;
  const bas = isoDateOrNull(v.bas);
  const bit = isoDateOrNull(v.bit);
  const today = todayTr();
  const since = addDays(today, -(WINDOW_DAYS - 1));

  let query = sb.from("fx_rates").select("id, rate, rate_date, source, rate_type, fetched_at, last_checked_at, note", { count: "exact" });
  if (kaynak) query = query.eq("source", kaynak);
  if (tur) query = query.eq("rate_type", tur);
  if (bas) query = query.gte("rate_date", bas);
  if (bit) query = query.lte("rate_date", bit);

  const [listRes, totalRes, windowRes, settingsRes, currentRes] = await Promise.all([
    load(
      query
        .order(lp.sort!, { ascending: lp.dir === "asc" })
        .order("id", { ascending: false })
        .range(lp.from, lp.to)
        .returns<FxRateRow[]>(),
    ),
    load(sb.from("fx_rates").select("id", { count: "exact", head: true })),
    load(
      sb
        .from("fx_rates")
        .select("id, rate, rate_date, source, rate_type, fetched_at, last_checked_at, note")
        .gte("rate_date", since)
        .lte("rate_date", today)
        .order("rate_date")
        .order("id")
        .limit(2000)
        .returns<FxRateRow[]>(),
    ),
    load(
      sb
        .from("app_settings")
        .select("fx_primary_source, fx_tcmb_rate_type")
        .single<Pick<AppSettings, "fx_primary_source" | "fx_tcmb_rate_type">>(),
    ),
    suggestFx(ctx, null).then(
      (data) => ({ data, error: null as string | null }),
      (err: unknown) => ({ data: null as FxSuggestion | null, error: err instanceof Error ? err.message : String(err) }),
    ),
  ]);

  const current = currentRes.data;
  // Ayar okunamazsa grafik varsayılan öncelikle (TCMB · döviz alış) çizilir; bu durum kartta açıkça yazılır.
  const settings = settingsRes.data ?? { fx_primary_source: "TCMB" as const, fx_tcmb_rate_type: "ForexBuying" as const };
  const effective = windowRes.data ? effectiveDailyRates(windowRes.data, settings) : [];
  const points = effective.map((e) => ({ date: e.date, rate: e.rate, sourceLabel: fxSourceLabel(e.source, e.rate_type) }));
  const firstPt = effective[0];
  const lastPt = effective.at(-1);
  const minPt = effective.reduce<(typeof effective)[number] | null>((m, e) => (!m || e.rate < m.rate ? e : m), null);
  const maxPt = effective.reduce<(typeof effective)[number] | null>((m, e) => (!m || e.rate > m.rate ? e : m), null);
  const change = firstPt && lastPt && firstPt !== lastPt ? pctChange(lastPt.rate, firstPt.rate) : null;
  const rows = listRes.data ?? [];

  return (
    <>
      <SettingsHeader active="gecmis" isAdmin={ctx.role === "admin"} historyCount={totalRes.count} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          <Card
            title="Kayıtlı kurlar"
            icon={History}
            description="Otomatik alınan ve manuel girilen tüm USD/TRY kurları."
            padded={false}
            className="h-full"
          >
            <ListToolbar
              basePath={BASE}
              values={v}
              total={listRes.error ? null : (listRes.count ?? 0)}
              noun="kur kaydı"
              filters={[
                { key: "kaynak", label: "Kaynak", options: SOURCES.map((s) => ({ value: s, label: SOURCE_NAME[s] })) },
                { key: "tur", label: "Tür", options: TYPES.map((t) => ({ value: t, label: RATE_TYPE_LABEL[t] })) },
              ]}
              dateRange={{ label: "Kur tarihi" }}
            />
            {currentRes.error ? (
              <div className="border-b border-line px-4 py-2.5">
                <Alert tone="warning">
                  Kullanımdaki kur belirlenemedi ({currentRes.error}); &ldquo;Kullanımda&rdquo; rozeti gösterilemiyor.
                </Alert>
              </div>
            ) : null}
            {listRes.error ? (
              <ErrorState message={listRes.error} />
            ) : rows.length === 0 ? (
              <EmptyState title="Kayıt bulunamadı">Seçilen filtrelere uyan kur kaydı yok.</EmptyState>
            ) : (
              <TableWrap>
                <table className="table-base">
                  <thead>
                    <tr>
                      <SortTh label="Kur tarihi" column="rate_date" sort={lp.sort} dir={lp.dir} basePath={BASE} values={v} />
                      <SortTh label="USD/TRY" column="rate" sort={lp.sort} dir={lp.dir} basePath={BASE} values={v} align="right" />
                      <th>Kaynak</th>
                      <th className="hidden sm:table-cell">Tür</th>
                      <SortTh
                        label="Alınma · son kontrol"
                        column="fetched_at"
                        sort={lp.sort}
                        dir={lp.dir}
                        basePath={BASE}
                        values={v}
                        title="Kaydın alındığı / girildiği zaman ve kaynağın aynı kuru en son doğruladığı zaman"
                      />
                      <th>Not</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const inUse = current?.id === r.id;
                      const rechecked = new Date(r.last_checked_at).getTime() - new Date(r.fetched_at).getTime() > 60_000;
                      return (
                        <tr key={r.id}>
                          <td className="whitespace-nowrap">
                            <span className="font-medium text-ink tabular-nums">{fmtDate(r.rate_date)}</span>
                            {inUse ? (
                              <div className="mt-0.5">
                                <Badge tone="green" icon={CheckCircle2} title="Bugünkü işlemlerde önerilen kur">
                                  Kullanımda
                                </Badge>
                              </div>
                            ) : null}
                          </td>
                          <td className="num font-medium text-ink">{fmtRate(r.rate)}</td>
                          <td>
                            <Badge tone={SOURCE_TONE[r.source] ?? "gray"}>{SOURCE_NAME[r.source] ?? r.source}</Badge>
                            <div className="mt-0.5 text-xs whitespace-nowrap text-ink-muted sm:hidden">
                              {RATE_TYPE_LABEL[r.rate_type] ?? r.rate_type}
                            </div>
                          </td>
                          <td className="hidden whitespace-nowrap text-ink-soft sm:table-cell">
                            {RATE_TYPE_LABEL[r.rate_type] ?? r.rate_type}
                          </td>
                          <td className="text-xs whitespace-nowrap">
                            <span className="text-ink-soft tabular-nums">{fmtDateTime(r.fetched_at)}</span>
                            {rechecked ? (
                              <div className="text-ink-muted tabular-nums">son kontrol {fmtDateTime(r.last_checked_at)}</div>
                            ) : null}
                          </td>
                          <td className="max-w-64 text-xs break-words text-ink-soft">
                            {r.note ?? <span className="text-ink-muted">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            )}
            {listRes.count ? (
              <Pagination basePath={BASE} values={v} page={lp.page} pageSize={lp.pageSize} total={listRes.count} noun="kayıt" />
            ) : null}
          </Card>
        </div>

        {/* Dar ekranda grafik tablonun üstünde (uzun tabloyu kaydırmadan görülsün); xl'de sağ sütunda. */}
        <div className="order-first min-w-0 xl:order-none xl:col-span-4">
          <Card
            className="xl:sticky xl:top-[72px]"
            title="USD/TRY seyri"
            icon={LineChart}
            description={`Son ${WINDOW_DAYS} gün · her gün için işlemlerde önerilen kur`}
            footer={<span>Öncelik: birincil kaynak, sonra diğer otomatik kaynak, en son manuel kur (aynı gün için).</span>}
          >
            {windowRes.error ? (
              <ErrorState message={windowRes.error} compact />
            ) : (
              <>
                {settingsRes.error ? (
                  <Alert tone="warning" className="mb-3">
                    Kur ayarları okunamadı ({settingsRes.error}); öncelik varsayılan olarak TCMB döviz alış kuruyla hesaplandı.
                  </Alert>
                ) : null}
                <FxTrendChart points={points} label={`Son ${WINDOW_DAYS} günün günlük önerilen USD/TRY kuru`} />
                {lastPt && firstPt ? (
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px] md:grid-cols-4 xl:grid-cols-2">
                    <div className="rounded-md border border-line px-3 py-2">
                      <dt className="text-xs text-ink-muted">Son kur ({fmtDate(lastPt.date)})</dt>
                      <dd className="mt-0.5 font-semibold text-ink tabular-nums">{fmtRate(lastPt.rate)}</dd>
                    </div>
                    <div className="rounded-md border border-line px-3 py-2">
                      <dt className="text-xs text-ink-muted">Dönem değişimi</dt>
                      <dd className="mt-0.5 font-semibold text-ink tabular-nums">
                        {change === null ? "—" : `${change > 0 ? "+" : change < 0 ? "−" : ""}%${fmtNum(Math.abs(change), 2)}`}
                      </dd>
                      <dd className="text-[11px] text-ink-muted">{fmtDate(firstPt.date)} kuruna göre</dd>
                    </div>
                    <div className="rounded-md border border-line px-3 py-2">
                      <dt className="text-xs text-ink-muted">En düşük</dt>
                      <dd className="mt-0.5 font-semibold text-ink tabular-nums">{fmtRate(minPt?.rate)}</dd>
                      <dd className="text-[11px] text-ink-muted">{fmtDate(minPt?.date)}</dd>
                    </div>
                    <div className="rounded-md border border-line px-3 py-2">
                      <dt className="text-xs text-ink-muted">En yüksek</dt>
                      <dd className="mt-0.5 font-semibold text-ink tabular-nums">{fmtRate(maxPt?.rate)}</dd>
                      <dd className="text-[11px] text-ink-muted">{fmtDate(maxPt?.date)}</dd>
                    </div>
                  </dl>
                ) : null}
                <p className="mt-3 text-xs text-ink-muted">{fmtInt(points.length)} gün için kayıtlı kur var.</p>
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
