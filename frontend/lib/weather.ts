/**
 * Pure weather normalisation and advisory rules (PRD §15, Phase 15).
 *
 * No I/O and no clock, following the convention set by lib/capacity.ts and
 * lib/permit-rules.ts: the provider payload and the retrieval instant arrive as
 * arguments, so every rule here is deterministic and directly testable.
 *
 * Hard limits, because weather is the surface most likely to be mistaken for
 * authority:
 *  - Informational only. Nothing here decides access. The department's
 *    `access_status` and the capacity engine own that, and a POOR advisory must
 *    never be read as a closure (AGENTS rules 6-7).
 *  - Describes conditions being OBSERVED now. It makes no forecast: PRD §4 lists
 *    "AI weather prediction" as out of scope and AGENTS rule 13 forbids using AI
 *    for authoritative weather or disaster calls. There is no model and no
 *    inference in this file — only thresholds against reported values.
 *  - Not a safety clearance. It is the same kind of statement as the readiness
 *    checklist: context the visitor weighs, not permission to enter.
 */

/** WMO 4677 interpretation codes, as returned by Open-Meteo `weather_code`. */
export const WMO_CONDITIONS: Readonly<Record<number, string>> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snowfall",
  73: "Moderate snowfall",
  75: "Heavy snowfall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

/**
 * Advisory thresholds. Named rather than inlined so a reviewer can see the whole
 * policy in one place and a later phase can tune it against real field data.
 */
export const WEATHER_THRESHOLDS = {
  /** km/h at 10 m. Above this, exposed sections become uncomfortable. */
  strongWindKmh: 40,
  /** km/h. Above this, movement on ridgelines is genuinely hindered. */
  severeWindKmh: 65,
  /** mm in the current hour. */
  heavyPrecipMm: 7,
  /** °C apparent temperature. */
  coldC: 2,
  /** °C apparent temperature. */
  hotC: 38,
} as const;

/** Codes that mean electrical storm activity at the destination right now. */
const THUNDERSTORM_CODES: readonly number[] = [95, 96, 99];
/**
 * Codes whose precipitation is snow, or freezes on contact. Freezing drizzle is
 * included deliberately: it glazes surfaces at low rates and is the more
 * dangerous of the two light variants, so it must not fall through to the plain
 * "wet conditions" branch.
 */
const ICE_CODES: readonly number[] = [56, 57, 66, 67, 71, 73, 75, 77, 85, 86];
/** Ice codes reported at a rate that ices trails and routes rather than dusting them. */
const SEVERE_ICE_CODES: readonly number[] = [67, 75, 86];
/** Codes that reduce visibility directly. */
const FOG_CODES: readonly number[] = [45, 48];
/** Any code that reports falling water. */
const RAIN_CODES: readonly number[] = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82];

export type AdvisoryLevel = "CLEAR" | "ADVISORY" | "POOR";

export type WeatherConditions = {
  temperatureC: number;
  feelsLikeC: number;
  relativeHumidity: number;
  /** Millimetres of precipitation in the reported hour. */
  precipitationMm: number;
  /** Wind speed in km/h at 10 m. */
  windSpeedKmh: number;
  weatherCode: number;
  /** The provider's own observation instant, ISO 8601 with its offset. */
  observedAt: string;
  /** IANA zone the provider resolved for this coordinate. */
  timezone: string;
};

export type WeatherAdvisory = {
  level: AdvisoryLevel;
  /** One sentence for the panel. Never phrased as permission or a warning order. */
  headline: string;
  /** The individual factors that produced the level, for display as chips. */
  factors: string[];
};

export type WeatherReport = {
  destinationId: string;
  available: true;
  source: "open-meteo";
  condition: string;
  current: WeatherConditions;
  advisory: WeatherAdvisory;
  /** When this server fetched the report, not when the observation was taken. */
  retrievedAt: string;
};

/** An unknown code still has to render something, and must not invent a label. */
export function describeWeatherCode(code: number): string {
  return WMO_CONDITIONS[code] ?? "Conditions unreported";
}

/**
 * Map observed values onto an advisory level.
 *
 * Every factor is collected, then the highest severity wins: a destination with
 * both thunderstorms and heat reports POOR and lists both, rather than the first
 * rule that happened to match. Ordering by severity rather than returning early is
 * what keeps the factor list honest.
 */
