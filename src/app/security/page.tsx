import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Security and data use",
  description: "How Markbase currently accesses GitHub, stores share credentials, and uses AI providers.",
};

export default function SecurityPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-6 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-sm font-medium text-zinc-500 dark:text-zinc-400">
          <Logo size={24} />
          markbase
        </Link>
        <ThemeToggle />
      </header>

      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 sm:px-8 sm:py-16">
        <p className="text-sm font-medium text-sky-600 dark:text-[#86D5F4]">Current access model</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Security and data use</h1>
        <p className="mt-5 text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          Markbase is being migrated toward selected-repository, least-privilege access. This page describes the current production behavior so you can make an informed choice today.
        </p>

        <div className="mt-12 space-y-10 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
          <Section title="GitHub permissions">
            GitHub&apos;s current OAuth <code>repo</code> scope grants broad read and write access to repositories. Markbase uses that token only to read repository metadata and markdown content; it does not commit, push, or modify repository contents. A GitHub App migration is planned so users can select repositories and grant narrower, short-lived access.
          </Section>
          <Section title="Sessions and shares">
            Web sessions keep the GitHub token in an encrypted Auth.js session. When you create a share, Markbase currently encrypts a copy of that token on the server so the shared document can be fetched later. The token is never sent to the recipient, but its GitHub permission scope is broader than the shared document. Delete shares you no longer need and revoke the OAuth app in GitHub to invalidate its access.
          </Section>
          <Section title="AI summaries">
            When AI summaries are enabled by the operator, Markbase may send up to 30,000 characters of document content to the configured OpenAI, Anthropic, or Google model. Generated summaries and provider/model metadata are cached in Postgres. Per-repository consent, never-send controls, and deletion controls are planned; do not use AI summaries for private content until that policy matches your requirements.
          </Section>
          <Section title="Stored product data">
            Markbase stores user profile metadata, repository names, share scope and recipient metadata, comments, review baselines, content hashes, and cached AI outputs. It does not store a second editable copy of your repository documents.
          </Section>
          <Section title="Revoking access and reporting issues">
            You can revoke Markbase from GitHub&apos;s application settings and delete active shares from Markbase. Security issues should be reported privately using the repository&apos;s security policy.
          </Section>
        </div>

        <div className="mt-12 flex flex-wrap gap-3">
          <a className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900" href="https://github.com/settings/applications" target="_blank" rel="noreferrer">
            Review GitHub access
          </a>
          <a className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium dark:border-zinc-700" href="https://github.com/wiseyoda/markbase/blob/main/SECURITY.md" target="_blank" rel="noreferrer">
            Security policy
          </a>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-100">{title}</h2>
      <p className="mt-3">{children}</p>
    </section>
  );
}
