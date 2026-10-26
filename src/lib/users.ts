import { getDb } from "./db";
import { decrypt, encrypt } from "./crypto";

export interface AppUser {
  id: string;
  login: string;
  name: string | null;
  avatar_url: string | null;
}

/**
 * Records a sign-in. When `githubToken` is given it becomes the user's
 * current GitHub token (encrypted); shares resolve against this token so they
 * survive revocation of the one captured when they were created.
 */
export async function upsertUser(user: {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  githubToken?: string | null;
}): Promise<void> {
  const db = getDb();
  const encryptedToken = user.githubToken ? encrypt(user.githubToken) : null;
  await db`
    INSERT INTO users (id, login, name, avatar_url, last_login, github_token, github_token_updated_at)
    VALUES (
      ${user.id}, ${user.login}, ${user.name}, ${user.avatarUrl}, NOW(),
      ${encryptedToken}, ${encryptedToken ? new Date() : null}
    )
    ON CONFLICT (id) DO UPDATE SET
      login = ${user.login},
      name = ${user.name},
      avatar_url = ${user.avatarUrl},
      last_login = NOW(),
      github_token = COALESCE(EXCLUDED.github_token, users.github_token),
      github_token_updated_at = CASE
        WHEN EXCLUDED.github_token IS NULL THEN users.github_token_updated_at
        ELSE NOW()
      END
  `;
}

export async function saveUserGitHubToken(
  userId: string,
  githubToken: string,
): Promise<void> {
  const db = getDb();
  await db`
    UPDATE users
    SET github_token = ${encrypt(githubToken)},
        github_token_updated_at = NOW()
    WHERE id = ${userId}
  `;
}

export async function getUserGitHubToken(userId: string): Promise<string | null> {
  const db = getDb();
  const rows = await db`
    SELECT github_token FROM users WHERE id = ${userId}
  `;
  const encrypted = rows[0]?.github_token as string | null | undefined;
  return encrypted ? decrypt(encrypted) : null;
}

export async function searchUsers(query: string): Promise<AppUser[]> {
  if (!query || query.length < 2) return [];
  const escaped = query.replace(/[%_\\]/g, "\\$&");
  const db = getDb();
  const rows = await db`
    SELECT id, login, name, avatar_url
    FROM users
    WHERE login ILIKE ${"%" + escaped + "%"}
       OR name ILIKE ${"%" + escaped + "%"}
    ORDER BY last_login DESC
    LIMIT 5
  `;
  return rows.map((r) => ({
    id: r.id as string,
    login: r.login as string,
    name: r.name as string | null,
    avatar_url: r.avatar_url as string | null,
  }));
}
