import type { LucideIcon } from "lucide-react";

export function StatusCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: "default" | "accent" | "positive";
}) {
  return (
    <article className="status-card" data-tone={tone}>
      <div className="status-card__top">
        <p>{label}</p>
        <span className="icon-box"><Icon aria-hidden="true" size={20} /></span>
      </div>
      <p className="status-card__value">{value}</p>
      <p className="status-card__detail">{detail}</p>
    </article>
  );
}
