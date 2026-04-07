interface TreeItem {
  path: string;
  mode: string;
  type: string;
  sha: string;
  size?: number;
  url: string;
}

export interface MarkdownFile {
  path: string;
  sha: string;
}

export async function getDefaultBranch(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<string> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
      next: { revalidate: 300 },
    },
  );

  if (!res.ok) return "main";
  const data = await res.json();
  return data.default_branch;
}

export async function getMarkdownTree(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<MarkdownFile[]> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
      next: { revalidate: 60 },
    },
  );

  if (!res.ok) return [];

  const data = await res.json();
  return (data.tree as TreeItem[])
    .filter((item) => item.type === "blob" && item.path.endsWith(".md"))
    .map((item) => ({ path: item.path, sha: item.sha }));
}

export async function getFileContent(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.raw+json",
      },
      next: { revalidate: 60 },
    },
  );

  if (!res.ok) return null;
  return res.text();
}
