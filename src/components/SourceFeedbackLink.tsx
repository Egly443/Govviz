import type { TrendSeries } from "./data";

const REPO_ISSUE =
  "https://github.com/Egly443/Govviz/issues/new?template=data-quality.yml";
const SITE_DATA = "https://egly443.github.io/Govviz/data";

function issueUrl(series: TrendSeries, observedValue?: string) {
  const params = new URLSearchParams({
    title: `[data-quality]: ${series.id}`,
  });
  const body = [
    `Series id: ${series.id}`,
    `Govviz record: ${SITE_DATA}/series/${series.id}.json`,
    `Official source: ${series.sourceUrl}`,
    observedValue ? `Observed value: ${observedValue}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  params.set("body", body);
  return `${REPO_ISSUE}&${params.toString()}`;
}

export function SourceFeedbackLink({
  series,
  observedValue,
  className = "underline decoration-dotted underline-offset-2 hover:text-foreground",
}: {
  series: TrendSeries;
  observedValue?: string;
  className?: string;
}) {
  return (
    <a
      href={issueUrl(series, observedValue)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title="Report a wrong value, stale source, unclear definition, unit/geography issue, or agent-consumption failure"
    >
      Report data issue
    </a>
  );
}
