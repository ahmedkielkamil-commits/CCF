import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { fetchClinicHours, fetchParentResume, fetchWaitInterval } from '../api/queue';
import { useQueue } from '../hooks/useQueue';
import { getEstimatedWaitIfJoinNow } from '../utils/form';
import {
  BellIcon,
  BrandHeader,
  ChevronIcon,
  CLINIC_ADDRESS_LINE1,
  CLINIC_ADDRESS_LINE2,
  CLINIC_MAPS_URL,
  ClockIcon,
  HelpFooter,
  PeopleIcon,
  PinIcon,
  Screen,
  ShieldIcon,
} from '../components/ui';

const RESUME_TOKEN_STORAGE_KEY = 'ccof_resume_token';
const SESSION_STORAGE_KEY = 'ccof_registration';
const APPEND_TOKEN_STORAGE_KEY = 'ccof_append_token';
const DEFAULT_CLINIC_HOURS = import.meta.env.VITE_CLINIC_HOURS || '8:00 AM - 5:00 PM';

function WaitValue({ text }: { text: string }) {
  const rangeMatch = text.match(/^(\d+)\s*min\s*-\s*(\d+)\s*min$/i);
  if (rangeMatch) {
    return (
      <>
        {rangeMatch[1]}–{rangeMatch[2]}
        <small>min</small>
      </>
    );
  }
  const compactMatch = text.match(/^(\d+)\s*-\s*(\d+)\s*min$/i);
  if (compactMatch) {
    return (
      <>
        {compactMatch[1]}–{compactMatch[2]}
        <small>min</small>
      </>
    );
  }
  if (text === "You're next") return <>You're next</>;
  return <>{text}</>;
}

export function LandingPage() {
  const navigate = useNavigate();
  const { queue, error } = useQueue();
  const [intervalMinutes, setIntervalMinutes] = useState(15);
  const [clinicHours, setClinicHours] = useState(DEFAULT_CLINIC_HOURS);
  const [resumeCode, setResumeCode] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    fetchWaitInterval()
      .then((interval) => setIntervalMinutes(interval.minutes))
      .catch(() => undefined);
    fetchClinicHours()
      .then((hours) => setClinicHours(hours.hours))
      .catch(() => undefined);
  }, []);

  const familiesAhead = useMemo(() => {
    const ids = new Set((queue?.entries ?? []).map((entry) => entry.registrationid));
    return ids.size;
  }, [queue]);
  const waitText = useMemo(() => {
    return getEstimatedWaitIfJoinNow(familiesAhead, intervalMinutes);
  }, [familiesAhead, intervalMinutes]);

  async function handleJoin() {
    if (joining) return;
    setJoining(true);
    try {
      const token = localStorage.getItem(RESUME_TOKEN_STORAGE_KEY);
      if (token) {
        try {
          const data = await fetchParentResume(token);
          const active = data.entries.some(
            (entry) => entry.status === 'waiting' || entry.status === 'arrived'
          );
          if (active) {
            // Same parent on the same device: append to the existing check-in
            // and skip re-entering parent details.
            sessionStorage.setItem(APPEND_TOKEN_STORAGE_KEY, data.resumeToken || token);
            navigate('/join');
            return;
          }
        } catch {
          // Token expired or invalid — fall through to a fresh check-in.
        }
        // Registration is no longer active: end the stale session.
        localStorage.removeItem(RESUME_TOKEN_STORAGE_KEY);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
      sessionStorage.removeItem(APPEND_TOKEN_STORAGE_KEY);
      navigate('/join');
    } finally {
      setJoining(false);
    }
  }

  function goToStatusWithStoredCode() {
    const token = resumeCode.trim();
    if (!token) {
      navigate('/status');
      return;
    }
    localStorage.setItem(RESUME_TOKEN_STORAGE_KEY, token);
    navigate('/status');
  }

  return (
    <Screen>
      <BrandHeader />

      <section className="hero">
        <p className="hero__label">Estimated Wait</p>
        <div className="hero__value">
          <WaitValue text={waitText} />
        </div>
        <p className="hero__sub">if you join now</p>
        <span className="hero__meta">
          <ClockIcon size={15} /> Updated just now
        </span>
        <button
          type="button"
          className="btn btn--gold hero__cta"
          onClick={handleJoin}
          disabled={joining}
        >
          {joining ? 'Checking…' : 'Join the Walk-In List'}
        </button>
      </section>

      <section className="card card--center">
        <h2 className="card__title">Already in the queue?</h2>
        <input
          type="text"
          className="input"
          placeholder="Enter your access code"
          value={resumeCode}
          onChange={(event) => setResumeCode(event.target.value)}
        />
        <button type="button" className="btn btn--outline" onClick={goToStatusWithStoredCode}>
          View My Status
        </button>
      </section>

      <div className="grid-2">
        <div className="tile">
          <div className="tile__head">
            <span className="chip chip--green">
              <ClockIcon />
            </span>
            <span className="tile__title tile__title--green">Open Now</span>
          </div>
          <strong className="tile__hours">{clinicHours}</strong>
          <p className="tile__body">Walk-in sick visits only</p>
        </div>

        <div className="tile">
          <div className="tile__head">
            <span className="chip chip--peach">
              <PeopleIcon />
            </span>
            <span className="tile__title tile__title--maroon">Families Ahead</span>
          </div>
          <span className="tile__value">{familiesAhead}</span>
          <p className="tile__body">in the queue</p>
        </div>
      </div>

      <div className="banner">
        <span className="banner__icon">
          <BellIcon />
        </span>
        <div className="banner__text">
          <p className="banner__title">We'll let you know when it's your turn.</p>
          <p className="banner__sub">
            Turn on notifications so you never miss an important update.
          </p>
        </div>
        <span className="banner__chevron">
          <ChevronIcon />
        </span>
      </div>

      <div className="grid-2">
        <div className="tile tile--static">
          <div className="tile__head">
            <span className="chip chip--maroon">
              <ShieldIcon />
            </span>
            <span className="tile__title tile__title--maroon">Insurance Accepted</span>
          </div>
          <p className="tile__body">We accept most major insurance plans. Self-pay available.</p>
          <span className="tile__chevron">
            <ChevronIcon size={16} />
          </span>
        </div>

        <a
          className="tile tile--link"
          href={CLINIC_MAPS_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Get directions in Google Maps"
        >
          <div className="tile__head">
            <span className="chip chip--maroon">
              <PinIcon />
            </span>
            <span className="tile__title tile__title--maroon">Location</span>
          </div>
          <p className="tile__body">
            {CLINIC_ADDRESS_LINE1}
            <br />
            {CLINIC_ADDRESS_LINE2}
          </p>
          <span className="tile__link">Get Directions</span>
          <span className="tile__chevron">
            <ChevronIcon size={16} />
          </span>
        </a>
      </div>

      {error && <p className="muted">Live updates paused — reconnecting…</p>}

      <button type="button" className="btn btn--outline" onClick={() => navigate('/status')}>
        Cancel Check-in
      </button>

      <HelpFooter />
    </Screen>
  );
}
