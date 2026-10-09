import { LruCache } from "./cache";
import { normalizePage, type Study } from "./study";
import { buildStudiesUrl, CTGOV_BASE_URL, type StudiesQuery } from "./url";

export type FetchQuery = Pick<StudiesQuery, "intr" | "cond" | "spons" | "locn" | "overallStatus" | "advanced">;
export interface FetchOptions { maxStudies: number; signal?: AbortSignal; onPage?: (fetched: number, total: number) => void }
export interface CtgovRequestLog { url: string; total_count: number; fetched: number }
export type CtgovFailureReason = "ctgov_invalid_request" | "ctgov_timeout" | "ctgov_network" | "ctgov_server_error" | "ctgov_bad_response";
export type CtgovResult =
  | { ok: true; studies: Study[]; totalCount: number; fetched: number; truncated: boolean; requests: CtgovRequestLog[]; ms: number }
  | { ok: false; reason: CtgovFailureReason; detail?: string; requests: CtgovRequestLog[]; ms: number };

export interface CtgovClient {
  fetchStudies(q: FetchQuery, opts: FetchOptions): Promise<CtgovResult>;
  version(): Promise<{ apiVersion: string; dataTimestamp: string }>;
}

export interface HttpCtgovConfig {
  baseUrl?: string; fetch?: typeof fetch; timeoutMs?: number; pageSize?: number;
  cache?: LruCache<unknown>; sleep?: (ms: number) => Promise<void>; now?: () => number;
}

type Page = NonNullable<ReturnType<typeof normalizePage>>;
type PageResult = { ok: true; page: Page; url: string } | { ok: false; reason: CtgovFailureReason; detail?: string; url: string };

export class HttpCtgovClient implements CtgovClient {
  private readonly baseUrl: string; private readonly http: typeof fetch; private readonly timeoutMs: number; private readonly pageSize: number;
  private readonly cache: LruCache<unknown>; private readonly sleep: (ms: number) => Promise<void>; private readonly now: () => number;
  private versionCache: { at: number; value: { apiVersion: string; dataTimestamp: string } } | null = null;

  constructor(cfg: HttpCtgovConfig = {}) {
    this.baseUrl = cfg.baseUrl ?? CTGOV_BASE_URL; this.http = cfg.fetch ?? fetch; this.timeoutMs = cfg.timeoutMs ?? 15_000;
    this.pageSize = cfg.pageSize ?? 1000; this.cache = cfg.cache ?? new LruCache<unknown>(200, 60 * 60 * 1000);
    this.sleep = cfg.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))); this.now = cfg.now ?? Date.now;
  }

  async fetchStudies(q: FetchQuery, opts: FetchOptions): Promise<CtgovResult> {
    const started = this.now();
    const requests: CtgovRequestLog[] = [];
    const studies: Study[] = [];
    let total = 0; let token: string | undefined; let truncated = false;
    for (let pageNo = 0; ; pageNo++) {
      const url = buildStudiesUrl({ ...q, pageSize: this.pageSize, sort: "StartDate:desc", ...(pageNo === 0 ? { countTotal: true } : {}), ...(token ? { pageToken: token } : {}) }, this.baseUrl);
      const got = await this.page(url, opts.signal);
      if (!got.ok) return { ok: false, reason: got.reason, ...(got.detail ? { detail: got.detail } : {}), requests, ms: this.now() - started };
      if (pageNo === 0) total = got.page.totalCount ?? got.page.studies.length;
      const room = opts.maxStudies - studies.length;
      const take = got.page.studies.slice(0, room);
      studies.push(...take);
      requests.push({ url, total_count: total, fetched: take.length });
      opts.onPage?.(studies.length, total);
      const more = got.page.nextPageToken !== null || got.page.studies.length > take.length;
      if (!more) break;
      if (studies.length >= opts.maxStudies) { truncated = true; break; }
      token = got.page.nextPageToken ?? undefined;
      if (!token) break;
    }
    return { ok: true, studies, totalCount: total, fetched: studies.length, truncated, requests, ms: this.now() - started };
  }

  async version(): Promise<{ apiVersion: string; dataTimestamp: string }> {
    if (this.versionCache && this.now() - this.versionCache.at < 10 * 60 * 1000) return this.versionCache.value;
    try {
      const res = await this.http(`${this.baseUrl}/version`, { signal: AbortSignal.timeout(this.timeoutMs) });
      const j = (await res.json()) as { apiVersion?: string; dataTimestamp?: string };
      const value = { apiVersion: j.apiVersion ?? "unknown", dataTimestamp: j.dataTimestamp ?? "unknown" };
      this.versionCache = { at: this.now(), value };
      return value;
    } catch {
      return this.versionCache?.value ?? { apiVersion: "unknown", dataTimestamp: "unknown" };
    }
  }

  /** One page, from cache or the network, with one retry on 429/5xx/network. */
  private async page(url: string, outer?: AbortSignal): Promise<PageResult> {
    const cached = this.cache.get(url) as Page | undefined;
    if (cached) return { ok: true, page: cached, url };
    let last: PageResult = { ok: false, reason: "ctgov_network", url };
    for (let attempt = 0; attempt < 2; attempt++) {
      const timeout = AbortSignal.timeout(this.timeoutMs);
      const signal = outer ? AbortSignal.any([outer, timeout]) : timeout;
      let res: Response;
      try {
        res = await this.http(url, { signal, headers: { accept: "application/json" } });
      } catch (e) {
        last = { ok: false, reason: timeout.aborted ? "ctgov_timeout" : "ctgov_network", detail: String(e), url };
        if (outer?.aborted) return last;
        await this.sleep(300 * (attempt + 1)); continue;
      }
      if (res.ok) {
        let json: unknown;
        try { json = await res.json(); } catch (e) { return { ok: false, reason: "ctgov_bad_response", detail: String(e), url }; }
        const page = normalizePage(json);
        if (!page) return { ok: false, reason: "ctgov_bad_response", detail: "not a studies page", url };
        this.cache.set(url, page);
        return { ok: true, page, url };
      }
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      if (res.status === 400 || res.status === 404) return { ok: false, reason: "ctgov_invalid_request", detail, url };
      last = { ok: false, reason: "ctgov_server_error", detail: `${res.status} ${detail}`, url };
      await this.sleep(300 * (attempt + 1));
    }
    return last;
  }
}

/** A client that answers from pages handed to it, for engine and API tests. */
export class FakeCtgovClient implements CtgovClient {
  readonly calls: FetchQuery[] = [];
  constructor(private readonly studies: Study[], private readonly total = studies.length) {}
  async fetchStudies(q: FetchQuery, opts: FetchOptions): Promise<CtgovResult> {
    this.calls.push(q);
    const take = this.studies.slice(0, opts.maxStudies);
    opts.onPage?.(take.length, this.total);
    return { ok: true, studies: take, totalCount: this.total, fetched: take.length, truncated: take.length < this.total, requests: [{ url: buildStudiesUrl({ ...q, pageSize: 1000, countTotal: true, sort: "StartDate:desc" }), total_count: this.total, fetched: take.length }], ms: 1 };
  }
  async version() { return { apiVersion: "2.0.5", dataTimestamp: "2026-10-08T09:00:05" }; }
}
