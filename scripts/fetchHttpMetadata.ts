/**
 * Fetch metadata from HTTP URLs for agents that have HTTP URIs but no cached name/description.
 * Run: npx tsx scripts/fetchHttpMetadata.ts
 */

import "dotenv/config";
import { pool } from "../lib/db";

const BATCH_SIZE = 5;
const DELAY_MS = 500;
const FETCH_TIMEOUT_MS = 8000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
  } finally {
    clearTimeout(timer);
  }
}

function extractSkills(data: Record<string, unknown>): string[] {
  const skills = new Set<string>();
  const services = data.services as { skills?: string[]; domains?: string[] }[] | undefined;
  if (Array.isArray(services)) {
    for (const svc of services) {
      if (Array.isArray(svc.skills)) {
        for (const skill of svc.skills) {
          const last = String(skill).split("/").pop()?.replace(/_/g, " ");
          if (last) skills.add(last);
        }
      }
      if (Array.isArray(svc.domains)) {
        for (const domain of svc.domains) {
          const last = String(domain).split("/").pop()?.replace(/_/g, " ");
          if (last) skills.add(last);
        }
      }
    }
  }
  const topSkills = data.skills ?? data.tags ?? data.categories;
  if (Array.isArray(topSkills)) {
    for (const s of topSkills) {
      if (typeof s === "string") skills.add(s.replace(/_/g, " "));
    }
  }
  return Array.from(skills).slice(0, 6);
}

async function main() {
  console.log("[fetch-http] Starting...");

  const res = await pool.query(
    `SELECT agent_id, agent_uri FROM mandate_agents
     WHERE agent_uri LIKE 'http%'
     AND (description IS NULL)
     ORDER BY agent_id
     LIMIT 500`
  );

  console.log(`[fetch-http] ${res.rows.length} agents need HTTP metadata fetch`);

  let fetched = 0;
  let errors = 0;
  let noJson = 0;

  for (let i = 0; i < res.rows.length; i += BATCH_SIZE) {
    const batch = res.rows.slice(i, i + BATCH_SIZE);

    const promises = batch.map(async (row: { agent_id: number; agent_uri: string }) => {
      try {
        const resp = await fetchWithTimeout(row.agent_uri, FETCH_TIMEOUT_MS);
        if (!resp.ok) {
          noJson++;
          return;
        }
        const contentType = resp.headers.get("content-type") ?? "";
        if (!contentType.includes("json")) {
          noJson++;
          return;
        }
        const data = (await resp.json()) as Record<string, unknown>;
        const name = typeof data.name === "string" ? data.name : null;
        const description = typeof data.description === "string" ? data.description : null;
        const image = typeof data.image === "string" ? data.image : null;
        const skills = extractSkills(data);

        if (name || description || image) {
          await pool.query(
            `UPDATE mandate_agents SET
              name = COALESCE($2, name),
              description = COALESCE($3, description),
              image_url = COALESCE($4, image_url),
              skills = CASE WHEN $5::text[] != '{}' THEN $5 ELSE skills END
            WHERE agent_id = $1`,
            [row.agent_id, name, description, image, skills]
          );
          fetched++;
        } else {
          noJson++;
        }
      } catch {
        errors++;
      }
    });

    await Promise.all(promises);

    if ((i + BATCH_SIZE) % 50 === 0 || i + BATCH_SIZE >= res.rows.length) {
      console.log(
        `[fetch-http] Progress: ${Math.min(i + BATCH_SIZE, res.rows.length)}/${res.rows.length} (fetched: ${fetched}, noJson: ${noJson}, errors: ${errors})`
      );
    }
    await sleep(DELAY_MS);
  }

  console.log(`[fetch-http] Done. Fetched: ${fetched}, NoJson: ${noJson}, Errors: ${errors}`);

  const stats = await pool.query(`
    SELECT
      COUNT(*)::int as total,
      COUNT(name)::int as has_name,
      COUNT(description)::int as has_desc,
      COUNT(image_url)::int as has_image
    FROM mandate_agents
  `);
  console.log("[fetch-http] Stats:", stats.rows[0]);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
