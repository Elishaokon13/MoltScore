/**
 * API key authentication and rate limiting.
 * Keys are stored as SHA-256 hashes in the api_keys table.
 * Key format: ms_<32 hex chars> (e.g. ms_a1b2c3d4...)
 */

import { createHash, randomBytes } from "crypto";
import { pool } from "./db";

const LOG = "[ApiAuth]";

export interface ApiKeyRecord {
  id: number;
  keyPrefix: string;
  name: string;
  keyType: "read" | "write";
  requestsToday: number;
  rateLimitDay: number;
  lastUsedAt: string | null;
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Generate a new API key. Returns the raw key (only shown once) and the DB record.
 */
export async function generateApiKey(
  name: string,
  keyType: "read" | "write" = "read"
): Promise<{ rawKey: string; record: ApiKeyRecord }> {
  const raw = "ms_" + randomBytes(24).toString("hex");
  const hash = hashKey(raw);
  const prefix = raw.slice(0, 10) + "...";

  const result = await pool.query(
    `INSERT INTO api_keys (key_hash, key_prefix, name, key_type)
     VALUES ($1, $2, $3, $4)
     RETURNING id, key_prefix, name, key_type, requests_today, rate_limit_day, last_used_at`,
    [hash, prefix, name, keyType]
  );

  const row = result.rows[0] as Record<string, unknown>;
  return {
    rawKey: raw,
    record: {
      id: row.id as number,
      keyPrefix: row.key_prefix as string,
      name: row.name as string,
      keyType: row.key_type as "read" | "write",
      requestsToday: (row.requests_today as number) ?? 0,
      rateLimitDay: (row.rate_limit_day as number) ?? 1000,
      lastUsedAt: row.last_used_at
        ? new Date(row.last_used_at as string).toISOString()
        : null,
    },
  };
}

/**
 * Validate an API key from the request header.
 * Returns the key record if valid, null if invalid/missing/rate-limited.
 */
export async function validateApiKey(
  headerValue: string | null
): Promise<{ valid: true; record: ApiKeyRecord } | { valid: false; error: string }> {
  if (!headerValue) {
    return { valid: false, error: "Missing X-API-KEY header" };
  }

  const key = headerValue.trim();
  if (!key.startsWith("ms_")) {
    return { valid: false, error: "Invalid API key format" };
  }

  const hash = hashKey(key);

  try {
    const result = await pool.query(
      `SELECT id, key_prefix, name, key_type, requests_today, rate_limit_day, last_used_at
       FROM api_keys WHERE key_hash = $1`,
      [hash]
    );

    if (result.rows.length === 0) {
      return { valid: false, error: "Invalid API key" };
    }

    const row = result.rows[0] as Record<string, unknown>;
    const requestsToday = (row.requests_today as number) ?? 0;
    const rateLimitDay = (row.rate_limit_day as number) ?? 1000;

    if (requestsToday >= rateLimitDay) {
      return { valid: false, error: "Rate limit exceeded. Try again tomorrow." };
    }

    // Update usage stats (reset counter if last_used was a different day)
    await pool.query(
      `UPDATE api_keys SET
        last_used_at = NOW(),
        requests_today = CASE
          WHEN last_used_at IS NULL OR last_used_at::date < CURRENT_DATE THEN 1
          ELSE requests_today + 1
        END
       WHERE id = $1`,
      [row.id]
    );

    return {
      valid: true,
      record: {
        id: row.id as number,
        keyPrefix: row.key_prefix as string,
        name: row.name as string,
        keyType: row.key_type as "read" | "write",
        requestsToday: requestsToday + 1,
        rateLimitDay,
        lastUsedAt: new Date().toISOString(),
      },
    };
  } catch (e) {
    console.warn(LOG, "validateApiKey error", { error: String(e) });
    return { valid: false, error: "Authentication service error" };
  }
}
