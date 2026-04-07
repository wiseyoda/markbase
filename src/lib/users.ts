import { getDb } from "./db";

export interface AppUser {
  id: string;
  login: string;
  name: string | null;
  avatar_url: string | null;
}

export async function upsertUser(user: {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}): Promise<void> {
  const db = getDb();
  await db`
    INSERT INTO users (id, login, name, avatar_url, last_login)
    VALUES (${user.id}, ${user.login}, ${user.name}, ${user.avatarUrl}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      login = ${user.login},
      name = ${user.name},
      avatar_url = ${user.avatarUrl},
      last_login = NOW()
  `;
}

export async function searchUsers(query: string): Promise<AppUser[]> {
  if (!query || query.length < 2) return [];
  const db = getDb();
  const rows = await db`
    SELECT id, login, name, avatar_url
    FROM users
    WHERE login ILIKE ${"%" + query + "%"}
       OR name ILIKE ${"%" + query + "%"}
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
