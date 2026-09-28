/** Ürün görseli, oturum kontrollü sunucu rotası üzerinden gösterilir (özel kova). */
export function productImageUrl(path: string): string {
  return `/urun-gorseli/${path.split("/").map(encodeURIComponent).join("/")}`;
}
