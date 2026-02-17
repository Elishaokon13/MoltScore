/**
 * Pre-cache agent metadata from data URIs into mandate_agents table.
 * Parses data:application/json;base64,... URIs and HTTP URIs.
 * Run: npx tsx scripts/cacheAgentMetadata.ts
 */

import "dotenv/config";
import { pool } from "../lib/db";
import { parseAgentUri } from "../lib/agentMetadata";

async function main() {
  console.log("[cache-metadata] Starting...");

  // Get all agents with URI but no cached name
  const res = await pool.query(
    "SELECT agent_id, agent_uri FROM mandate_agents WHERE agent_uri IS NOT NULL AND agent_uri != '' AND name IS NULL ORDER BY agent_id"
  );

  console.log(`[cache-metadata] ${res.rows.length} agents need metadata parsing`);

  let updated = 0;
  let skipped = 0;
  const BATCH_SIZE = 100;

  for (let i = 0; i < res.rows.length; i += BATCH_SIZE) {
    const batch = res.rows.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      const meta = parseAgentUri(row.agent_uri);
      const name = meta.name;
      const desc = meta.description;
      const image = meta.image;
      const skills = meta.skills;

      if (!name && !desc && !image && skills.length === 0) {
        skipped++;
        continue;
      }

      await pool.query(
        `UPDATE mandate_agents SET
          name = COALESCE($2, name),
          description = COALESCE($3, description),
          image_url = COALESCE($4, image_url),
          skills = CASE WHEN $5::text[] != '{}' THEN $5 ELSE skills END
        WHERE agent_id = $1`,
        [row.agent_id, name, desc, image, skills]
      );
      updated++;
    }

    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= res.rows.length) {
      console.log(`[cache-metadata] Processed ${Math.min(i + BATCH_SIZE, res.rows.length)}/${res.rows.length} (updated: ${updated}, skipped: ${skipped})`);
    }
  }

  console.log(`[cache-metadata] Done. Updated: ${updated}, Skipped: ${skipped}`);

  // Stats
  const stats = await pool.query(`
    SELECT 
      COUNT(*)::int as total,
      COUNT(name)::int as has_name,
      COUNT(description)::int as has_desc,
      COUNT(image_url)::int as has_image,
      COUNT(CASE WHEN array_length(skills, 1) > 0 THEN 1 END)::int as has_skills
    FROM mandate_agents
  `);
  console.log("[cache-metadata] Stats:", stats.rows[0]);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
