export default function DashboardLoading() {
  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 sm:px-6 dark:border-zinc-800">
        <div className="h-5 w-[100px] animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
        <div className="flex items-center gap-4">
          <div className="h-4 w-16 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-7 w-7 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-4 w-20 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-8 w-16 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        {/* Welcome zone skeleton */}
        <div className="mb-10">
          <div className="h-6 w-48 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          <div className="mt-3 flex items-center gap-4">
            <div className="h-4 w-16 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-4 w-28 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-4 w-16 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          </div>
        </div>

        {/* Your repos skeleton */}
        <div className="mb-10">
          <div className="mb-4 h-5 w-28 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="rounded-lg border border-zinc-200 border-l-[3px] border-l-[#86D5F4]/30 px-4 py-3 dark:border-zinc-800"
              >
                <div className="flex flex-col gap-2">
                  <div className="h-4 w-32 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
                  <div className="h-3 w-56 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
                  <div className="h-3 w-24 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent activity skeleton */}
        <div className="mb-10">
          <div className="mb-4 h-5 w-32 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-start gap-3 border-b border-zinc-100 py-3 dark:border-zinc-800/50"
            >
              <div className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
              <div className="flex-1">
                <div className="h-4 w-48 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
                <div className="mt-1.5 h-3 w-24 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
              </div>
              <div className="h-3 w-12 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
            </div>
          ))}
        </div>

        {/* Add repo section skeleton */}
        <div className="rounded-lg border border-dashed border-zinc-200 px-6 py-8 dark:border-zinc-700">
          <div className="flex flex-col items-center gap-3">
            <div className="h-5 w-36 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-4 w-64 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
            <div className="mt-2 h-10 w-40 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
          </div>
        </div>
      </main>
    </div>
  );
}
