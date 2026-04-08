import { diffLines } from "diff";

export interface DiffLine {
  type: "add" | "remove" | "context";
  text: string;
}

export function buildDiffLines(
  previousContent: string,
  nextContent: string,
): DiffLine[] {
  const changes = diffLines(previousContent, nextContent);
  const lines: DiffLine[] = [];

  for (const change of changes) {
    const text = change.value.replace(/\n$/, "");
    const splitLines = text.split("\n");

    for (const line of splitLines) {
      if (change.added) {
        lines.push({ type: "add", text: line });
      } else if (change.removed) {
        lines.push({ type: "remove", text: line });
      } else {
        lines.push({ type: "context", text: line });
      }
    }
  }

  return lines;
}
