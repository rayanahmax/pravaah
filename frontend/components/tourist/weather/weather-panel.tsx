import type { ReactNode } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Sun,
  Thermometer,
  Umbrella,
  Wind,
} from "lucide-react";
import { StatusPill, type PillTone } from "@/components/tourist/ui";
import type { AdvisoryLevel, WeatherReport } from "@/lib/weather";
import styles from "./weather.module.css";

/**
 * Presentation of a normalised weather report (PRD §15).
 *
 * Purely a renderer: every value, the advisory level and its wording come from
 * lib/weather.ts, so this component cannot invent a condition or upgrade a level.
 * It receives a result that has already been decided, including the failure
 * cases, and never fetches.
 */

const LEVEL_TONE: Record<AdvisoryLevel, PillTone> = {
  CLEAR: "green",
  ADVISORY: "pending",
  POOR: "restricted",
};

const LEVEL_LABEL: Record<AdvisoryLevel, string> = {
  CLEAR: "No concerns",
  ADVISORY: "Extra care",
  POOR: "Unfavourable",
};

/**
 * Returns the element, not a component type. Next 16's static-components rule
 * rejects a component whose identity is computed during render, so each icon is
 * named at its own call site.
 */
function weatherIcon(code: number): ReactNode {
  const props = { size: 34, strokeWidth: 1.5, "aria-hidden": true } as const;
  if (code >= 95) return <CloudLightning {...props} />;
  if ([56, 57, 66, 67, 71, 73, 75, 77, 85, 86].includes(code)) return <CloudSnow {...props} />;
  if ([45, 48].includes(code)) return <CloudFog {...props} />;
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return <CloudRain {...props} />;
  if (code === 0) return <Sun {...props} />;
  if (code === 1 || code === 2) return <CloudSun {...props} />;
  if (code === 3) return <Cloud {...props} />;
  return <CloudDrizzle {...props} />;
}

/**
 * Format the provider's observation instant in the destination's own zone.
 * The timezone string comes from an external response, so an unparseable value
 * falls back to the server's locale rather than throwing and taking the page down
 * with it — weather must never break a destination view (PRD §15).
 */
function formatObserved(iso: string, timeZone: string): string {
  const stamp = Date.parse(iso);
  if (Number.isNaN(stamp)) return iso;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(new Date(stamp));
  } catch {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(stamp)
    );
  }
}

export function WeatherPanel({ report }: { report: WeatherReport }) {
  const { current, advisory } = report;

  const stats: Array<{ label: string; value: string; icon: ReactNode }> = [
    {
      label: "Feels like",
      value: `${Math.round(current.feelsLikeC)}°C`,
      icon: <Thermometer size={14} aria-hidden="true" />,
    },
    {
      label: "Humidity",
      value: `${Math.round(current.relativeHumidity)}%`,
      icon: <Droplets size={14} aria-hidden="true" />,
    },
    {
      label: "Wind",
      value: `${Math.round(current.windSpeedKmh)} km/h`,
      icon: <Wind size={14} aria-hidden="true" />,
    },
    {
      label: "Precipitation",
      value: `${current.precipitationMm} mm/h`,
      icon: <Umbrella size={14} aria-hidden="true" />,
    },
  ];

  return (
    <section className={styles.panel} aria-label="Weather and conditions">
      <div className={styles.head}>
        <div className={styles.headText}>
          <p className={styles.eyebrow}>Weather &amp; conditions</p>
          <span className={styles.tag}>Informational only</span>
        </div>
        <StatusPill tone={LEVEL_TONE[advisory.level]} dot>
          {LEVEL_LABEL[advisory.level]}
        </StatusPill>
      </div>

      <div className={styles.current}>
        <span className={styles.icon} aria-hidden="true">
          {weatherIcon(current.weatherCode)}
        </span>
        <div className={styles.reading}>
          <strong className={styles.temp}>
            {Math.round(current.temperatureC)}
            <span className={styles.unit}>°C</span>
          </strong>
          <p className={styles.condition}>{report.condition}</p>
        </div>
      </div>

      <dl className={styles.stats}>
        {stats.map((stat) => (
          <div key={stat.label} className={styles.stat}>
            <dt>{stat.icon} {stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>

      <p className={styles.advisory} data-level={advisory.level}>
        {advisory.headline}
      </p>

      {advisory.factors.length > 0 ? (
        <ul className={styles.factors} aria-label="Reported factors">
          {advisory.factors.map((factor) => (
            <li key={factor}>{factor}</li>
          ))}
        </ul>
      ) : null}

      <p className={styles.meta}>
        Observed {formatObserved(current.observedAt, current.timezone)} · {current.timezone}
      </p>
      <p className={styles.disclaimer}>
        Reported conditions from an external service. Informational only — it is not a safety
        clearance and does not decide access. Capacity, quota and the department&apos;s access
        status govern whether you may enter.
      </p>
    </section>
  );
}

/**
 * The failure state. Two distinct causes, because they need different answers: a
 * destination nobody geolocated is a data fix for the department, while an outage
 * is temporary and must be visibly harmless to the rest of the page.
 */
export function WeatherUnavailable({ reason, message }: { reason: string; message: string }) {
  const configure = reason === "NOT_CONFIGURED";
  return (
    <section className={styles.panel} aria-label="Weather and conditions" data-failed="true">
      <div className={styles.head}>
        <div className={styles.headText}>
          <p className={styles.eyebrow}>Weather &amp; conditions</p>
          <span className={styles.tag}>Informational only</span>
        </div>
        <StatusPill tone="default" dot>
          {configure ? "Not set up" : "Unavailable"}
        </StatusPill>
      </div>
      <p className={styles.advisory} data-level="CLEAR">
        {message}
      </p>
      <p className={styles.disclaimer}>
        {configure
          ? "Ask the department to record coordinates for this destination. Everything else on this page is unaffected."
          : "This is temporary and affects nothing else: permits, capacity, quota and access all continue to work."}
      </p>
    </section>
  );
}
