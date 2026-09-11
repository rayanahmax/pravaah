/**
 * Weather rule tests (PRD §15).
 *
 * These cover the pure layer only. The provider boundary — timeouts, non-2xx,
 * malformed bodies, the ten-minute cache — lives in services/weather.ts and is
 * exercised against the live endpoint rather than here, because stubbing fetch in
 * Node's built-in runner would mean adding a mocking dependency the plan does not
 * approve (AGENTS rule 2).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildWeatherReport,
  deriveAdvisory,
  describeWeatherCode,
  parseOpenMeteoCurrent,
  toInstant,
  WEATHER_THRESHOLDS,
  type WeatherConditions,
} from "./weather.ts";

function conditions(overrides: Partial<WeatherConditions> = {}): WeatherConditions {
  return {
    temperatureC: 18,
    feelsLikeC: 18,
    relativeHumidity: 55,
    precipitationMm: 0,
    windSpeedKmh: 8,
    weatherCode: 1,
    observedAt: "2026-09-11T09:00+05:30",
    timezone: "Asia/Kolkata",
    ...overrides,
  };
}

test("a known WMO code becomes its published label", () => {
  assert.equal(describeWeatherCode(0), "Clear sky");
  assert.equal(describeWeatherCode(95), "Thunderstorm");
  assert.equal(describeWeatherCode(45), "Fog");
});

test("an unknown code is admitted as unreported rather than invented", () => {
  // A made-up label here would be the module asserting something it does not know.
  assert.equal(describeWeatherCode(12345), "Conditions unreported");
});

test("calm conditions produce no factors and no advisory", () => {
  const advisory = deriveAdvisory(conditions());
  assert.equal(advisory.level, "CLEAR");
  assert.deepEqual(advisory.factors, []);
});

test("thunderstorm is POOR on its own, before any other factor", () => {
  const advisory = deriveAdvisory(conditions({ weatherCode: 95 }));
  assert.equal(advisory.level, "POOR");
  assert.ok(advisory.factors.includes("Thunderstorm reported"));
});

test("hail-bearing thunderstorm codes are treated as thunderstorms", () => {
  for (const code of [96, 99]) {
    assert.equal(deriveAdvisory(conditions({ weatherCode: code })).level, "POOR");
  }
});

test("light rain is an advisory, not a warning", () => {
  const advisory = deriveAdvisory(conditions({ weatherCode: 61 }));
  assert.equal(advisory.level, "ADVISORY");
  assert.ok(advisory.factors.some((f) => /wet conditions/i.test(f)));
});

test("a rain code with zero measured precipitation still counts as wet", () => {
  // Open-Meteo reports the code and the amount separately; the code alone is real
  // information and must not be discarded because the gauge reads 0.
  const advisory = deriveAdvisory(conditions({ weatherCode: 80, precipitationMm: 0 }));
  assert.equal(advisory.level, "ADVISORY");
});

test("precipitation at the heavy threshold is POOR, exactly at the boundary", () => {
  const at = deriveAdvisory(conditions({ weatherCode: 1, precipitationMm: WEATHER_THRESHOLDS.heavyPrecipMm }));
  const below = deriveAdvisory(conditions({ weatherCode: 1, precipitationMm: WEATHER_THRESHOLDS.heavyPrecipMm - 0.1 }));
  assert.equal(at.level, "POOR");
  assert.equal(below.level, "ADVISORY");
});

test("fog advises on visibility without escalating to poor", () => {
  for (const code of [45, 48]) {
    const advisory = deriveAdvisory(conditions({ weatherCode: code }));
    assert.equal(advisory.level, "ADVISORY");
    assert.ok(advisory.factors.some((f) => /visibility/i.test(f)));
  }
});

test("light snow advises and heavy snow is poor", () => {
  assert.equal(deriveAdvisory(conditions({ weatherCode: 71 })).level, "ADVISORY");
  assert.equal(deriveAdvisory(conditions({ weatherCode: 75 })).level, "POOR");
  assert.equal(deriveAdvisory(conditions({ weatherCode: 86 })).level, "POOR");
});

test("freezing rain counts as an icy hazard, not merely wet", () => {
  const advisory = deriveAdvisory(conditions({ weatherCode: 67 }));
  assert.ok(advisory.factors.includes("Snow or freezing precipitation"));
  assert.equal(advisory.level, "POOR");
});

test("wind escalates at each threshold boundary", () => {
  const strong = deriveAdvisory(conditions({ windSpeedKmh: WEATHER_THRESHOLDS.strongWindKmh }));
  const mild = deriveAdvisory(conditions({ windSpeedKmh: WEATHER_THRESHOLDS.strongWindKmh - 1 }));
  const severe = deriveAdvisory(conditions({ windSpeedKmh: WEATHER_THRESHOLDS.severeWindKmh }));
  assert.equal(strong.level, "ADVISORY");
  assert.equal(mild.level, "CLEAR");
  assert.equal(severe.level, "POOR");
});

test("temperature uses feels-like, not the raw reading", () => {
  // A cold, windy day at 4°C reads as freezing on the body; the raw number would
  // not trip the rule.
  assert.equal(deriveAdvisory(conditions({ temperatureC: 4, feelsLikeC: -1 })).level, "ADVISORY");
  assert.equal(deriveAdvisory(conditions({ temperatureC: -5, feelsLikeC: 10 })).level, "CLEAR");
});

test("heat advises in the same band as cold", () => {
  const hot = deriveAdvisory(conditions({ feelsLikeC: WEATHER_THRESHOLDS.hotC }));
  assert.equal(hot.level, "ADVISORY");
  assert.ok(hot.factors.some((f) => /heat/i.test(f)));
});

test("freezing drizzle is an icy hazard, not merely wet", () => {
  // 56/57 are in neither the thunder nor snow branch by name, and previously
  // matched no hazard rule at all despite glazing surfaces.
  for (const code of [56, 57, 66]) {
    const advisory = deriveAdvisory(conditions({ weatherCode: code }));
    assert.ok(advisory.factors.includes("Snow or freezing precipitation"), `code ${code}`);
    assert.equal(advisory.level, "ADVISORY", `code ${code}`);
  }
});

test("several factors all survive, and the highest level wins", () => {
  const advisory = deriveAdvisory(conditions({
    weatherCode: 95,
    precipitationMm: 12,
    windSpeedKmh: 70,
    feelsLikeC: -5,
  }));
  assert.equal(advisory.level, "POOR");
  // A thunderstorm code is not an ice code, so exactly these four survive —
  // asserted as a list so the order and wording are pinned too.
  assert.deepEqual(advisory.factors, [
    "Thunderstorm reported",
    "Heavy precipitation (12 mm/h)",
    "Severe wind (70 km/h)",
    "Cold (-5°C feels-like)",
  ]);
});

test("a POOR advisory never states or implies the destination is closed", () => {
  // Only a department access override may close anything (PRD §6, §15). If this
  // wording drifts toward "closed" or "do not enter", the panel would be making an
  // access decision it has no authority to make.
  const advisory = deriveAdvisory(conditions({ weatherCode: 96, precipitationMm: 20 }));
  assert.equal(advisory.level, "POOR");
  assert.doesNotMatch(advisory.headline, /\bclosed\b|\bprohibit|\bforbidden\b|\bmust not enter\b/i);
  assert.match(advisory.headline, /access status still governs/i);
});

test("a clear advisory does not claim the visit is safe", () => {
  // "No adverse conditions reported" is a statement about one observation, not a
  // clearance. Anything stronger would be a prediction (PRD §4 out of scope).
  const advisory = deriveAdvisory(conditions({ weatherCode: 0 }));
  assert.equal(advisory.level, "CLEAR");
  assert.doesNotMatch(advisory.headline, /\bsafe\b|\bguarantee|\bclear to\b/i);
});

test("buildWeatherReport echoes the instant it is given and never reads the clock", () => {
  const retrievedAt = "2026-01-01T00:00:00.000Z";
  const report = buildWeatherReport("dest-1", conditions({ weatherCode: 61 }), retrievedAt);
  assert.equal(report.retrievedAt, retrievedAt);
  assert.equal(report.destinationId, "dest-1");
  assert.equal(report.available, true);
  assert.equal(report.source, "open-meteo");
  assert.equal(report.condition, "Slight rain");
  assert.equal(report.advisory.level, "ADVISORY");
});

test("the report is deterministic for identical input", () => {
  const input = conditions({ weatherCode: 82, precipitationMm: 9, windSpeedKmh: 50 });
  const a = buildWeatherReport("d", input, "2026-09-11T00:00:00.000Z");
  const b = buildWeatherReport("d", input, "2026-09-11T00:00:00.000Z");
  assert.deepEqual(a, b);
});

/* ---------------------------------------------------------------------------
   Provider parsing. The live API could not be exercised today (Open-Meteo
   reported its daily cap for this network), so the shape contract is pinned
   here against a captured body instead of left to a manual check.
   --------------------------------------------------------------------------- */

