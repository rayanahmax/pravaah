/**
 * Open-Meteo client for destination conditions (Phase 15, PRD §15).
 *
 * The provider is the one PRD §15 names. It needs no API key, so there is no
 * secret to manage and nothing to leak to the browser.
 *
 * Contract with the rest of the app: this function NEVER throws. Every failure —
 * missing coordinates, a timeout, a non-2xx, a body that does not match the
 * expected shape — comes back as a typed result instead. That is what makes
 * PRD §15's "weather failure must not break permits or occupancy" true rather than
 * aspirational: a caller cannot accidentally propagate an exception into a
 * capacity or permit path, and the destination page renders a failure panel
 * rather than erroring.
 *
 * Caching, and a warning about it: `next.revalidate` asks for a ten-minute
 * window, which is the right policy for production — current conditions do not
 * move faster than that, and hammering a free service is discourteous. But the
 * bundled Next 16 fetch docs are explicit that the default `auto no cache`
 * behaviour re-fetches from the remote on EVERY request in development, and that
 * `next.revalidate` is ignored there. So in `next dev` this function does call
 * Open-Meteo on each render, and repeated local refreshes can consume a daily
 * request cap. That is not hypothetical: it is how this integration hit
 * "Daily API request limit exceeded" during its own verification.
 */

import { parseOpenMeteoCurrent, buildWeatherReport, type WeatherReport } from "@/lib/weather";
import type { DestinationRow } from "@/types/rows";

const DEFAULT_BASE_URL = "https://api.open-meteo.com/v1/forecast";
const REQUEST_TIMEOUT_MS = 5000;
const REVALIDATE_SECONDS = 600;

/** The fields we normalise. Requesting only these keeps the payload small. */
const CURRENT_FIELDS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "precipitation",
  "wind_speed_10m",
  "weather_code",
] as const;

export type WeatherFailureCode = "NOT_CONFIGURED" | "UPSTREAM_UNAVAILABLE";

export type WeatherResult =
  | { ok: true; report: WeatherReport }
  | { ok: false; code: WeatherFailureCode; message: string };

function baseUrl(): string {
  return process.env.WEATHER_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

/**
 * Fetch normalised current conditions for one destination.
 *
 * Takes the already-loaded destination row rather than an id: the caller has it
 * for the capacity and quota reads anyway, so this adds no database round trip.
 */
export async function fetchDestinationWeather(
  destination: Pick<DestinationRow, "id" | "latitude" | "longitude">
): Promise<WeatherResult> {
  if (destination.latitude === null || destination.longitude === null) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message:
        "This destination has no coordinates recorded, so local conditions cannot be looked up.",
    };
  }

  // Guard the coordinate range too: a mistyped row would otherwise be sent to an
  // external service and fail there with a less useful message.
  const lat = Number(destination.latitude);
  const lon = Number(destination.longitude);
  if (
    !Number.isFinite(lat) || !Number.isFinite(lon) ||
    lat < -90 || lat > 90 || lon < -180 || lon > 180
  ) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message: "The coordinates recorded for this destination are not valid.",
    };
  }

  const url = new URL(baseUrl());
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lon.toFixed(4));
  url.searchParams.set("current", CURRENT_FIELDS.join(","));
  url.searchParams.set("timezone", "auto");

  let response: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      response = await fetch(url, {
        signal: controller.signal,
        // Revalidate, not no-store: `cache: "no-store"` would override this and
        // send a request upstream on every page view.
        next: { revalidate: REVALIDATE_SECONDS },
        headers: { accept: "application/json" },
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Timeout, abort, DNS or connection failure. Never surfaced as an exception.
    return {
      ok: false,
      code: "UPSTREAM_UNAVAILABLE",
      message: "The weather service could not be reached. Conditions are temporarily unavailable.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      code: "UPSTREAM_UNAVAILABLE",
      message: `The weather service returned ${response.status}. Conditions are temporarily unavailable.`,
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      code: "UPSTREAM_UNAVAILABLE",
      message: "The weather service returned a response that could not be read.",
    };
  }

  const current = parseOpenMeteoCurrent(payload);
  if (!current) {
    return {
      ok: false,
      code: "UPSTREAM_UNAVAILABLE",
      message: "The weather service returned an unexpected data shape.",
    };
  }

  return {
    ok: true,
    report: buildWeatherReport(destination.id, current, new Date().toISOString()),
  };
}
