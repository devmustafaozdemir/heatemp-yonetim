// Form girdilerini ayrıştırma. Türkçe klavyede ondalık ayırıcı virgüldür;
// "1.234,56", "1234,56" ve "1234.56" aynı değer olarak okunur.

export function parseDecimal(raw: FormDataEntryValue | string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim().replace(/\s|₺|\$/g, "");
  if (s === "") return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // Son görülen ayırıcı ondalık kabul edilir.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    s = s.replace(",", ".");
  } else if (hasDot && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.000" gibi binlik ayırıcılı tam sayı
    s = s.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return Number.NaN;
  return Number(s);
}

export function parseInteger(raw: FormDataEntryValue | string | null | undefined): number | null {
  const n = parseDecimal(raw);
  if (n === null) return null;
  if (!Number.isInteger(n)) return Number.NaN;
  return n;
}

export function str(raw: FormDataEntryValue | null | undefined): string {
  return raw === null || raw === undefined ? "" : String(raw).trim();
}

export function optionalStr(raw: FormDataEntryValue | null | undefined): string | null {
  const s = str(raw);
  return s === "" ? null : s;
}

export function isUuid(value: string | null | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}
