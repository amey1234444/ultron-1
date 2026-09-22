import crypto from "crypto";

import { ApiError } from "../errors";
import type { SapConnection, SapODataPage, SapResourceName } from "./types";
import { assertSafeSapUrl, joinSapUrl } from "./url";

type TokenEntry = { token: string; expiresAt: number };
const globalRef = globalThis as unknown as {
  __ultronSapTokens?: Map<string, TokenEntry>;
};
const tokenCache = () => (globalRef.__ultronSapTokens ??= new Map());

export type SapRequestResult<T> = {
  data: T;
  status: number;
  durationMs: number;
  correlationId: string;
  etag: string;
};

function timeoutMs(): number {
  const configured = Number(process.env.SAP_REQUEST_TIMEOUT_MS ?? 15000);
  return Number.isFinite(configured)
    ? Math.min(Math.max(configured, 1000), 60000)
    : 15000;
}

function safeErrorBody(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const object = value as Record<string, unknown>;
  const error = object.error as Record<string, unknown> | undefined;
  const message = error?.message;
  if (typeof message === "string") return message.slice(0, 300);
  if (
    message &&
    typeof message === "object" &&
    typeof (message as Record<string, unknown>).value === "string"
  ) {
    return String((message as Record<string, unknown>).value).slice(0, 300);
  }
  return "";
}

async function oauthToken(connection: SapConnection): Promise<string> {
  const cached = tokenCache().get(connection.id);
  if (cached && cached.expiresAt > Date.now() + 30000) return cached.token;
  await assertSafeSapUrl(connection.tokenUrl);
  const body = new URLSearchParams({ grant_type: "client_credentials" });
  if (connection.credentials.scope)
    body.set("scope", connection.credentials.scope);
  const basic = Buffer.from(
    `${connection.credentials.clientId}:${connection.credentials.clientSecret}`,
  ).toString("base64");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const response = await fetch(connection.tokenUrl, {
      method: "POST",
      headers: {
        authorization: `Basic ${basic}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
      signal: controller.signal,
      redirect: "error",
    });
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok || typeof payload.access_token !== "string") {
      throw new ApiError(
        502,
        `SAP OAuth token request failed (${response.status}).`,
      );
    }
    const expires = Math.max(Number(payload.expires_in ?? 300), 60);
    tokenCache().set(connection.id, {
      token: payload.access_token,
      expiresAt: Date.now() + expires * 1000,
    });
    return payload.access_token;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "AbortError")
      throw new ApiError(504, "SAP OAuth token request timed out.");
    throw new ApiError(502, "SAP OAuth token endpoint could not be reached.");
  } finally {
    clearTimeout(timer);
  }
}

async function authHeader(connection: SapConnection): Promise<string> {
  if (connection.authType === "basic") {
    return `Basic ${Buffer.from(`${connection.credentials.username}:${connection.credentials.password}`).toString("base64")}`;
  }
  return `Bearer ${await oauthToken(connection)}`;
}

async function request(
  connection: SapConnection,
  url: string,
  init: RequestInit = {},
): Promise<SapRequestResult<unknown>> {
  await assertSafeSapUrl(url);
  const correlationId = crypto.randomUUID();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  const started = Date.now();
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        accept: "application/json",
        authorization: await authHeader(connection),
        "x-correlation-id": correlationId,
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
      redirect: "error",
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const detail = safeErrorBody(data);
      throw new ApiError(
        502,
        `SAP request failed (${response.status})${detail ? `: ${detail}` : "."}`,
      );
    }
    return {
      data,
      status: response.status,
      durationMs: Date.now() - started,
      correlationId,
      etag: response.headers.get("etag") ?? "",
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof SyntaxError)
      throw new ApiError(502, "SAP returned an invalid JSON response.");
    if (error instanceof Error && error.name === "AbortError")
      throw new ApiError(504, "SAP request timed out.");
    throw new ApiError(502, "SAP endpoint could not be reached.");
  } finally {
    clearTimeout(timer);
  }
}

export function parseSapODataPage(data: unknown): SapODataPage {
  const root = (data && typeof data === "object" ? data : {}) as Record<
    string,
    unknown
  >;
  const v2 =
    root.d && typeof root.d === "object"
      ? (root.d as Record<string, unknown>)
      : null;
  const records = Array.isArray(root.value)
    ? root.value
    : Array.isArray(v2?.results)
      ? v2.results
      : v2 && !Array.isArray(v2)
        ? [v2]
        : [];
  const rawNext =
    root["@odata.nextLink"] ?? root["odata.nextLink"] ?? v2?.__next;
  const rawCount = root["@odata.count"] ?? v2?.__count;
  return {
    records: records.filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object"),
    ),
    nextLink: typeof rawNext === "string" ? rawNext : null,
    count: rawCount === undefined ? null : Number(rawCount),
  };
}

export async function readSapResource(
  connection: SapConnection,
  resource: SapResourceName,
  search: Record<string, string> = {},
): Promise<SapRequestResult<SapODataPage>> {
  const url = new URL(
    joinSapUrl(connection.baseUrl, connection.servicePaths[resource]),
  );
  for (const [key, value] of Object.entries(search))
    url.searchParams.set(key, value);
  const result = await request(connection, url.toString());
  return { ...result, data: parseSapODataPage(result.data) };
}

export async function readSapContinuation(
  connection: SapConnection,
  nextLink: string,
): Promise<SapRequestResult<SapODataPage>> {
  const result = await request(
    connection,
    joinSapUrl(connection.baseUrl, nextLink),
  );
  return { ...result, data: parseSapODataPage(result.data) };
}

async function csrfContext(
  connection: SapConnection,
  resource: SapResourceName,
) {
  const url = joinSapUrl(connection.baseUrl, connection.servicePaths[resource]);
  await assertSafeSapUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        authorization: await authHeader(connection),
        "x-csrf-token": "Fetch",
        accept: "application/json",
      },
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok)
      throw new ApiError(
        502,
        `SAP CSRF token request failed (${response.status}).`,
      );
    const token = response.headers.get("x-csrf-token");
    if (!token) throw new ApiError(502, "SAP did not return a CSRF token.");
    const cookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [response.headers.get("set-cookie") ?? ""];
    return {
      token,
      cookie: cookies
        .filter(Boolean)
        .map((value) => value.split(";")[0])
        .join("; "),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function writeSapResource(
  connection: SapConnection,
  resource: SapResourceName,
  payload: Record<string, unknown>,
  options: { method?: "POST" | "PATCH"; ifMatch?: string } = {},
): Promise<SapRequestResult<Record<string, unknown>>> {
  const csrf = await csrfContext(connection, resource);
  const result = await request(
    connection,
    joinSapUrl(connection.baseUrl, connection.servicePaths[resource]),
    {
      method: options.method ?? "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrf.token,
        ...(csrf.cookie ? { cookie: csrf.cookie } : {}),
        ...(options.ifMatch ? { "if-match": options.ifMatch } : {}),
      },
      body: JSON.stringify(payload),
    },
  );
  const root = result.data as Record<string, unknown>;
  const data =
    root.d && typeof root.d === "object"
      ? (root.d as Record<string, unknown>)
      : root;
  return { ...result, data };
}

export async function testSapConnection(
  connection: SapConnection,
): Promise<SapRequestResult<SapODataPage>> {
  return readSapResource(connection, "equipment", { $top: "1" });
}
