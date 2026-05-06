export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-pulse">
      <div className="h-4 w-24 rounded bg-muted" />
      <div className="pb-4 border-b flex items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <div className="h-7 w-2/3 rounded bg-muted" />
          <div className="h-3 w-40 rounded bg-muted" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-6 w-20 rounded-full bg-muted" />
          <div className="h-9 w-32 rounded-md bg-muted" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card">
            <div className="h-11 px-5 border-b flex items-center">
              <div className="h-4 w-24 rounded bg-muted" />
            </div>
            <div className="p-5 space-y-3">
              {Array.from({ length: 4 }).map((__, j) => (
                <div key={j} className="grid grid-cols-[90px_1fr] gap-3">
                  <div className="h-3 w-16 rounded bg-muted" />
                  <div className="h-3 w-3/4 rounded bg-muted" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border bg-card">
        <div className="h-11 px-5 border-b flex items-center">
          <div className="h-4 w-32 rounded bg-muted" />
        </div>
        <div className="divide-y">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-5 h-12 flex items-center gap-4">
              <div className="h-3 w-6 rounded bg-muted" />
              <div className="h-3 w-20 rounded bg-muted" />
              <div className="h-3 flex-1 rounded bg-muted" />
              <div className="h-3 w-16 rounded bg-muted" />
              <div className="h-3 w-20 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
