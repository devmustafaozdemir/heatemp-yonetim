export function productImageUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/product-images/${path.split("/").map(encodeURIComponent).join("/")}`;
}
