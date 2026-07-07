import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import logo from '../assets/logo.png';

export const CLINIC_NAME = "The Children's Clinic of Fredericksburg";
export const CLINIC_ADDRESS = '4532 Plank Road, Fredericksburg, VA 22407';
export const CLINIC_PHONE = '(540) 252-1840';

const NAV_ITEMS = [
  { to: '/', label: 'Queue Management', end: true },
  { to: '/monitor', label: 'Monitor Board' },
  { to: '/add', label: 'Add Walk-In' },
  { to: '/database-status', label: 'Database Status' },
  { to: '/reports', label: 'Reports' },
] as const;

function NavIcon({ name }: { name: string }) {
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

  if (name === 'dashboard') {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    );
  }
  if (name === 'queue') {
    return (
      <svg {...common}>
        <path d="M8 6h13" />
        <path d="M8 12h13" />
        <path d="M8 18h13" />
        <path d="M3 6h.01" />
        <path d="M3 12h.01" />
        <path d="M3 18h.01" />
      </svg>
    );
  }
  if (name === 'monitor') {
    return (
      <svg {...common}>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8" />
        <path d="M12 17v4" />
      </svg>
    );
  }
  if (name === 'add') {
    return (
      <svg {...common}>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    );
  }
  if (name === 'reports') {
    return (
      <svg {...common}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M16 13H8" />
        <path d="M16 17H8" />
        <path d="M10 9H8" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
    </svg>
  );
}

const NAV_ICONS: Record<string, string> = {
  '/': 'queue',
  '/monitor': 'monitor',
  '/add': 'add',
  '/database-status': 'database',
  '/reports': 'reports',
};

export function StaffSidebar() {
  return (
    <aside className="staff-sidebar">
      <div className="staff-sidebar__brand">
        <img src={logo} alt={CLINIC_NAME} className="staff-sidebar__logo" />
      </div>

      <nav className="staff-sidebar__nav" aria-label="Staff navigation">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={'end' in item ? item.end : false}
            className={({ isActive }) => `staff-nav-link${isActive ? ' staff-nav-link--active' : ''}`}
          >
            <NavIcon name={NAV_ICONS[item.to] ?? 'dashboard'} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="staff-sidebar__footer">
        <strong>{CLINIC_NAME}</strong>
        <p>{CLINIC_ADDRESS}</p>
        <p>{CLINIC_PHONE}</p>
        <small>Walk-in sick visits only</small>
      </div>
    </aside>
  );
}

export function StaffPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="staff-page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="staff-page-header__sub">{subtitle}</p>}
      </div>
      {actions && <div className="staff-page-header__actions">{actions}</div>}
    </header>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = 'maroon',
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: 'maroon' | 'gold' | 'green' | 'blue';
}) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <p className="metric-card__label">{label}</p>
      <strong className="metric-card__value">{value}</strong>
      {detail && <span className="metric-card__detail">{detail}</span>}
    </article>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.replace('_', ' ');
  return <span className={`status-badge status-badge--${status}`}>{normalized}</span>;
}
