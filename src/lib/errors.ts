// Veritabanı ve ağ hatalarını kullanıcıya gösterilecek Türkçe mesaja çevirir.
// Veritabanı fonksiyonlarımız zaten Türkçe mesaj üretir (RAISE EXCEPTION);
// burada kısıt ihlalleri ve teknik hatalar anlaşılır hâle getirilir.

interface DbErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

const UNIQUE_MESSAGES: Record<string, string> = {
  products_code_key: "Bu ürün kodu zaten kullanılıyor.",
  product_variants_code_key: "Bu varyant kodu zaten kullanılıyor (başka bir ürünün kodu da olabilir).",
  product_variants_product_id_name_key: "Bu ürünün aynı adlı bir varyantı zaten var.",
  raw_materials_code_key: "Bu malzeme kodu zaten kullanılıyor.",
  bom_items_variant_id_material_id_key: "Bu malzeme reçetede zaten var; miktarını düzenleyin.",
  customers_name_unique: "Bu isimde bir müşteri zaten kayıtlı.",
  quote_items_quote_id_variant_id_key: "Bu varyant teklifte zaten var; satırı düzenleyin.",
};

const CHECK_MESSAGES: Record<string, string> = {
  products_thresholds_order: "Stok eşikleri kritik ≤ minimum ≤ hedef sırasında olmalıdır.",
  product_variants_thresholds:
    "Varyant eşikleri ya hiç girilmemeli ya da üçü birlikte ve kritik ≤ minimum ≤ hedef sırasında girilmelidir.",
  product_variants_price_currency: "Varyant fiyatı girilirse para birimi de seçilmelidir (ve tersi).",
  quotes_validity: "Geçerlilik tarihi teklif tarihinden önce olamaz.",
  stock_layers_no_negative: "Stok eksiye düşemez.",
  material_balances_qty_check: "Hammadde stoğu eksiye düşemez.",
};

function isTurkishDomainMessage(message: string) {
  return /[çğıöşüÇĞİÖŞÜ]/.test(message) || /\b(zaten|yok|olmalı|bulunamadı|gerekir)\b/.test(message);
}

export function toUserMessage(error: unknown): string {
  if (!error) return "Beklenmeyen bir hata oluştu.";
  if (typeof error === "string") return error;

  const e = error as DbErrorLike & { name?: string };
  const message = e.message ?? "";

  if (e.name === "NotAuthorizedError") return message;

  switch (e.code) {
    case "23505": {
      const key = Object.keys(UNIQUE_MESSAGES).find((k) => message.includes(k) || e.details?.includes(k));
      return key ? UNIQUE_MESSAGES[key] : "Bu kayıt zaten mevcut (tekrarlanan değer).";
    }
    case "23503":
      return "Bu kayıt başka kayıtlarda (parti, satış, reçete vb.) kullanıldığı için silinemez veya değiştirilemez. Bunun yerine pasif yapabilirsiniz.";
    case "23514": {
      const key = Object.keys(CHECK_MESSAGES).find((k) => message.includes(k));
      return key ? CHECK_MESSAGES[key] : "Girilen değerlerden biri geçersiz (ör. negatif adet veya fiyat).";
    }
    case "23502":
      return "Zorunlu bir alan boş bırakıldı.";
    case "22P02":
    case "22003":
      return "Sayı veya tarih biçimi geçersiz.";
    case "42501":
      return isTurkishDomainMessage(message) ? message : "Bu işlem için yetkiniz yok.";
    case "PGRST301":
    case "PGRST302":
      return "Oturumunuz sona ermiş. Lütfen yeniden giriş yapın.";
    case "P0001":
      return message;
  }

  if (/row-level security/i.test(message)) return "Bu işlem için yetkiniz yok.";
  if (/fetch failed|network|ECONNREFUSED|Failed to fetch/i.test(message)) {
    return "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.";
  }
  if (message && isTurkishDomainMessage(message)) return message;
  return message ? `Beklenmeyen bir hata oluştu: ${message}` : "Beklenmeyen bir hata oluştu.";
}
