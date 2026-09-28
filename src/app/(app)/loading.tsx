export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-6 w-48 rounded bg-slate-200" />
      <div className="h-4 w-80 rounded bg-slate-100" />
      <div className="h-64 rounded-lg bg-slate-100" />
      <span className="sr-only">Yükleniyor…</span>
    </div>
  );
}
