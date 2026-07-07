type HealthTone = 'ok' | 'warn' | 'bad';

function HealthIcon({ name }: { name: 'check' | 'server' | 'database' | 'redis' | 'queue' | 'bell' }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (name === 'check') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="10" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }
  if (name === 'server') {
    return (
      <svg {...common}>
        <rect x="2" y="3" width="20" height="8" rx="2" />
        <rect x="2" y="13" width="20" height="8" rx="2" />
        <path d="M6 7h.01" />
        <path d="M6 17h.01" />
      </svg>
    );
  }
  if (name === 'database') {
    return (
      <svg {...common}>
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
      </svg>
    );
  }
  if (name === 'redis') {
    return (
      <svg {...common}>
        <path d="m12 2 8 4.5v7L12 18l-8-4.5v-7z" />
        <path d="m12 11 8-4.5" />
        <path d="M12 11v7" />
        <path d="m4 6.5 8 4.5" />
      </svg>
    );
  }
  if (name === 'queue') {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function ServiceCard({
  icon,
  iconTone,
  title,
  status,
  statusTone,
  metric,
}: {
  icon: 'server' | 'database' | 'redis' | 'queue' | 'bell';
  iconTone: 'green' | 'red' | 'amber';
  title: string;
  status: string;
  statusTone: HealthTone;
  metric: string;
}) {
  return (
    <article className={`health-card health-card--${statusTone}`}>
      <div className={`health-card__icon-wrap health-card__icon-wrap--${iconTone}`}>
        <HealthIcon name={icon} />
      </div>
      <div className="health-card__body">
        <p className="health-card__title">{title}</p>
        <p className={`health-card__status health-card__status--${statusTone}`}>{status}</p>
        <p className="health-card__metric">{metric}</p>
      </div>
    </article>
  );
}

export function SystemHealthBar({
  allOperational,
  backendOk,
  responseMs,
  inSync,
  mysqlOk,
  redisOk,
  mysqlCount,
  redisCount,
  activeEntries,
  checkedAt,
}: {
  allOperational: boolean;
  backendOk: boolean | null;
  responseMs: number | null;
  inSync: boolean | null;
  mysqlOk: boolean;
  redisOk: boolean;
  mysqlCount: number;
  redisCount: number;
  activeEntries: number;
  checkedAt: string | null;
}) {
  const overviewTone: HealthTone = allOperational ? 'ok' : backendOk === false ? 'bad' : 'warn';
  const backendTone: HealthTone = backendOk ? 'ok' : backendOk === false ? 'bad' : 'warn';
  const mysqlTone: HealthTone = mysqlOk && inSync !== false ? 'ok' : mysqlOk ? 'warn' : 'bad';
  const redisTone: HealthTone = redisOk && inSync !== false ? 'ok' : redisOk ? 'warn' : 'bad';
  const queueTone: HealthTone = backendOk && mysqlOk ? 'ok' : backendOk === false ? 'bad' : 'warn';
  const notifyTone: HealthTone = backendOk ? 'ok' : backendOk === false ? 'bad' : 'warn';

  const overviewTitle =
    overviewTone === 'ok'
      ? 'All Systems Operational'
      : overviewTone === 'bad'
        ? 'System Outage Detected'
        : 'Attention Required';
  const overviewDetail =
    overviewTone === 'ok'
      ? 'Everything looks good.'
      : overviewTone === 'bad'
        ? 'One or more core services are down.'
        : 'Review service cards below.';

  return (
    <div className="health-grid">
      <article className={`health-card health-card--overview health-card--${overviewTone}`}>
        <div className={`health-card__icon-wrap health-card__icon-wrap--${overviewTone === 'ok' ? 'green' : overviewTone === 'bad' ? 'red' : 'amber'}`}>
          <HealthIcon name="check" />
        </div>
        <div className="health-card__body">
          <p className={`health-card__headline health-card__status--${overviewTone}`}>{overviewTitle}</p>
          <p className="health-card__sub">{overviewDetail}</p>
          <p className={`health-card__uptime health-card__status--${overviewTone}`}>
            {allOperational ? '100% Uptime' : backendOk === false ? 'Offline' : 'Degraded'}
          </p>
        </div>
      </article>

      <ServiceCard
        icon="server"
        iconTone={backendTone === 'ok' ? 'green' : backendTone === 'bad' ? 'red' : 'amber'}
        title="Backend Server"
        status={backendOk ? 'Operational' : backendOk === false ? 'Down' : 'Checking…'}
        statusTone={backendTone}
        metric={responseMs != null ? `Response: ${responseMs}ms` : 'Response: —'}
      />

      <ServiceCard
        icon="database"
        iconTone={mysqlTone === 'ok' ? 'green' : mysqlTone === 'bad' ? 'red' : 'amber'}
        title="MySQL Database"
        status={mysqlOk ? (inSync ? 'In Sync' : 'Out of Sync') : 'Unavailable'}
        statusTone={mysqlTone}
        metric={`Live entries: ${mysqlCount}`}
      />

      <ServiceCard
        icon="redis"
        iconTone="red"
        title="Redis Cache"
        status={redisOk ? (inSync ? 'In Sync' : 'Out of Sync') : 'Unavailable'}
        statusTone={redisTone}
        metric={inSync === false ? 'Cache mismatch detected' : `Live entries: ${redisCount}`}
      />

      <ServiceCard
        icon="queue"
        iconTone={queueTone === 'ok' ? 'green' : queueTone === 'bad' ? 'red' : 'amber'}
        title="Queue Service"
        status={queueTone === 'ok' ? 'Operational' : queueTone === 'bad' ? 'Down' : 'Degraded'}
        statusTone={queueTone}
        metric={`Active Entries: ${activeEntries}`}
      />

      <ServiceCard
        icon="bell"
        iconTone={notifyTone === 'ok' ? 'green' : notifyTone === 'bad' ? 'red' : 'amber'}
        title="Notifications"
        status={notifyTone === 'ok' ? 'Operational' : notifyTone === 'bad' ? 'Down' : 'Checking…'}
        statusTone={notifyTone}
        metric={checkedAt ? `Checked: ${new Date(checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Checked: —'}
      />
    </div>
  );
}
