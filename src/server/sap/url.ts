import dns from "dns/promises";
import net from "net";

import { ApiError } from "../errors";

function isPrivateIp(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }
  return true;
}

export function normalizeSapBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ApiError(400, "SAP base URL is invalid.");
  }
  if (url.username || url.password)
    throw new ApiError(400, "Do not embed credentials in the SAP URL.");
  if (
    url.protocol !== "https:" &&
    !(process.env.NODE_ENV !== "production" && url.protocol === "http:")
  ) {
    throw new ApiError(400, "SAP base URL must use HTTPS.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export async function assertSafeSapUrl(value: string): Promise<void> {
  const url = new URL(value);
  if (process.env.SAP_ALLOW_PRIVATE_NETWORKS === "true") return;
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new ApiError(
      400,
      "Private SAP hosts require SAP_ALLOW_PRIVATE_NETWORKS=true.",
    );
  }
  const direct = net.isIP(host)
    ? [{ address: host }]
    : await dns.lookup(host, { all: true });
  if (
    direct.length === 0 ||
    direct.some((entry) => isPrivateIp(entry.address))
  ) {
    throw new ApiError(400, "SAP host resolves to a private network address.");
  }
}

export function joinSapUrl(baseUrl: string, pathOrUrl: string): string {
  const base = new URL(baseUrl);
  const resolved = new URL(pathOrUrl, `${base.toString().replace(/\/$/, "")}/`);
  if (resolved.origin !== base.origin)
    throw new ApiError(400, "SAP continuation URL changed origin.");
  return resolved.toString();
}
