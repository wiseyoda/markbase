import type { Session } from "next-auth";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

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
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      if (session.user) {
        session.user.id = (token.userId || token.sub) as string;
      }
      return session;
    },
  },
});

function isBypass(): boolean {
  return (
    process.env.AUTH_BYPASS === "true" &&
    process.env.NODE_ENV === "development"
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
      name: "Dev User",
      email: null,
      image: null,
    },
    accessToken: pat,
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

async function auth(): Promise<Session | null> {
  if (isBypass()) return bypassSession();
  return nextAuth();
}

export { handlers, signIn, signOut, auth, nextAuth as authMiddleware };
