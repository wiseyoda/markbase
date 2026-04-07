import { auth, signIn } from "@/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 flex-col">
        {/* Hero */}
        <div className="mx-auto w-full max-w-6xl px-6 pt-16 sm:px-8 sm:pt-24 lg:pt-32">
          <div className="max-w-2xl max-lg:mx-auto max-lg:text-center">
            <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
              markbase
            </h1>
            <p className="mt-4 max-w-lg text-lg text-zinc-500 max-lg:mx-auto sm:text-xl dark:text-zinc-400">
              Browse, share, and discuss your markdown files across GitHub repos.
            </p>
            <form
              action={async () => {
                "use server";
                await signIn("github", { redirectTo: "/dashboard" });
              }}
            >
              <button
                type="submit"
                className="mt-8 inline-flex items-center gap-3 rounded-lg bg-zinc-900 px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <GitHubIcon />
                Sign in with GitHub
              </button>
            </form>
            <div className="mt-6">
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* Product preview */}
        <div className="mx-auto w-full max-w-6xl px-6 mt-16 sm:mt-24 sm:px-8 animate-fade-in-up">
          <ProductMockup />
        </div>

        {/* Features */}
        <div className="mx-auto w-full max-w-4xl px-6 mt-16 sm:mt-24 sm:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-12">
            <Feature
              title="Beautiful rendering"
              description="Typography-first markdown with syntax highlighting, tables, and task lists."
              accent="border-[#86D5F4]"
            />
            <Feature
              title="Share anything"
              description="Send a file, folder, or entire repo. Control access with expiring links."
              accent="border-[#86D5F4]/60"
            />
            <Feature
              title="Inline comments"
              description="Select any text and leave a comment. Threaded discussions that stay anchored."
              accent="border-[#86D5F4]/30"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 pb-12 text-center sm:mt-24">
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            Built for teams who think in markdown.
          </p>
        </div>
      </main>
    </div>
  );
}

function Feature({
  title,
  description,
  accent,
}: {
  title: string;
  description: string;
  accent?: string;
}) {
  return (
    <div className={accent ? `border-l-2 pl-4 ${accent}` : ""}>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {description}
      </p>
    </div>
  );
}

function ProductMockup() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-zinc-200 shadow-2xl dark:border-zinc-800"
    >
      {/* Browser chrome */}
      <div className="flex h-10 items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 dark:border-zinc-800 dark:bg-zinc-900">
        <span className="h-3 w-3 rounded-full bg-red-400" />
        <span className="h-3 w-3 rounded-full bg-yellow-400" />
        <span className="h-3 w-3 rounded-full bg-green-400" />
      </div>

      {/* App body */}
      <div className="flex min-h-[320px] bg-white dark:bg-zinc-950">
        {/* Sidebar */}
        <div className="hidden w-48 shrink-0 border-r border-zinc-200 bg-zinc-50 p-4 sm:block dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-zinc-400 dark:text-zinc-500">README.md</span>
            <span className="rounded-md bg-[#86D5F4]/15 px-2 py-1 font-medium text-[#86D5F4]">
              strategic-plan.md
            </span>
            <span className="text-zinc-400 dark:text-zinc-500">roadmap.md</span>
            <span className="text-zinc-400 dark:text-zinc-500">meeting-notes/</span>
            <span className="text-zinc-400 dark:text-zinc-500">architecture.md</span>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 p-6 sm:p-8">
          <h2 className="text-xl font-bold text-[#86D5F4]">
            Strategic Plan 2026
          </h2>
          <div className="mt-4 space-y-2">
            <div className="h-3 w-4/5 rounded bg-zinc-100 dark:bg-zinc-800/60" />
            <div className="h-3 w-3/5 rounded bg-zinc-100 dark:bg-zinc-800/60" />
          </div>
          <div className="mt-6 rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800/50">
            <div className="space-y-2 font-mono text-xs text-zinc-400 dark:text-zinc-500">
              <span className="block">
                <span className="text-[#86D5F4]">const</span> targets = getQ3Goals();
              </span>
              <span className="block">
                <span className="text-[#86D5F4]">await</span> syncReport(targets);
              </span>
              <span className="block">
                <span className="inline-block w-[1px] h-3 bg-zinc-400 dark:bg-zinc-500 animate-blink" />
              </span>
            </div>
          </div>
        </div>

        {/* Comment panel */}
        <div className="hidden w-56 shrink-0 border-l border-zinc-200 p-4 md:block dark:border-zinc-800">
          <div className="rounded-lg border-l-2 border-[#86D5F4] bg-zinc-50 p-3 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#86D5F4]/20 text-[10px] font-bold text-[#86D5F4]">
                P
              </span>
              <span className="text-xs font-medium">Patrick</span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Great analysis on the growth projections. Let&apos;s revisit the
              timeline in our next sync.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}
