import type { CSSProperties } from "react";

import type { DistributionHealthResult } from "@/lib/distribution-health";

type DistributionHealthProps = {
  result: DistributionHealthResult;
};

const formatOneDecimal = (value: number) =>
  value.toFixed(1);

export default function DistributionHealth({
  result,
}: DistributionHealthProps) {
  const scoreStyle = {
    "--distribution-health-score": `${result.score}%`,
  } as CSSProperties;

  const trendIncluded =
    result.trendWeightPercent > 0 &&
    result.trendScore !== null;

  return (
    <section
      className="distribution-health-card"
      aria-labelledby="distribution-health-title"
    >
      <div className="distribution-health-overview">
        <div>
          <p className="eyebrow">
            Observable on-chain distribution
          </p>

          <h2 id="distribution-health-title">
            Distribution health
          </h2>

          <p className="distribution-health-status">
            {result.label}
          </p>
        </div>

        <div
          className="distribution-health-score"
          aria-label={`Distribution health score ${result.score} out of 100, ${result.label}`}
        >
          <strong>{result.score}</strong>
          <span>/ 100</span>
        </div>
      </div>

      <div
        className="distribution-health-scale"
        style={scoreStyle}
      >
        <div className="distribution-health-track">
          <span
            className="distribution-health-marker"
            aria-hidden="true"
          />
        </div>

        <div className="distribution-health-scale-labels">
          <span>More concentrated</span>
          <span>More distributed</span>
        </div>
      </div>

      <p className="distribution-health-history">
        {result.provisional ? "Provisional · " : ""}
        {result.historyDays}{" "}
        {result.historyDays === 1 ? "day" : "days"} of
        history · {result.historyObservations}{" "}
        {result.historyObservations === 1
          ? "observation"
          : "observations"}
      </p>

      <div className="distribution-health-explanation">
        <p>
          Measures the observable on-chain distribution of the
          collection, not its quality, value or future
          performance.
        </p>

        <details className="distribution-health-details">
          <summary>
            <span className="distribution-health-details-closed">
              More details
            </span>
            <span className="distribution-health-details-open">
              Hide details
            </span>
            <i aria-hidden="true">⌄</i>
          </summary>

          <div className="distribution-health-details-body">
            <div className="distribution-health-details-heading">
              <div>
                <p className="eyebrow">
                  Methodology v
                  {result.methodologyVersion}
                </p>

                <h3>How the score is calculated</h3>
              </div>

              <p>
                The final score combines the current ownership
                structure with a 30-day trend when enough daily
                history is available.
              </p>
            </div>

            <section className="distribution-health-breakdown">
              <div className="distribution-health-section-title">
                <div>
                  <h4>Current structure</h4>
                  <p>
                    {formatOneDecimal(
                      result.structureScore,
                    )}{" "}
                    / 100
                  </p>
                </div>

                <strong>
                  {formatOneDecimal(
                    result.structureWeightPercent,
                  )}
                  % of final score
                </strong>
              </div>

              <div className="distribution-health-metric-list">
                {result.structureMetrics.map((metric) => (
                  <article
                    className="distribution-health-metric"
                    key={metric.key}
                  >
                    <div className="distribution-health-metric-copy">
                      <strong>{metric.label}</strong>
                      <span>
                        Current value:{" "}
                        {metric.formattedValue} ·{" "}
                        {metric.direction}
                      </span>
                      <p>{metric.definition}</p>
                    </div>

                    <div className="distribution-health-metric-numbers">
                      <span>
                        <small>Sub-score</small>
                        <strong>
                          {formatOneDecimal(
                            metric.subscore,
                          )}{" "}
                          / 100
                        </strong>
                      </span>

                      <span>
                        <small>Weight</small>
                        <strong>
                          {formatOneDecimal(
                            metric.weightPercent,
                          )}
                          %
                        </strong>
                      </span>

                      <span>
                        <small>Points</small>
                        <strong>
                          {formatOneDecimal(
                            metric.weightedPoints,
                          )}{" "}
                          /{" "}
                          {formatOneDecimal(
                            metric.maxPoints,
                          )}
                        </strong>
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="distribution-health-breakdown">
              <div className="distribution-health-section-title">
                <div>
                  <h4>
                    {result.trendWindowDays > 0
                      ? `${result.trendWindowDays}-day trend`
                      : "30-day trend"}
                  </h4>
                  <p>
                    {result.trendScore !== null
                      ? `${formatOneDecimal(
                          result.trendScore,
                        )} / 100`
                      : "Not included yet"}
                  </p>
                </div>

                <strong>
                  {formatOneDecimal(
                    result.trendWeightPercent,
                  )}
                  % of final score
                </strong>
              </div>

              {trendIncluded ? (
                <>
                  <p className="distribution-health-trend-intro">
                    The median of the first three valid
                    observations in the period is compared with
                    the median of the latest three.
                  </p>

                  <div className="distribution-health-metric-list">
                    {result.trendMetrics.map((metric) => (
                      <article
                        className="distribution-health-metric"
                        key={metric.key}
                      >
                        <div className="distribution-health-metric-copy">
                          <strong>{metric.label}</strong>
                          <span>
                            {metric.formattedBaseline} →{" "}
                            {metric.formattedCurrent} ·{" "}
                            {metric.formattedChange} ·{" "}
                            {metric.direction}
                          </span>
                          <p>{metric.definition}</p>
                        </div>

                        <div className="distribution-health-metric-numbers">
                          <span>
                            <small>Sub-score</small>
                            <strong>
                              {formatOneDecimal(
                                metric.subscore,
                              )}{" "}
                              / 100
                            </strong>
                          </span>

                          <span>
                            <small>Weight</small>
                            <strong>
                              {formatOneDecimal(
                                metric.weightPercent,
                              )}
                              %
                            </strong>
                          </span>

                          <span>
                            <small>Points</small>
                            <strong>
                              {formatOneDecimal(
                                metric.weightedPoints,
                              )}{" "}
                              /{" "}
                              {formatOneDecimal(
                                metric.maxPoints,
                              )}
                            </strong>
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <p className="distribution-health-trend-empty">
                  At least 14 calendar days and six valid daily
                  observations are required before trend is
                  included. From 14 to 29 days it weighs 15%; from
                  30 days onward it weighs 25%.
                </p>
              )}
            </section>

            <div className="distribution-health-final">
              <div>
                <span>Current structure</span>
                <strong>
                  {formatOneDecimal(
                    result.structureScore,
                  )}{" "}
                  ×{" "}
                  {formatOneDecimal(
                    result.structureWeightPercent,
                  )}
                  %
                </strong>
              </div>

              <div>
                <span>Trend</span>
                <strong>
                  {result.trendScore !== null
                    ? formatOneDecimal(
                        result.trendScore,
                      )
                    : "—"}{" "}
                  ×{" "}
                  {formatOneDecimal(
                    result.trendWeightPercent,
                  )}
                  %
                </strong>
              </div>

              <div>
                <span>Final Distribution health</span>
                <strong>{result.score} / 100</strong>
              </div>
            </div>

            <p className="distribution-health-warning">
              Addresses do not necessarily represent individual
              owners. The score evaluates observable on-chain
              distribution only and should not be interpreted as
              investment advice.
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}
