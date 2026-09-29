import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  CircleSlash,
  Factory,
  PackageMinus,
  RotateCcw,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/ui";
import type { MaterialMovement } from "@/lib/types";
import type { MaterialStockState } from "./types";

/** Malzeme stok durumu: renk + ikon + metin. Tanım v_material_list görünümündedir. */
export const MATERIAL_STATE: Record<MaterialStockState, { label: string; tone: BadgeTone; icon: LucideIcon; title: string }> = {
  out_used: {
    label: "Tükendi · reçetede",
    tone: "red",
    icon: AlertOctagon,
    title: "Stok yok ve en az bir aktif reçetede kullanılıyor",
  },
  short: {
    label: "Reçeteye yetersiz",
    tone: "amber",
    icon: AlertTriangle,
    title: "Stok var ama bir aktif reçetenin 1 adetlik ihtiyacını karşılamıyor",
  },
  out: { label: "Tükendi", tone: "gray", icon: CircleSlash, title: "Stok yok; aktif reçetede kullanılmıyor" },
  ok: { label: "Stokta", tone: "green", icon: CheckCircle2, title: "Stokta mevcut" },
};

export function MaterialStateBadge({ state }: { state: MaterialStockState }) {
  const s = MATERIAL_STATE[state];
  return (
    <Badge tone={s.tone} icon={s.icon} title={s.title}>
      {s.label}
    </Badge>
  );
}

export function KindBadge({ kind }: { kind: "raw" | "component" }) {
  return kind === "component" ? <Badge tone="blue">Komponent</Badge> : <Badge tone="gray">Hammadde</Badge>;
}

export type MovementType = MaterialMovement["movement_type"];

/** Hareket türlerinin Türkçe etiketleri ve URL anahtarları (?tur=…). */
export const MOVEMENT_META: Record<MovementType, { label: string; short: string; tone: BadgeTone; icon: LucideIcon; key: string }> = {
  purchase: { label: "Alış (stok girişi)", short: "Alış", tone: "green", icon: ArrowDownToLine, key: "alis" },
  production_consume: { label: "Üretim tüketimi", short: "Üretim tüketimi", tone: "amber", icon: Factory, key: "uretim" },
  production_return: { label: "Parti iptali iadesi", short: "İptal iadesi", tone: "blue", icon: Undo2, key: "iade" },
  write_off: { label: "Fire / sayım düşümü", short: "Fire / sayım", tone: "red", icon: PackageMinus, key: "fire" },
  purchase_reversal: { label: "Alış düzeltmesi / iptali", short: "Alış düzeltmesi", tone: "gray", icon: RotateCcw, key: "duzeltme" },
};

export const MOVEMENT_ORDER: MovementType[] = ["purchase", "production_consume", "production_return", "write_off", "purchase_reversal"];

export function movementTypeFromKey(key: string | undefined): MovementType | null {
  return MOVEMENT_ORDER.find((t) => MOVEMENT_META[t].key === key) ?? null;
}

export function MovementBadge({ type }: { type: MovementType }) {
  const m = MOVEMENT_META[type];
  return (
    <Badge tone={m.tone} icon={m.icon}>
      {m.short}
    </Badge>
  );
}

/** Kart listelerinde (mobil / tablet) etiketli değer: etiket, değer ve isteğe bağlı alt bilgi. */
export function ListValue({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-semibold break-words text-ink tabular-nums">{value}</dd>
      {hint ? <dd className="text-xs break-words text-ink-muted tabular-nums">{hint}</dd> : null}
    </div>
  );
}

/** Hammadde silme onayı açıklaması (liste ve detayda aynı). */
export const DELETE_MATERIAL_TEXT =
  "Malzeme; tüm alış, fire ve düzeltme hareketleri, stok bakiyesi ve reçetelerdeki satırlarıyla birlikte kalıcı olarak silinir. Üretim partisinde kullanıldıysa silinemez; bunun yerine pasif yapın. Bu işlem geri alınamaz.";
