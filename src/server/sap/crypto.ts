import crypto from "crypto";

import { ApiError } from "../errors";
import type { SapCredentials } from "./types";

const VERSION = "v1";

function encryptionKey(): Buffer {
  const raw = process.env.SAP_CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!raw)
    throw new ApiError(503, "SAP credential encryption is not configured.");
  const key = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new ApiError(
      503,
      "SAP_CREDENTIALS_ENCRYPTION_KEY must decode to exactly 32 bytes.",
    );
  }
  return key;
}

export function encryptSapCredentials(credentials: SapCredentials): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSapCredentials(value: string): SapCredentials {
  try {
    const [version, ivRaw, tagRaw, payloadRaw] = value.split(".");
    if (version !== VERSION || !ivRaw || !tagRaw || !payloadRaw)
      throw new Error("unsupported credential format");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivRaw, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    const clear = Buffer.concat([
      decipher.update(Buffer.from(payloadRaw, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(clear) as SapCredentials;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, "Stored SAP credentials cannot be decrypted.");
  }
}
