import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { cancelParentCheckIn, fetchParentResume } from '../api/queue';
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
  return {
    registrationid: stored.response.registrationid,
    resumeToken: stored.response.resumeToken,
    resumeCode: stored.response.resumeCode || '',
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

const ROADMAP_STEPS = ['Joined Queue', 'Arrived', 'In Room', 'Complete'] as const;

function roadmapStepState(status: QueueStatus) {
  if (status === 'no_show') {
    return ['done', 'upcoming', 'upcoming', 'upcoming'] as const;
  }
  if (status === 'completed') {
    return ROADMAP_STEPS.map(() => 'done' as const);
  }
  if (status === 'roomed') {
    return ['done', 'done', 'done', 'current'] as const;
  }
  if (status === 'arrived') {
    return ['done', 'done', 'current', 'upcoming'] as const;
  }
  return ['done', 'current', 'upcoming', 'upcoming'] as const;
}

function isLiveQueueStatus(status: QueueStatus) {
  return status === 'waiting' || status === 'arrived';
}

function statusHeadline(status: QueueStatus) {
  if (status === 'no_show') return 'No show';
  if (status === 'roomed') return 'In room';
  if (status === 'completed') return 'Visit complete';
  return status.replace('_', ' ');
}

function formatWaitDisplay(estimatedWait: string) {
  const rangeMatch = estimatedWait.match(/(\d+)\s*min?\s*[-–]\s*(\d+)/i);
  if (rangeMatch) {
    const low = Math.min(Number(rangeMatch[1]), Number(rangeMatch[2]));
    const high = Math.max(Number(rangeMatch[1]), Number(rangeMatch[2]));
    return `${low}–${high} min`;
  }
  if (estimatedWait === "You're next") return estimatedWait;
  return estimatedWait;
}

function ChildRoadmapCard({
  entry,
}: {
  entry: RegistrationEntryView;
}) {
  const stepStates = roadmapStepState(entry.status);
  const showQueueMeta = isLiveQueueStatus(entry.status);
  const showRoadmap = entry.status !== 'completed';

  return (
    <article className="status-roadmap-card">
      <div className="status-roadmap-card__head">
        <div>
          <p className="status-roadmap-card__label">Child&apos;s Name</p>
          <h2 className="status-roadmap-card__name">{entry.name || `Child #${entry.entryid}`}</h2>
          <p className="status-roadmap-card__symptoms">{entry.symptoms || 'Reason not provided'}</p>
          <p className="status-roadmap-card__meta">Monitor ticket: #{entry.entryid}</p>
        </div>
        <div className="status-roadmap-card__queue">
          {showQueueMeta ? (
            <>
              <p className="status-roadmap-card__label">Position</p>
              <p className="status-roadmap-card__position">#{entry.position}</p>
              <p className="status-roadmap-card__wait">{formatWaitDisplay(entry.estimatedWait)}</p>
            </>
          ) : (
            <>
              <p className="status-roadmap-card__label">Status</p>
              <p className="status-roadmap-card__position">{statusHeadline(entry.status)}</p>
              {entry.status === 'roomed' && (
                <p className="status-roadmap-card__wait">Visit in progress</p>
              )}
            </>
          )}
        </div>
      </div>

      {showRoadmap ? (
        <div className="roadmap" aria-label={`Progress for ${entry.name || 'child'}`}>
          {ROADMAP_STEPS.map((label, index) => {
            const state = stepStates[index];
            const connectorDone = index > 0 && stepStates[index - 1] === 'done';
            return (
              <div key={label} className="roadmap__step">
                {index > 0 && <span className={`roadmap__connector${connectorDone ? ' roadmap__connector--done' : ''}`} aria-hidden />}
                <span className={`roadmap__dot roadmap__dot--${state}`}>
                  {state === 'done' ? <CheckIcon size={14} /> : null}
                </span>
                <span className={`roadmap__label${state === 'current' || state === 'done' ? ' roadmap__label--active' : ''}`}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="status-roadmap-card__complete">Thank you for visiting today.</p>
      )}
    </article>
  );
}

export function StatusPage() {
  const navigate = useNavigate();
  const { resetDraft } = useCheckInDraft();
  const { queue, setQueue } = useQueue();
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [resumeView, setResumeView] = useState<ResumeView | null>(null);
  const [loadingResume, setLoadingResume] = useState(true);
  const [resumeCodeInput, setResumeCodeInput] = useState('');

  const applyResumeResponse = useCallback((data: ParentResumeResponse) => {
    setResumeView(fromResumeResponse(data));
    if (data.resumeToken) {
      localStorage.setItem(RESUME_TOKEN_STORAGE_KEY, data.resumeToken);
    }
  }, []);

  const refreshResume = useCallback(async (credential: string) => {
    const data = await fetchParentResume(credential);
    applyResumeResponse(data);
    return data;
  }, [applyResumeResponse]);

  const clearStoredRegistration = useCallback(() => {
    localStorage.removeItem(RESUME_TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setResumeView(null);
  }, []);

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
        if (!cancelled) applyResumeResponse(data);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          if (!cancelled) clearStoredRegistration();
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
  }, [applyResumeResponse, clearStoredRegistration]);

  useEffect(() => {
    if (!resumeView) return undefined;

    const credential = resumeView.resumeToken || resumeView.resumeCode || localStorage.getItem(RESUME_TOKEN_STORAGE_KEY);
    if (!credential) return undefined;

    const timer = setInterval(() => {
      refreshResume(credential).catch(() => undefined);
    }, 8000);

    return () => clearInterval(timer);
  }, [resumeView?.registrationid, resumeView?.resumeToken, resumeView?.resumeCode, refreshResume]);

  useEffect(() => {
    if (!resumeView || !queue?.updatedAt) return undefined;

    const credential = resumeView.resumeToken || resumeView.resumeCode || localStorage.getItem(RESUME_TOKEN_STORAGE_KEY);
    if (!credential) return undefined;

    refreshResume(credential).catch(() => undefined);
  }, [queue?.updatedAt, resumeView, refreshResume]);

  const statusByEntry = useMemo(() => {
    const map = new Map<number, QueueEntry>();
    const registrationId = resumeView?.registrationid;
    if (!registrationId) return map;

    for (const entry of queue?.entries ?? []) {
      if (Number(entry.registrationid) === Number(registrationId)) {
        map.set(entry.entryid, entry);
      }
    }
    for (const entry of queue?.inRoom ?? []) {
      if (Number(entry.registrationid) === Number(registrationId)) {
        map.set(entry.entryid, entry);
      }
    }
    return map;
  }, [queue, resumeView?.registrationid]);

  const registrationEntries = useMemo(() => {
    if (!resumeView) return [];
    return resumeView.entries.map((entry) => {
      const live = statusByEntry.get(entry.entryid);
      const status = live?.status ?? entry.status;
      return {
        entryid: entry.entryid,
        name: entry.name,
        symptoms: entry.symptoms,
        position: isLiveQueueStatus(status) ? (live?.position ?? entry.position) : entry.position,
        status,
        estimatedWait: isLiveQueueStatus(status) ? (live?.estimatedWait ?? entry.estimatedWait ?? '—') : '—',
      };
    });
  }, [resumeView, statusByEntry]);

  async function handleResumeByCode() {
    if (!resumeCodeInput.trim()) return;
    setActionMessage(null);
    try {
      await refreshResume(resumeCodeInput.trim());
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
            placeholder="e.g. 4829JD"
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

  return (
    <Screen>
      <BrandHeader />

      <div className="confirm-head">
        <div className="checkmark">
          <CheckIcon />
        </div>
        <h1 className="confirm-title">All children added to the list.</h1>
      </div>

      <section className="status-roadmap-list">
        {registrationEntries.map((entry) => (
          <ChildRoadmapCard key={entry.entryid} entry={entry} />
        ))}
      </section>

      <p className="access-code">
        Queue access code: <code>{resumeView.resumeCode}</code>
      </p>

      <div className="info-banner">
        We&apos;ll text you when it&apos;s almost your turn. Staff will mark you as arrived when you reach the front desk.
      </div>

      {actionMessage && <p className="action-msg">{actionMessage}</p>}

      <div className="stack">
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