/** A real-shaped Open-Meteo response, trimmed to the fields we read. */
const CAPTURED = {
  latitude: 13.3125,
  longitude: 77.63672,
  generationtime_ms: 0.0847,
  utc_offset_seconds: 19800,
  timezone: "Asia/Kolkata",
  timezone_abbreviation: "GMT+5:30",
  elevation: 890,
  current_units: {
    time: "iso8601",
    interval: "seconds",
    temperature_2m: "°C",
    relative_humidity_2m: "%",
    apparent_temperature: "°C",
    precipitation: "mm",
    weather_code: "wmo code",
    wind_speed_10m: "km/h",
  },
  current: {
    time: "2026-09-11T18:15",
    interval: 900,
    temperature_2m: 24.3,
    relative_humidity_2m: 72,
    apparent_temperature: 25.1,
    precipitation: 0.2,
    weather_code: 3,
    wind_speed_10m: 11.4,
  },
};

/** Assert-and-return so the compiler narrows; assert.ok alone does not cross statements. */
function requireParsed(json: unknown): WeatherConditions {
  const parsed = parseOpenMeteoCurrent(json);
  assert.ok(parsed, "expected the body to parse");
  return parsed;
}

test("a captured Open-Meteo body normalises into conditions", () => {
  const parsed = requireParsed(CAPTURED);
  assert.equal(parsed.temperatureC, 24.3);
  assert.equal(parsed.feelsLikeC, 25.1);
  assert.equal(parsed.relativeHumidity, 72);
  assert.equal(parsed.precipitationMm, 0.2);
  assert.equal(parsed.windSpeedKmh, 11.4);
  assert.equal(parsed.weatherCode, 3);
  assert.equal(parsed.timezone, "Asia/Kolkata");
  // Provider gives local wall time; the offset makes it a real instant.
  assert.equal(parsed.observedAt, "2026-09-11T18:15+05:30");
});