export function deriveAdvisory(conditions: WeatherConditions): WeatherAdvisory {
  const factors: string[] = [];
  let level: AdvisoryLevel = "CLEAR";

  const raise = (candidate: AdvisoryLevel) => {
    const rank: Record<AdvisoryLevel, number> = { CLEAR: 0, ADVISORY: 1, POOR: 2 };
    if (rank[candidate] > rank[level]) level = candidate;
  };

  if (THUNDERSTORM_CODES.includes(conditions.weatherCode)) {
    factors.push("Thunderstorm reported");
    raise("POOR");
  }

  if (ICE_CODES.includes(conditions.weatherCode)) {
    factors.push("Snow or freezing precipitation");
    raise(SEVERE_ICE_CODES.includes(conditions.weatherCode) ? "POOR" : "ADVISORY");
  }

  if (FOG_CODES.includes(conditions.weatherCode)) {
    factors.push("Reduced visibility from fog");
    raise("ADVISORY");
  }

  if (conditions.precipitationMm >= WEATHER_THRESHOLDS.heavyPrecipMm) {
    factors.push(`Heavy precipitation (${conditions.precipitationMm} mm/h)`);
    raise("POOR");
  } else if (
    conditions.precipitationMm > 0 ||
    RAIN_CODES.includes(conditions.weatherCode)
  ) {
    factors.push("Wet conditions");
    raise("ADVISORY");
  }

  if (conditions.windSpeedKmh >= WEATHER_THRESHOLDS.severeWindKmh) {
    factors.push(`Severe wind (${conditions.windSpeedKmh} km/h)`);
    raise("POOR");
  } else if (conditions.windSpeedKmh >= WEATHER_THRESHOLDS.strongWindKmh) {
    factors.push(`Strong wind (${conditions.windSpeedKmh} km/h)`);
    raise("ADVISORY");
  }

  if (conditions.feelsLikeC <= WEATHER_THRESHOLDS.coldC) {
    factors.push(`Cold (${conditions.feelsLikeC}°C feels-like)`);
    raise("ADVISORY");
  } else if (conditions.feelsLikeC >= WEATHER_THRESHOLDS.hotC) {
    factors.push(`Heat (${conditions.feelsLikeC}°C feels-like)`);
    raise("ADVISORY");
  }

  return { level, headline: headlineFor(level, factors), factors };
}

/**
 * The wording is load-bearing. POOR says conditions are unfavourable and the
 * visitor should reconsider; it never says the destination is closed, because only
 * a department access override can do that. CLEAR stays quiet rather than
 * implying an all-clear, which would be a prediction this phase may not make.
 */
function headlineFor(level: AdvisoryLevel, factors: string[]): string {
  if (level === "POOR") {
    return `Conditions are currently unfavourable (${factors.length} ${
      factors.length === 1 ? "factor" : "factors"
    } reported). Consider postponing exposed sections — the destination's access status still governs.`;
  }
  if (level === "ADVISORY") {
    return "Conditions call for extra care. Plan for the factors listed below.";
  }
  return "No adverse conditions reported at the last observation.";
}

/** Assemble the normalised report the API and UI both consume. */
export function buildWeatherReport(
  destinationId: string,
  current: WeatherConditions,
  retrievedAt: string
): WeatherReport {
  return {
    destinationId,
    available: true,
    source: "open-meteo",
    condition: describeWeatherCode(current.weatherCode),
    current,
    advisory: deriveAdvisory(current),
    retrievedAt,
  };
}

/* ---------------------------------------------------------------------------
   Provider parsing
   Turning an Open-Meteo body into WeatherConditions is arithmetic on a payload,
   not I/O, so it lives here where it can be tested against a captured response.
   services/weather.ts keeps only the fetch.
   --------------------------------------------------------------------------- */

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Open-Meteo returns `current.time` in the site's own zone, which is what a
 * visitor should read but is not a machine instant. Re-attach the provider's
 * reported UTC offset so the timestamp is unambiguous; if it already carries one,
 * leave it alone rather than appending a second.
 */
export function toInstant(localTime: string, utcOffsetSeconds: unknown): string {
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(localTime)) return localTime;
  if (typeof utcOffsetSeconds !== "number" || !Number.isFinite(utcOffsetSeconds)) {
    return localTime;
  }
  const sign = utcOffsetSeconds >= 0 ? "+" : "-";
  const abs = Math.abs(utcOffsetSeconds);
  return `${localTime}${sign}${pad2(Math.floor(abs / 3600))}:${pad2(Math.floor((abs % 3600) / 60))}`;
}

/** Open-Meteo emits null for a variable a station does not report. */
function finiteOr(value: unknown, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Strict shape check on a decoded provider body.
 *
 * Returns null for anything unexpected rather than guessing, so a silent schema
 * drift upstream surfaces as a clean "unavailable" panel instead of a panel of
 * NaNs. A missing `weather_code` is refused rather than defaulted to 0, because 0
 * means "clear sky" and would be an invented observation.
 */
export function parseOpenMeteoCurrent(json: unknown): WeatherConditions | null {
  if (typeof json !== "object" || json === null) return null;

  const envelope = json as { current?: unknown; timezone?: unknown; utc_offset_seconds?: unknown };
  if (typeof envelope.current !== "object" || envelope.current === null) return null;

  const c = envelope.current as Record<string, unknown>;
  if (typeof c.time !== "string" || c.time === "") return null;
  if (c.weather_code === null || c.weather_code === undefined) return null;

  const temperature = finiteOr(c.temperature_2m, NaN);
  if (!Number.isFinite(temperature)) return null;

  return {
    temperatureC: temperature,
    feelsLikeC: finiteOr(c.apparent_temperature, temperature),
    relativeHumidity: finiteOr(c.relative_humidity_2m, 0),
    precipitationMm: finiteOr(c.precipitation, 0),
    windSpeedKmh: finiteOr(c.wind_speed_10m, 0),
    weatherCode: Math.trunc(Number(c.weather_code)),
    observedAt: toInstant(c.time, envelope.utc_offset_seconds),
    timezone: typeof envelope.timezone === "string" ? envelope.timezone : "unknown",
  };
}
