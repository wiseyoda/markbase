import type { Metadata } from "next";
import { auth, signIn } from "@/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { redirect } from "next/navigation";
import { ProductDemo } from "./product-demo";
import { ScrollReveal } from "./scroll-reveal";

export const metadata: Metadata = {
  title: "markbase — Browse, share, and discuss markdown from GitHub",
};

export default async function Home(props: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const params = await props.searchParams;
  const session = await auth();

  // In dev, /?preview skips auth redirect so you can view the landing page
  const isPreview =
    process.env.NODE_ENV === "development" && params.preview !== undefined;
  if (session && !isPreview) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 pt-6 sm:px-8">
        <div className="flex items-center gap-2.5">
          <Logo size={24} />
          <span className="text-sm font-medium text-zinc-400 dark:text-zinc-500">
            markbase
          </span>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 flex-col">
        {/* Hero */}
        <section className="mx-auto w-full max-w-5xl px-6 pt-20 sm:px-8 sm:pt-28 lg:pt-36">
          <div className="max-w-2xl">
            <h1
              className="landing-stagger text-4xl font-bold tracking-tight sm:text-5xl lg:text-[3.5rem] lg:leading-[1.1]"
              style={{ "--stagger": 0 } as React.CSSProperties}
            >
              Your markdown deserves{" "}
              <span className="text-[#86D5F4]">
                better than raw GitHub.
              </span>
            </h1>
            <p
              className="landing-stagger mt-6 max-w-lg text-lg leading-relaxed text-zinc-500 dark:text-zinc-400"
              style={{ "--stagger": 1 } as React.CSSProperties}
            >
              Browse, share, and discuss the docs your team writes in
              GitHub — with beautiful rendering, granular sharing, and
              inline comments.
            </p>
            <form
              action={async () => {
                "use server";
                await signIn("github", { redirectTo: "/dashboard" });
              }}
            >
              <button
                type="submit"
                className="landing-stagger mt-8 inline-flex items-center gap-3 rounded-lg bg-zinc-900 px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                style={{ "--stagger": 2 } as React.CSSProperties}
              >
                <GitHubIcon />
                Sign in with GitHub
              </button>
            </form>
            <p
              className="landing-stagger mt-4 text-xs text-zinc-400 dark:text-zinc-500"
              style={{ "--stagger": 3 } as React.CSSProperties}
            >
              Read-only GitHub access. Your repos stay untouched.
            </p>
          </div>
        </section>

        {/* Product walkthrough */}
        <section className="mx-auto w-full max-w-5xl px-6 mt-16 sm:mt-24 sm:px-8">
          <ProductDemo />
        </section>

        {/* Feature: Rendering — always visible, pulls you to scroll */}
        <section className="mx-auto w-full max-w-5xl px-6 mt-16 sm:mt-20 sm:px-8">
          <FeatureSection
            title="Typography that does your docs justice."
            description="Syntax highlighting, tables, task lists, and code blocks — rendered with the same care you put into writing them."
          >
            <RenderingDemo />
          </FeatureSection>
        </section>

        {/* Feature: Sharing */}
        <ScrollReveal>
          <section className="mx-auto w-full max-w-5xl px-6 mt-20 sm:mt-24 sm:px-8">
            <FeatureSection
              title="Share a file, folder, or entire repo."
              description="Generate links that expire. Choose who sees what. Stop pasting docs into Slack threads."
              reversed
            >
              <SharingDemo />
            </FeatureSection>
          </section>
        </ScrollReveal>

        {/* Feature: Comments */}
        <ScrollReveal>
          <section className="mx-auto w-full max-w-5xl px-6 mt-20 sm:mt-24 sm:px-8">
            <FeatureSection
              title="Discuss the text, not around it."
              description={
                "Select any passage and leave a comment. Threads stay " +
                "anchored to the text — no more \"see line 42\" in chat."
              }
            >
              <CommentsDemo />
            </FeatureSection>
          </section>
        </ScrollReveal>

        {/* Bottom CTA */}
        <ScrollReveal>
          <section className="mx-auto w-full max-w-5xl px-6 mt-20 sm:mt-24 sm:px-8 text-center">
            <p className="text-lg font-medium text-zinc-400 dark:text-zinc-500">
              Built for teams who think in markdown.
            </p>
            <form
              action={async () => {
                "use server";
                await signIn("github", { redirectTo: "/dashboard" });
              }}
              className="mt-6"
            >
              <button
                type="submit"
                className="inline-flex items-center gap-3 rounded-lg bg-zinc-900 px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <GitHubIcon />
                Sign in with GitHub
              </button>
            </form>
          </section>
        </ScrollReveal>

        {/* Footer */}
        <footer className="mt-16 pb-12 text-center sm:mt-20">
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            &copy; {new Date().getFullYear()} markbase
          </p>
        </footer>
      </main>
    </div>
  );
}

