import { FileWarning, MapPinOff } from "lucide-react";

/**
 * Shared console states so an empty database and a failed read are never
 * presented the same way, and never as a wall of numbers that is quietly missing
 * its data.
 */

/** No destinations at all — the operator must configure one before the console can show anything. */
export function EmptyDestinations() {
  return (
    <div className="state-block" role="status">
      <span className="icon-box icon-box--large">
        <MapPinOff aria-hidden="true" size={23} />
      </span>
      <h2>No destinations yet</h2>
      <p>
        Destinations, a capacity configuration and a daily quota must exist before permits or
        occupancy have anywhere to apply. Add a destination to begin monitoring.
      </p>
    </div>
  );
}

/** A read that failed. Reports generically; details are logged server-side. */
export function ConsoleError({ message }: { message: string }) {
  return (
    <div className="state-block state-block--error" role="alert">
      <span className="icon-box icon-box--large">
        <FileWarning aria-hidden="true" size={23} />
      </span>
      <h2>Unable to load this view</h2>
      <p>{message}</p>
    </div>
  );
}
