import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { cancelParentCheckIn, fetchParentResume, patchQueueStatus } from '../api/queue';
import { useCheckInDraft } from '../context/CheckInContext';
import { useQueue } from '../hooks/useQueue';
import type { CheckInChild, CheckInResponse, ParentResumeResponse, QueueEntry, QueueStatus } from '../types/queue';
import { BrandHeader, CheckIcon, HelpFooter, Screen } from '../components/ui';

interface StoredRegistration {
  response: CheckInResponse;
  children: CheckInChild[];
}

interface RegistrationEntryView {
  entryid: number;
  name: string;
  symptoms: string;
  position: number;
  status: QueueStatus;
  estimatedWait: string;
}

interface ResumeView {
  registrationid: number;
  resumeToken: string | null;
  resumeCode: string;
  entries: RegistrationEntryView[];
}

const SESSION_STORAGE_KEY = 'ccof_registration';
const RESUME_TOKEN_STORAGE_KEY = 'ccof_resume_token';

function fromSession(stored: StoredRegistration): ResumeView {
  const fallbackCode = stored.response.resumeToken ? stored.response.resumeToken.slice(0, 6) : '';
  return {
    registrationid: stored.response.registrationid,
    resumeToken: stored.response.resumeToken,
    resumeCode: stored.response.resumeCode || fallbackCode,
    entries: stored.response.entries.map((entry, index) => ({
      entryid: entry.entryid,
      name: `${stored.children[index]?.fname ?? ''} ${stored.children[index]?.lname ?? ''}`.trim(),
      symptoms: stored.children[index]?.symptoms ?? '',
      position: entry.position,
      status: entry.status,
      estimatedWait: '—',
    })),
  };
}

function fromResumeResponse(data: ParentResumeResponse): ResumeView {
  return {
    registrationid: data.registrationid,
    resumeToken: data.resumeToken,
    resumeCode: data.resumeCode,
    entries: data.entries.map((entry) => ({
      entryid: entry.entryid,
      name: `${entry.fname} ${entry.lname}`.trim(),
      symptoms: entry.symptoms,
      position: entry.position,
      status: entry.status,
      estimatedWait: entry.estimatedWait,
    })),
  };
}

function statusStep(status: QueueStatus, position: number) {
  if (status === 'completed') return 4;
  if (status === 'roomed') return 3;
  if (status === 'arrived') return 1;
  if (status === 'waiting' && position <= 2) return 2;
  return 0;
}

