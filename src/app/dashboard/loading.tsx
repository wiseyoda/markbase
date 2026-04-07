export default function DashboardLoading() {
  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-4 dark:border-zinc-800 sm:px-6">
        <div className="h-5 w-[100px] animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
        <div className="flex items-center gap-4">
          <div className="h-4 w-16 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-4 w-20 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-8 w-16 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        {/* Synced repos section */}
        <div className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <div className="h-6 w-32 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="h-14 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800" />
            <div className="h-14 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800" />
          </div>
        </div>

        {/* All repositories section */}
        <div className="mb-6 flex items-center justify-between">
          <div className="h-6 w-40 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
        </div>

        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-zinc-200 px-5 py-4 dark:border-zinc-800"
            >
              <div className="flex flex-col gap-3">
                <div className="h-5 w-36 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
                <div className="h-4 w-64 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
                <div className="h-3 w-24 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