/* ─── Feature section layout ─── */

function FeatureSection({
  title,
  description,
  children,
  reversed = false,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  reversed?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={reversed ? "lg:order-2" : ""}>
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      </div>
      <div className={reversed ? "lg:order-1" : ""}>{children}</div>
    </div>
  );
}

/* ─── Feature demos ─── */

/** Document-style container: white bg, thin border */
function RenderingDemo() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-sky-900 dark:text-[#86D5F4]">
          Q3 Revenue Targets
        </h3>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Based on current pipeline velocity and projected close rates,
          we need to adjust targets for the enterprise segment.
        </p>
        <div className="rounded-lg bg-zinc-50 p-3 font-mono text-xs dark:bg-zinc-900">
          <div className="text-zinc-500 dark:text-zinc-400">
            <span className="text-[#86D5F4]">function</span>{" "}
            <span className="text-zinc-700 dark:text-zinc-300">
              calculateTarget
            </span>
            {"() {"}
          </div>
          <div className="pl-4 text-zinc-500 dark:text-zinc-400">
            <span className="text-[#86D5F4]">return</span> pipeline *
            closeRate;
          </div>
          <div className="text-zinc-500 dark:text-zinc-400">{"}"}</div>
        </div>
        <div className="flex items-center gap-5 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="flex items-center gap-2">
            <span className="flex h-4 w-4 items-center justify-center rounded border border-[#86D5F4] bg-[#86D5F4]/10">
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#86D5F4"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            Update projections
          </span>
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 rounded border border-zinc-300 dark:border-zinc-600" />
            Review with team
          </span>
        </div>
      </div>
    </div>
  );
}

/** Accent-tinted container: subtle blue wash */
function SharingDemo() {
  return (
    <div className="rounded-xl border border-[#86D5F4]/15 bg-[#86D5F4]/[0.03] p-5 sm:p-6 dark:border-[#86D5F4]/10 dark:bg-[#86D5F4]/[0.03]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Share link
          </span>
          <span className="rounded-full bg-[#86D5F4]/10 px-2.5 py-0.5 text-xs font-medium text-[#4ab3de] dark:text-[#86D5F4]">
            Expires in 7d
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2.5 dark:bg-zinc-950">
          <code className="flex-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
            markbase.app/s/a3f2b8c1
          </code>
          <span className="shrink-0 cursor-default text-xs font-medium text-[#4ab3de] dark:text-[#86D5F4]">
            Copy
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              Shared with
            </span>
            <div className="flex -space-x-1.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#86D5F4]/20 text-[9px] font-bold text-[#86D5F4] ring-2 ring-white dark:ring-zinc-950">
                P
              </span>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200 text-[9px] font-bold text-zinc-500 ring-2 ring-white dark:bg-zinc-700 dark:text-zinc-300 dark:ring-zinc-950">
                B
              </span>
            </div>
          </div>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            strategic-plan.md
          </span>
        </div>
      </div>
    </div>
  );
}

/** Neutral container: zinc background */
function CommentsDemo() {
  return (
    <div className="rounded-xl bg-zinc-50 p-5 sm:p-6 dark:bg-zinc-900/50">
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          The growth projections for Q3 indicate a{" "}
          <span className="rounded bg-[#86D5F4]/15 px-1 py-0.5 text-zinc-800 dark:text-zinc-200">
            significant opportunity in the enterprise segment
          </span>{" "}
          that warrants additional investment in the sales pipeline.
        </p>
        <div className="ml-4 space-y-3 rounded-lg bg-white p-3 dark:bg-zinc-950">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#86D5F4]/20 text-[10px] font-bold text-[#86D5F4]">
                P
              </span>
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Patrick
              </span>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                2m ago
              </span>
            </div>
            <p className="mt-1 pl-7 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Agreed — let&apos;s prioritize this in Thursday&apos;s sync.
            </p>
          </div>
          <div className="flex cursor-default items-center gap-2 border-t border-zinc-100 pt-2 dark:border-zinc-800/50">
            <CheckIcon />
            <span className="text-[11px] font-medium text-[#4ab3de] dark:text-[#86D5F4]">
              Resolve
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Icons ─── */

function GitHubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-[#4ab3de] dark:text-[#86D5F4]"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
