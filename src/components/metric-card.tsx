type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
  status?: "snapshot" | "demo";
};

export function MetricCard({
  label,
  value,
  detail,
  status,
}: MetricCardProps) {
  return (
    <article className="metric-card">
      <div className="metric-card-head">
        <p className="eyebrow">{label}</p>

        {status ? (
          <span className={`metric-status metric-status-${status}`}>
            {status}
          </span>
        ) : null}
      </div>

      <p className="metric-value">{value}</p>
      <p className="metric-detail">{detail}</p>
    </article>
  );
}
