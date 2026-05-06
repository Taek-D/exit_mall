export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-40 rounded bg-muted" />
        <div className="h-4 w-56 rounded bg-muted" />
      </div>
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="border-b flex gap-4 px-4 h-11 items-center">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-4 w-16 rounded bg-muted" />
          ))}
        </div>
        <div className="divide-y">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-11 px-4 flex items-center gap-4">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-4 w-20 rounded bg-muted" />
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-4 w-16 rounded bg-muted ml-auto" />
              <div className="h-5 w-12 rounded-full bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
