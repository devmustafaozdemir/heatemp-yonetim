import type { Product, ProductVariant, Simulation, VariantOverview, VariantView } from "@/lib/types";

/** Varyant sayfasının sekmelere aktardığı ortak veriler. */
export interface VariantPageData {
  product: Product;
  variant: ProductVariant;
  effective: VariantView;
  overview: VariantOverview | null;
  overviewError: string | null;
  sim: Simulation | null;
  simError: string | null;
}
