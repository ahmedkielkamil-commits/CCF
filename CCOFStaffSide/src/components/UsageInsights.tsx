import type { UsageReport } from '../api/queue';

function formatShortDate(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00`);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function BarChart({
  rows,
  valueKey,
  labelKey,
  ariaLabel,
  color = 'var(--maroon)',
}: {
  rows: Array<Record<string, string | number>>;
  valueKey: string;
  labelKey: string;
  ariaLabel: string;
  color?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => Number(row[valueKey]) || 0));

  return (
    <div className="bar-chart" role="img" aria-label={ariaLabel}>
      {rows.map((row) => {
        const value = Number(row[valueKey]) || 0;
        const height = Math.max(value > 0 ? 8 : 0, Math.round((value / max) * 100));
        return (
          <div key={String(row[labelKey])} className="bar-chart__item">
            <div className="bar-chart__bar-wrap">
              <div
                className="bar-chart__bar"
                style={{ height: `${height}%`, background: color }}
                title={`${row[labelKey]}: ${value}`}
              />
            </div>
            <span className="bar-chart__value">{value}</span>
            <span className="bar-chart__label">{row[labelKey]}</span>
          </div>
        );
      })}
    </div>
  );
}

function DailyUsageChart({ rows }: { rows: UsageReport['dailyUsage'] }) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.families, row.children]));

  return (
    <div className="daily-chart" role="img" aria-label="Daily families and children checked in">
      {rows.map((row) => (
        <div key={row.date} className="daily-chart__group">
          <div className="daily-chart__bars">
            <div
              className="daily-chart__bar daily-chart__bar--families"
              style={{ height: `${Math.round((row.families / max) * 100)}%` }}
              title={`${formatShortDate(row.date)} families: ${row.families}`}
            />
            <div
              className="daily-chart__bar daily-chart__bar--children"
              style={{ height: `${Math.round((row.children / max) * 100)}%` }}
              title={`${formatShortDate(row.date)} children: ${row.children}`}
            />
          </div>
          <span className="daily-chart__label">{formatShortDate(row.date)}</span>
        </div>
      ))}
    </div>
  );
}

function FunnelChart({ funnel }: { funnel: UsageReport['funnel'] }) {
  const stages = [
    { key: 'joined', label: 'Joined Queue', value: funnel.joined, tone: 'maroon' },
    { key: 'reached', label: 'Reached Clinic', value: funnel.reachedClinic, tone: 'gold' },
    { key: 'roomed', label: 'In Room', value: funnel.roomed, tone: 'blue' },
    { key: 'completed', label: 'Completed', value: funnel.completed, tone: 'green' },
  ];
  const base = Math.max(1, funnel.joined);

  return (
    <div className="funnel-chart" role="img" aria-label="Queue conversion funnel">
      {stages.map((stage, index) => {
        const width = Math.max(28, Math.round((stage.value / base) * 100));
        const prev = index > 0 ? stages[index - 1].value : null;
        const drop =
          prev !== null && prev > 0 ? Math.round(((prev - stage.value) / prev) * 100) : null;
        return (
          <div key={stage.key} className="funnel-chart__stage">
            <div className="funnel-chart__meta">
              <span>{stage.label}</span>
              <strong>{stage.value}</strong>
            </div>
            <div
              className={`funnel-chart__bar funnel-chart__bar--${stage.tone}`}
              style={{ width: `${width}%` }}
            />
            {drop !== null && drop > 0 ? (
              <span className="funnel-chart__drop">−{drop}% from prior step</span>
            ) : (
              <span className="funnel-chart__drop funnel-chart__drop--empty">&nbsp;</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface UsageInsightsProps {
  report: UsageReport;
  days: number;
  onDaysChange: (days: number) => void;
}

export function UsageInsights({ report, days, onDaysChange }: UsageInsightsProps) {
  const { summary, peakHours, dailyUsage, funnel } = report;
  const peakSlice = peakHours.filter((row) => row.families > 0);
  const peakDisplay = peakSlice.length > 0 ? peakSlice : peakHours;
  const busiestHour = peakHours.reduce(
    (best, row) => (row.families > best.families ? row : best),
    peakHours[0] ?? { hour: 0, label: '—', families: 0 }
  );

  return (
    <>
      <div className="insights-toolbar">
        <p className="muted insights-toolbar__copy">
          Usage insights from MySQL history — last {report.days} days (live queue excluded from funnel
          totals when still in progress).
        </p>
        <label className="insights-toolbar__select">
          Range
          <select
            value={days}
            onChange={(event) => onDaysChange(Number(event.target.value))}
            aria-label="Report date range"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </label>
      </div>

      <div className="metric-grid metric-grid--insights">
        <article className="metric-card metric-card--gold">
          <p className="metric-card__label">Today — Families / Children</p>
          <span className="metric-card__value">
            {summary.todayFamilies} / {summary.todayChildren}
          </span>
          <span className="metric-card__detail">Check-ins since midnight</span>
        </article>
        <article className="metric-card">
          <p className="metric-card__label">Period Volume</p>
          <span className="metric-card__value">
            {summary.totalFamilies} / {summary.totalChildren}
          </span>
          <span className="metric-card__detail">Families / children in range</span>
        </article>
        <article className="metric-card metric-card--blue">
          <p className="metric-card__label">Median Join → Room</p>
          <span className="metric-card__value">
            {summary.medianJoinToRoomMinutes !== null
              ? `${summary.medianJoinToRoomMinutes}m`
              : '—'}
          </span>
          <span className="metric-card__detail">
            Observed from {summary.joinToRoomSampleSize} roomed visits
          </span>
        </article>
        <article className="metric-card metric-card--green">
          <p className="metric-card__label">No-Show Rate</p>
          <span className="metric-card__value">{summary.noShowRate}%</span>
          <span className="metric-card__detail">
            {summary.noShowTotal} total — {summary.noShowStaff} staff,{' '}
            {summary.noShowParentCancel} parent cancel
          </span>
        </article>
      </div>

      <div className="insights-grid">
        <section className="panel">
          <div className="panel__head">
            <h2>Peak Check-In Hours</h2>
            <span className="count-badge">{busiestHour.label}</span>
          </div>
          <p className="muted insights-caption">
            Busiest hour: {busiestHour.label} ({busiestHour.families} families)
          </p>
          <BarChart
            rows={peakDisplay.map((row) => ({
              label: row.label.replace(' ', '\u00a0'),
              families: row.families,
            }))}
            labelKey="label"
            valueKey="families"
            ariaLabel="Peak family check-in hours bar chart"
          />
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2>Queue Funnel</h2>
            <span className="count-badge">{funnel.joined} joined</span>
          </div>
          <p className="muted insights-caption">
            Joined → reached clinic (arrived or roomed) → in room → completed
          </p>
          <FunnelChart funnel={funnel} />
        </section>
      </div>

      <section className="panel">
        <div className="panel__head">
          <h2>Daily Queue Usage</h2>
          <div className="insights-legend">
            <span className="insights-legend__item insights-legend__item--families">Families</span>
            <span className="insights-legend__item insights-legend__item--children">Children</span>
          </div>
        </div>
        {dailyUsage.length === 0 ? (
          <p className="muted">No check-ins in this range.</p>
        ) : (
          <DailyUsageChart rows={dailyUsage} />
        )}
      </section>
    </>
  );
}
