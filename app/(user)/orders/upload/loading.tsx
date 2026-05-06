export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-4 w-24 rounded bg-muted" />
      <div className="pb-4 border-b space-y-2">
        <div className="h-7 w-40 rounded bg-muted" />
        <div className="h-4 w-72 rounded bg-muted" />
      </div>
      <div className="rounded-lg border bg-surface-muted/40 p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-muted shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="h-3 w-56 rounded bg-muted" />
        </div>
        <div className="h-9 w-24 rounded-md bg-muted" />
      </div>
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div className="h-32 rounded-md bg-muted" />
        <div className="flex justify-end">
          <div className="h-9 w-24 rounded-md bg-muted" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-5 w-28 rounded bg-muted" />
        <div className="rounded-lg border bg-card divide-y">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-md bg-muted shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/2 rounded bg-muted" />
                <div className="h-3 w-2/3 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
