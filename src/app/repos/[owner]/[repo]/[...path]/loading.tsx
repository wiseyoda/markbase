export default function ViewerLoading() {
  return (
    <div className="flex flex-1 flex-col">
      {/* Breadcrumb bar */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:px-8">
        <div className="h-4 w-48 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-3 w-20 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
      </div>

      {/* Content area */}
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8">
        {/* h1 */}
        <div className="h-8 w-3/5 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />

        {/* Paragraph block 1 */}
        <div className="mt-6 flex flex-col gap-2.5">
          <div className="h-4 w-full animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-4 w-11/12 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-4 w-4/5 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
        </div>

        {/* Paragraph block 2 */}
        <div className="mt-6 flex flex-col gap-2.5">
          <div className="h-4 w-full animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-4 w-10/12 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-4 w-9/12 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
        </div>

        {/* Code block */}
        <div className="mt-6 h-32 w-full animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />

        {/* Paragraph block 3 */}
        <div className="mt-6 flex flex-col gap-2.5">
          <div className="h-4 w-full animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-4 w-11/12 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-4 w-4/5 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-4 w-7/12 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}