test("a parsed body flows through to a labelled report", () => {
  const report = buildWeatherReport("dest-9", requireParsed(CAPTURED), "2026-09-11T12:45:00.000Z");
  assert.equal(report.condition, "Overcast");
  assert.equal(report.advisory.level, "ADVISORY"); // 0.2 mm of precipitation
  assert.equal(report.destinationId, "dest-9");
});

test("a missing weather_code is refused rather than read as clear sky", () => {
  const body = structuredClone(CAPTURED);
  delete (body.current as Record<string, unknown>).weather_code;
  assert.equal(parseOpenMeteoCurrent(body), null);
});

test("a missing temperature is refused, not defaulted to zero degrees", () => {
  const body = structuredClone(CAPTURED);
  (body.current as Record<string, unknown>).temperature_2m = null;
  assert.equal(parseOpenMeteoCurrent(body), null);
});

test("an unreported feels-like falls back to the measured temperature", () => {
  const body = structuredClone(CAPTURED);
  (body.current as Record<string, unknown>).apparent_temperature = null;
  assert.equal(requireParsed(body).feelsLikeC, 24.3);
});

test("a station reporting no precipitation reads as zero, not unknown", () => {
  const body = structuredClone(CAPTURED);
  (body.current as Record<string, unknown>).precipitation = null;
  assert.equal(requireParsed(body).precipitationMm, 0);
});

test("bodies missing the current block or the envelope are refused", () => {
  assert.equal(parseOpenMeteoCurrent(null), null);
  assert.equal(parseOpenMeteoCurrent("ok"), null);
  assert.equal(parseOpenMeteoCurrent({}), null);
  assert.equal(parseOpenMeteoCurrent({ current: {} }), null);
  assert.equal(parseOpenMeteoCurrent({ current: { time: "", weather_code: 1 } }), null);
});

test("toInstant attaches a negative offset and never double-suffixes", () => {
  assert.equal(toInstant("2026-01-05T09:00", -18000), "2026-01-05T09:00-05:00");
  assert.equal(toInstant("2026-01-05T09:00Z", 19800), "2026-01-05T09:00Z");
  assert.equal(toInstant("2026-01-05T09:00+05:30", 19800), "2026-01-05T09:00+05:30");
  // No offset reported: the local string is passed through rather than guessed.
  assert.equal(toInstant("2026-01-05T09:00", undefined), "2026-01-05T09:00");
});
