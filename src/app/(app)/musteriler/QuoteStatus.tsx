import { Badge } from "@/components/ui";

export function QuoteStatusBadge({ status }: { status: "open" | "converted" | "cancelled" }) {
  if (status === "converted") return <Badge tone="green">Satışa dönüştü</Badge>;
  if (status === "cancelled") return <Badge>İptal</Badge>;
  return <Badge tone="blue">Açık</Badge>;
}
