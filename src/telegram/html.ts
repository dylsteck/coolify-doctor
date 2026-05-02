export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function link(label: string, url: string): string {
  if (!url) return "";
  return `<a href="${esc(url)}">${esc(label)}</a>`;
}

export function joinLines(...parts: string[]): string {
  return joinNonEmpty(parts, "\n");
}

export function joinInline(...parts: string[]): string {
  return joinNonEmpty(parts, " · ");
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

export function prettyEvent(e: string): string {
  return e
    .split("_")
    .map((p) => (p ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join(" ");
}

function joinNonEmpty(parts: string[], sep: string): string {
  return parts.filter((p) => p !== "").join(sep);
}
