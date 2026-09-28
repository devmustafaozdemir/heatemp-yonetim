// Ortam değişkenleri. NEXT_PUBLIC_* değerleri tarayıcıya gömülür; service role
// anahtarı yalnızca sunucuda okunur (bkz. supabase/admin.ts).
export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL tanımlı değil. .env.local dosyasını kontrol edin.");
  }
  return url;
}

export function supabasePublicKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (veya NEXT_PUBLIC_SUPABASE_ANON_KEY) tanımlı değil. .env.local dosyasını kontrol edin.",
    );
  }
  return key;
}
