import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function SectionTitle({
  children,
  help,
  action,
}: {
  children: ReactNode;
  help?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{children}</h2>
        {help && (
          <span className="method-help" tabIndex={0} title={help} aria-label={help}>
            <HelpCircle size={15} />
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

export function Kpi({
  label,
  value,
  detail,
  tone = "brand",
  icon,
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  tone?: "brand" | "positive" | "negative" | "warning";
  icon: ReactNode;
}) {
  return (
    <Card className="kpi">
      <span className={`kpi-icon ${tone}`}>{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </Card>
  );
}

export function Avatar({ name, color = 0 }: { name: string; color?: number }) {
  return (
    <span className={`avatar avatar-${color % 4}`} aria-hidden="true">
      {name.split(" ").map((part) => part[0]).join("").slice(0, 2)}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="empty-state">
      <strong>{title}</strong>
      <p>{children}</p>
    </Card>
  );
}
