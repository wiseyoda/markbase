import type { MarkdownFile } from "./github";

export interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  isFile: boolean;
}

export function buildTree(files: MarkdownFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  const childMaps = new WeakMap<TreeNode, Map<string, TreeNode>>();
  const rootMap = new Map<string, TreeNode>();

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;
    let currentMap = rootMap;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isFile = i === parts.length - 1;
      const existing = currentMap.get(name);

      if (existing) {
        current = existing.children;
        currentMap = childMaps.get(existing)!;
      } else {
        const node: TreeNode = {
          name,
          path: isFile ? file.path : parts.slice(0, i + 1).join("/"),
          children: [],
          isFile,
        };
        const nodeMap = new Map<string, TreeNode>();
        childMaps.set(node, nodeMap);
        current.push(node);
        currentMap.set(name, node);
        current = node.children;
        currentMap = nodeMap;
      }
    }
  }

  function sortTree(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      sortTree(node.children);
    }
  }

  sortTree(root);
  return root;
}
