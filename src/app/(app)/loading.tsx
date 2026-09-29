/** Sayfa yüklenirken iskelet: başlık, özet kartı ızgarası, iki grafik kartı ve tablo. */
function Bar({ className }: { className: string }) {
  return <div className={`rounded bg-line-strong ${className}`} />;
}

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <span className="sr-only">Yükleniyor…</span>

      {/* Başlık */}
      <div className="mb-5 space-y-2">
        <Bar className="h-3 w-32" />
        <Bar className="h-6 w-56" />
        <Bar className="h-3.5 w-full max-w-md" />
      </div>

      {/* Özet kartları */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card flex items-start justify-between gap-3 p-4">
            <div className="min-w-0 flex-1 space-y-3">
              <Bar className="h-3 w-24" />
              <Bar className="h-6 w-36" />
              <Bar className="h-3 w-40 max-w-full" />
            </div>
            <div className="size-12 shrink-0 rounded-md bg-line-strong" />
          </div>
        ))}
      </div>

      {/* Grafik kartları */}
      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="card min-w-0 xl:col-span-7">
          <div className="border-b border-line px-4 py-3">
            <Bar className="h-4 w-40" />
          </div>
          <div className="flex h-64 items-end gap-2 p-4">
            {[40, 65, 30, 80, 55, 70, 45, 90, 60, 35, 75, 50].map((h, i) => (
              <div key={i} className="flex-1 rounded-t bg-line-strong/70" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
        <div className="card min-w-0 xl:col-span-5">
          <div className="border-b border-line px-4 py-3">
            <Bar className="h-4 w-32" />
          </div>
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="space-y-1.5">
                <Bar className="h-3 w-1/3" />
                <Bar className="h-3" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tablo */}
      <div className="card">
        <div className="border-b border-line px-4 py-3">
          <Bar className="h-4 w-36" />
        </div>
        <div className="divide-y divide-line">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Bar className="h-3 w-1/4" />
              <Bar className="h-3 w-1/6" />
              <Bar className="ml-auto h-3 w-1/6" />
              <Bar className="h-3 w-1/12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
