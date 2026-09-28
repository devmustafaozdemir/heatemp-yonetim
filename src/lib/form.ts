import { isIsoDate, isUuid, parseDecimal, parseInteger, str } from "@/lib/parse";

export interface ActionState {
  ok: boolean;
  message: string | null;
  fieldErrors?: Record<string, string>;
  redirectTo?: string;
  data?: Record<string, unknown>;
}

export const initialActionState: ActionState = { ok: false, message: null };

export class ValidationError extends Error {
  constructor(readonly fieldErrors: Record<string, string>) {
    super("Lütfen işaretli alanları düzeltin.");
  }
}

/** Form alanlarını Türkçe hata mesajlarıyla doğrular. */
export class FormReader {
  readonly errors: Record<string, string> = {};
  constructor(private readonly fd: FormData) {}

  private fail(name: string, message: string) {
    if (!this.errors[name]) this.errors[name] = message;
  }

  text(name: string, label: string, opts: { required?: boolean; max?: number } = {}): string | null {
    const v = str(this.fd.get(name));
    if (!v) {
      if (opts.required) this.fail(name, `${label} zorunludur.`);
      return null;
    }
    if (opts.max && v.length > opts.max) this.fail(name, `${label} en fazla ${opts.max} karakter olabilir.`);
    return v;
  }

  decimal(
    name: string,
    label: string,
    opts: { required?: boolean; min?: number; positive?: boolean } = {},
  ): number | null {
    const v = parseDecimal(this.fd.get(name));
    if (v === null) {
      if (opts.required) this.fail(name, `${label} zorunludur.`);
      return null;
    }
    if (Number.isNaN(v)) {
      this.fail(name, `${label} geçerli bir sayı olmalıdır.`);
      return null;
    }
    if (opts.positive && v <= 0) this.fail(name, `${label} sıfırdan büyük olmalıdır.`);
    if (opts.min !== undefined && v < opts.min) this.fail(name, `${label} en az ${opts.min} olmalıdır.`);
    return v;
  }

  int(name: string, label: string, opts: { required?: boolean; min?: number; positive?: boolean } = {}): number | null {
    const v = parseInteger(this.fd.get(name));
    if (v === null) {
      if (opts.required) this.fail(name, `${label} zorunludur.`);
      return null;
    }
    if (Number.isNaN(v)) {
      this.fail(name, `${label} tam sayı olmalıdır.`);
      return null;
    }
    if (opts.positive && v <= 0) this.fail(name, `${label} sıfırdan büyük olmalıdır.`);
    if (opts.min !== undefined && v < opts.min) this.fail(name, `${label} en az ${opts.min} olmalıdır.`);
    return v;
  }

  date(name: string, label: string, opts: { required?: boolean } = {}): string | null {
    const v = str(this.fd.get(name));
    if (!v) {
      if (opts.required) this.fail(name, `${label} zorunludur.`);
      return null;
    }
    if (!isIsoDate(v)) {
      this.fail(name, `${label} geçerli bir tarih olmalıdır.`);
      return null;
    }
    return v;
  }

  id(name: string, label: string, opts: { required?: boolean } = { required: true }): string | null {
    const v = str(this.fd.get(name));
    if (!v) {
      if (opts.required) this.fail(name, `${label} seçilmelidir.`);
      return null;
    }
    if (!isUuid(v)) {
      this.fail(name, `${label} geçersiz.`);
      return null;
    }
    return v;
  }

  bigintId(name: string, label: string): number | null {
    const v = parseInteger(this.fd.get(name));
    if (v === null || Number.isNaN(v) || v <= 0) {
      this.fail(name, `${label} seçilmelidir.`);
      return null;
    }
    return v;
  }

  oneOf<T extends string>(name: string, label: string, values: readonly T[], fallback?: T): T | null {
    const v = str(this.fd.get(name)) as T;
    if (!v && fallback) return fallback;
    if (!values.includes(v)) {
      this.fail(name, `${label} seçilmelidir.`);
      return null;
    }
    return v;
  }

  bool(name: string): boolean {
    const v = str(this.fd.get(name));
    return v === "on" || v === "true" || v === "1";
  }

  requestId(): string | null {
    const v = str(this.fd.get("request_id"));
    return isUuid(v) ? v : null;
  }

  assertValid() {
    if (Object.keys(this.errors).length > 0) throw new ValidationError(this.errors);
  }
}
