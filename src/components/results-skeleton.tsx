export function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse border border-line bg-panel p-5" style={{ animationDelay: `${i * 150}ms` }}>
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="h-4 w-5 bg-line" />
              <div>
                <div className="h-5 w-24 bg-line" />
                <div className="mt-2 h-3 w-40 bg-line" />
                <div className="mt-4 h-3 w-72 bg-line" />
              </div>
            </div>
            <div className="h-8 w-16 bg-line" />
          </div>
          <div className="mt-6 grid grid-cols-5 gap-8">
            {[0, 1, 2, 3, 4].map((j) => (
              <div key={j} className="h-6 bg-line" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
