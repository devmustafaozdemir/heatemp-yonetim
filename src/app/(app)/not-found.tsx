import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-xl rounded-lg border border-slate-200 bg-white p-6">
      <h1 className="text-lg font-semibold">Kayıt bulunamadı</h1>
      <p className="mt-1 text-sm text-slate-600">Aradığınız kayıt silinmiş veya hiç oluşturulmamış olabilir.</p>
      <Link href="/" className="link mt-3 inline-block text-sm">
        Dashboard&apos;a dön
      </Link>
    </div>
  );
}