export function StatusPage() {
  const navigate = useNavigate();
  const { resetDraft } = useCheckInDraft();
  const { queue, setQueue } = useQueue();
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [resumeView, setResumeView] = useState<ResumeView | null>(null);
  const [loadingResume, setLoadingResume] = useState(true);
  const [resumeCodeInput, setResumeCodeInput] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      let credential: string | null = localStorage.getItem(RESUME_TOKEN_STORAGE_KEY);

      if (raw) {
        try {
          const parsed = JSON.parse(raw) as StoredRegistration;
          if (
            parsed?.response?.registrationid &&
            (parsed?.response?.resumeToken || parsed?.response?.resumeCode)
          ) {
            if (!cancelled) setResumeView(fromSession(parsed));
            if (!credential) {
              credential = parsed.response.resumeToken || parsed.response.resumeCode;
            }
            if (parsed.response.resumeToken) {
              localStorage.setItem(RESUME_TOKEN_STORAGE_KEY, parsed.response.resumeToken);
            }
          }
        } catch {
          // ignore parse error and fall back to the server reconcile below
        }
      }

      if (!credential) {
        if (!cancelled) setLoadingResume(false);
        return;
      }

      try {
        const data = await fetchParentResume(credential);
        if (!cancelled) setResumeView(fromResumeResponse(data));
        if (data.resumeToken) {
          localStorage.setItem(RESUME_TOKEN_STORAGE_KEY, data.resumeToken);
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          localStorage.removeItem(RESUME_TOKEN_STORAGE_KEY);
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
          if (!cancelled) setResumeView(null);
        }
      } finally {
        if (!cancelled) setLoadingResume(false);
      }
    }

    load().catch(() => {
      if (!cancelled) setLoadingResume(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const liveByEntry = useMemo(() => {
    const map = new Map<number, QueueEntry>();
    queue?.entries.forEach((entry) => map.set(entry.entryid, entry));
    return map;
  }, [queue]);

  async function handleResumeByCode() {
    if (!resumeCodeInput.trim()) return;
    setActionMessage(null);
    try {
      const data = await fetchParentResume(resumeCodeInput.trim());
      const nextView = fromResumeResponse(data);
      setResumeView(nextView);
      if (nextView.resumeToken) {
        localStorage.setItem(RESUME_TOKEN_STORAGE_KEY, nextView.resumeToken);
      }
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Unable to resume with that code.');
    }
  }

  if (loadingResume) {
    return (
      <Screen>
        <BrandHeader />
        <div className="loading-center">
          <p>Loading your queue status…</p>
        </div>
        <HelpFooter />
      </Screen>
    );
  }

  if (!resumeView) {
    return (
      <Screen>
        <BrandHeader />

        <section className="card card--center">
          <h2 className="card__title">No active check-in found</h2>
          <p className="helper-text" style={{ textAlign: 'center' }}>
            Enter your access code to view your place in line, or start a new check-in.
          </p>
          <input
            type="text"
            className="input"
            placeholder="Enter your access code"
            value={resumeCodeInput}
            onChange={(event) => setResumeCodeInput(event.target.value)}
          />
          <button type="button" className="btn btn--outline" onClick={handleResumeByCode}>
            View My Status
          </button>
          {actionMessage && <p className="error-text">{actionMessage}</p>}
        </section>

        <button type="button" className="btn btn--gold" onClick={() => navigate('/join')}>
          Start Check-In
        </button>

        <HelpFooter />
      </Screen>
    );
  }

  const registrationEntries = resumeView.entries.map((entry) => {
    const live = liveByEntry.get(entry.entryid);
    return {
      entryid: entry.entryid,
      name: entry.name,
      symptoms: entry.symptoms,
      position: live?.position ?? entry.position,
      status: live?.status ?? entry.status,
      estimatedWait: live?.estimatedWait ?? entry.estimatedWait ?? '—',
    };
  });

  async function markArrived() {
    const waitingEntries = registrationEntries.filter((entry) => entry.status === 'waiting');
    if (!waitingEntries.length) {
      setActionMessage('No waiting children found to mark as arrived.');
      return;
    }

    setActing(true);
    setActionMessage(null);
    try {
      for (const entry of waitingEntries) {
        const result = await patchQueueStatus(entry.entryid, 'arrived', 'Patient');
        if (result.queue) setQueue(result.queue);
      }
      setActionMessage('Arrival sent to staff successfully.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setActionMessage('Not on clinic network yet. Staff can mark this from their dashboard.');
      } else {
        setActionMessage(error instanceof Error ? error.message : 'Unable to update arrival status.');
      }
    } finally {
      setActing(false);
    }
  }

  return (
    <Screen>
      <BrandHeader />

      <div className="confirm-head">
        <div className="checkmark">
          <CheckIcon />
        </div>
        <h1 className="confirm-title">All children added to the list.</h1>
      </div>

      <section className="stack">
        {registrationEntries.map((entry) => (
          <article key={entry.entryid} className="card status-card">
            <p className="card-title">{entry.name || `Child #${entry.entryid}`}</p>
            <p className="card-row">{entry.symptoms || 'Reason not provided'}</p>
            <p className="card-row focus-metric">Place in line: #{entry.position}</p>
            <p className="card-row">Monitor ticket: #{entry.entryid}</p>
            <p className="card-row">Estimated wait: {entry.estimatedWait}</p>
          </article>
        ))}
      </section>

      <p className="access-code">
        Queue access code: <code>{resumeView.resumeCode}</code>
      </p>

      <div className="status-steps">
        {registrationEntries.map((entry) => {
          const active = statusStep(entry.status, entry.position);
          return (
            <div key={entry.entryid} className="entry-steps card">
              <strong>{entry.name || `Entry #${entry.entryid}`}</strong>
              <span className={active >= 0 ? 'step-pill active' : 'step-pill'}>On the List</span>
              <span className={active >= 1 ? 'step-pill active' : 'step-pill'}>Arrived</span>
              <span className={active >= 2 ? 'step-pill active' : 'step-pill'}>Almost Your Turn</span>
              <span className={active >= 3 ? 'step-pill active' : 'step-pill'}>Please Head In</span>
              <span className={active >= 4 ? 'step-pill active' : 'step-pill'}>Checked In</span>
            </div>
          );
        })}
      </div>

      <div className="info-banner">We'll text you when it's almost your turn. You don't need to stay on this page.</div>

      {actionMessage && <p className="action-msg">{actionMessage}</p>}

      <div className="stack">
        <button type="button" className="btn btn--maroon" disabled={acting} onClick={markArrived}>
          {acting ? 'Updating…' : "I've Arrived"}
        </button>
        <p className="muted">Let the front desk know you're in the building.</p>

        <button
          type="button"
          className="btn btn--outline"
          disabled={cancelling}
          onClick={async () => {
            if (!window.confirm('Cancel this check-in for all children?')) return;
            const cancelCredential = resumeView.resumeToken || resumeView.resumeCode;
            if (!cancelCredential) {
              setActionMessage('Unable to cancel without a resume token or access code.');
              return;
            }
            setCancelling(true);
            setActionMessage(null);
            try {
              const result = await cancelParentCheckIn(cancelCredential);
              if (result.queue) setQueue(result.queue);
              localStorage.removeItem(RESUME_TOKEN_STORAGE_KEY);
              sessionStorage.removeItem(SESSION_STORAGE_KEY);
              setResumeView(null);
              setActionMessage('Your check-in has been cancelled.');
            } catch (error) {
              setActionMessage(error instanceof Error ? error.message : 'Unable to cancel this check-in.');
            } finally {
              setCancelling(false);
            }
          }}
        >
          {cancelling ? 'Cancelling…' : 'Cancel Check-In'}
        </button>
      </div>

      <div className="link-row">
        <Link
          to="/"
          onClick={() => {
            resetDraft();
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
          }}
        >
          Back to home
        </Link>
      </div>

      <HelpFooter />
    </Screen>
  );
}
