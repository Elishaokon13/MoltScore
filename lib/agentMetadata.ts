/**
 * Parse agent URIs into structured metadata.
 * Handles data:application/json;base64,... URIs inline.
 * HTTP/HTTPS URIs are left as-is (fetch separately if needed).
 */

export interface AgentMeta {
  name: string | null;
  description: string | null;
  image: string | null;
  skills: string[];
  services: { name: string; endpoint: string }[];
  raw: Record<string, unknown> | null;
}

const EMPTY_META: AgentMeta = {
  name: null,
  description: null,
  image: null,
  skills: [],
  services: [],
  raw: null,
};

/**
 * Parse a data:application/json;base64,<base64> URI.
 * Returns null if not a data URI or parsing fails.
 */
function parseDataUri(uri: string): Record<string, unknown> | null {
  if (!uri.startsWith("data:")) return null;
  const match = uri.match(/^data:application\/json;base64,(.+)$/);
  if (!match?.[1]) return null;
  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf-8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Extract skills/domains from ERC-8004 metadata services array.
 */
function extractSkills(data: Record<string, unknown>): string[] {
  const skills = new Set<string>();

  // From services[].skills array (OASF format)
  const services = data.services as { skills?: string[]; domains?: string[] }[] | undefined;
  if (Array.isArray(services)) {
    for (const svc of services) {
      if (Array.isArray(svc.skills)) {
        for (const skill of svc.skills) {
          // Extract last part of path: "natural_language_processing/text_classification" → "text classification"
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

  // From top-level tags/skills arrays
  const topSkills = data.skills ?? data.tags ?? data.categories;
  if (Array.isArray(topSkills)) {
    for (const s of topSkills) {
      if (typeof s === "string") skills.add(s.replace(/_/g, " "));
    }
  }

  return Array.from(skills).slice(0, 6);
}

/**
 * Extract service endpoints from metadata.
 */
function extractServices(data: Record<string, unknown>): { name: string; endpoint: string }[] {
  const services = data.services as { name?: string; endpoint?: string }[] | undefined;
  if (!Array.isArray(services)) return [];
  return services
    .filter((s) => s.name && s.endpoint)
    .map((s) => ({ name: String(s.name), endpoint: String(s.endpoint) }))
    .slice(0, 5);
}

/**
 * Parse an agent URI into structured metadata.
 * For data URIs: decodes and parses inline.
 * For URLs: returns a stub with the URL (call fetchMetadataFromUrl for full data).
 */
export function parseAgentUri(uri: string | null | undefined): AgentMeta {
  if (!uri || uri.trim() === "") return { ...EMPTY_META };

  // Data URI: parse inline
  const data = parseDataUri(uri);
  if (data) {
    return {
      name: typeof data.name === "string" ? data.name : null,
      description: typeof data.description === "string" ? data.description : null,
      image: typeof data.image === "string" ? data.image : null,
      skills: extractSkills(data),
      services: extractServices(data),
      raw: data,
    };
  }

  // URL: extract name from hostname or meaningful path segment
  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    try {
      const url = new URL(uri);
      // Use hostname without common prefixes/suffixes as a rough name
      const host = url.hostname
        .replace(/^www\./, "")
        .replace(/\.(com|io|xyz|org|net|ai|app|dev)$/, "");
      // Only use hostname if it's not too generic
      const hostName = host.length > 2 && !/^\d+$/.test(host) ? host : null;
      return {
        ...EMPTY_META,
        name: hostName,
      };
    } catch {
      return { ...EMPTY_META };
    }
  }

  return { ...EMPTY_META };
}
