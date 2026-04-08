import type { Session } from "next-auth";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { cookies } from "next/headers";
import { decodeTestAuthCookie, TEST_AUTH_COOKIE } from "@/lib/test-auth";

const {
  handlers,
  signIn,
  signOut,
  auth: nextAuth,
} = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
      authorization: {
        params: {
          scope: "read:user user:email repo",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      if (profile) {
        token.userId = String(profile.id);
        token.userLogin =
          ((profile as Record<string, unknown>).login as string) || "";
        // Track user in our DB
        try {
          const { upsertUser } = await import("@/lib/users");
          await upsertUser({
            id: String(profile.id),
            login: (profile as Record<string, unknown>).login as string || "",
            name: profile.name || null,
            avatarUrl: (profile as Record<string, unknown>).avatar_url as string || null,
          });
        } catch {
          // Don't block auth if DB is unavailable
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      if (session.user) {
        session.user.id = (token.userId || token.sub) as string;
        session.user.login = (token.userLogin as string | undefined) || null;
      }
      return session;
    },
  },
});

function isBypass(): boolean {
  return (
    process.env.AUTH_BYPASS === "true" &&
    (
      process.env.NODE_ENV === "development" ||
      process.env.MARKBASE_TEST_MODE === "true"
    )
  );
}

function bypassSession(): Session {
  const pat = process.env.GITHUB_PAT;
  if (!pat) {
    throw new Error("AUTH_BYPASS requires GITHUB_PAT in .env.local");
  }
  return {
    user: {
      id: process.env.GITHUB_BYPASS_USER_ID || "0",
      login: process.env.GITHUB_BYPASS_LOGIN || "dev-user",
      name: "Dev User",
      email: null,
      image: null,
    },
    accessToken: pat,
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

async function testSession(): Promise<Session | null | undefined> {
  if (process.env.MARKBASE_TEST_MODE !== "true") return undefined;

  const cookieStore = await cookies();
  const raw = cookieStore.get(TEST_AUTH_COOKIE)?.value;
  if (!raw) return null;

  try {
    const payload = decodeTestAuthCookie(raw);
    return {
      user: {
        id: payload.id,
        login: payload.login,
        name: payload.name,
        email: null,
        image: payload.image || null,
      },
      accessToken: payload.accessToken,
      expires: new Date(Date.now() + 86400000).toISOString(),
    };
  } catch {
    return null;
  }
}

async function auth(): Promise<Session | null> {
  if (process.env.MARKBASE_TEST_MODE === "true") {
    return (await testSession()) ?? null;
  }

  const injectedTestSession = await testSession();
  if (injectedTestSession !== undefined) return injectedTestSession;
  if (isBypass()) return bypassSession();
  return nextAuth();
}

export { handlers, signIn, signOut, auth, nextAuth as authMiddleware };
