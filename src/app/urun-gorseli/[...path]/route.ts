import { getAuthContext } from "@/lib/auth";

// Özel "product-images" kovasındaki görseli oturum sahibinin yetkisiyle sunar.
// Storage RLS'i yalnızca uygulama üyelerinin okumasına izin verir.
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const ctx = await getAuthContext();
  if (!ctx?.role) return new Response("Yetkisiz", { status: 401 });
  const objectPath = path.map(decodeURIComponent).join("/");
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(objectPath)) {
    return new Response("Geçersiz yol", { status: 400 });
  }
  const { data, error } = await ctx.supabase.storage.from("product-images").download(objectPath);
  if (error || !data) return new Response("Görsel bulunamadı", { status: 404 });
  return new Response(data, {
    headers: {
      "Content-Type": data.type || "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
