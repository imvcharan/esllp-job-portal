export interface ApplicationSourceAttributionInput {
  source?: string;
  medium?: string;
  campaign?: string;
}

export interface ApplicationSourceAttribution {
  source: string | null;
  medium: string | null;
  campaign: string | null;
}

function normalizeValue(value?: string): string | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 64)
    .replace(/[-._]+$/g, "");
  return normalized || null;
}

export function normalizeApplicationSourceAttribution(
  input?: ApplicationSourceAttributionInput,
): ApplicationSourceAttribution | null {
  if (!input) return null;
  const attribution = {
    source: normalizeValue(input.source),
    medium: normalizeValue(input.medium),
    campaign: normalizeValue(input.campaign),
  };
  return Object.values(attribution).some(Boolean) ? attribution : null;
}
