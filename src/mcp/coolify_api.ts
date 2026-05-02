/** Build Coolify REST URL: `{origin}/api/v1{path}`. `origin` is e.g. `http://coolify:8000` (no trailing slash). */
export function coolifyV1Url(origin: string, path: string): string {
  const o = origin.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${o}/api/v1${p}`;
}

export type BearerFetchResult = {
  ok: boolean;
  status: number;
  body: string;
};

export async function bearerGet(url: string, token: string): Promise<BearerFetchResult> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

/** Sentinel paths are under `/api/...`; base is e.g. `http://host:8080`. */
export function sentinelApiUrl(base: string, apiPath: string): string {
  const b = base.replace(/\/$/, "");
  const p = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  if (p.startsWith("/api/")) {
    return `${b}${p}`;
  }
  return `${b}/api${p.startsWith("/") ? p : `/${p}`}`;
}
