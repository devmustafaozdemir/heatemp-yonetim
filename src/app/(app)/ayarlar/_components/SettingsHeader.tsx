import { Eye } from "lucide-react";
import { Badge, PageHeader } from "@/components/ui";
import { LinkTabs } from "@/components/ui/list";

export type SettingsTab = "kur" | "gecmis" | "genel";

const CRUMB: Record<SettingsTab, string | null> = { kur: null, gecmis: "Kur geçmişi", genel: "Genel" };

/**
 * Ayarlar sayfalarının ortak başlığı ve bölüm sekmeleri. Her bölüm kendi adresindedir
 * (/ayarlar, /ayarlar/kur-gecmisi, /ayarlar/genel); böylece filtre/sayfalama bağlantıları bölümü korur.
 */
export function SettingsHeader({ active, isAdmin, historyCount }: { active: SettingsTab; isAdmin: boolean; historyCount: number | null }) {
  const crumb = CRUMB[active];
  return (
    <>
      <PageHeader
        // Başlık metin olarak verilmez: alt bölümlerde breadcrumb "Ayarlar › Kur geçmişi" biçiminde kalır.
        title={<span>Ayarlar</span>}
        crumbs={crumb ? [{ label: crumb }] : undefined}
        meta={
          !isAdmin ? (
            <Badge tone="sky" icon={Eye}>
              Salt okunur
            </Badge>
          ) : undefined
        }
        description="USD/TRY kur kaynağı ve otomatik güncelleme, manuel kur girişi, kur geçmişi ve genel uygulama ayarları."
      />
      <div className="mb-4">
        <LinkTabs
          active={active}
          tabs={[
            { key: "kur", label: "Kur ayarları", href: "/ayarlar" },
            { key: "gecmis", label: "Kur geçmişi", href: "/ayarlar/kur-gecmisi", count: historyCount },
            { key: "genel", label: "Genel", href: "/ayarlar/genel" },
          ]}
        />
      </div>
    </>
  );
}
