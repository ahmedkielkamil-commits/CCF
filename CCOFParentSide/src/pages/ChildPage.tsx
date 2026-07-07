import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { addChildrenToRegistration, postCheckIn } from '../api/queue';
import { useCheckInDraft } from '../context/CheckInContext';
import type { CheckInChild } from '../types/queue';
import { normalizeUsPhone } from '../utils/form';
import { BackIcon, BrandHeader, HelpFooter, Screen } from '../components/ui';

interface StoredRegistration {
  response: Awaited<ReturnType<typeof postCheckIn>>;
  children: CheckInChild[];
}

const RESUME_TOKEN_STORAGE_KEY = 'ccof_resume_token';
const SESSION_STORAGE_KEY = 'ccof_registration';
const APPEND_TOKEN_STORAGE_KEY = 'ccof_append_token';

function progressClass(segment: number, active: number) {
  return segment <= active ? 'progress-segment active' : 'progress-segment';
}

export function ChildPage() {
  const { index } = useParams<{ index: string }>();
  const navigate = useNavigate();
  const { draft, updateChild, resetDraft } = useCheckInDraft();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const childIndex = Math.max(0, Number(index ?? 1) - 1);
  const activeChild = draft.children[childIndex] ?? { fname: '', lname: '', symptoms: '' };
  const isLastChild = childIndex >= draft.numberOfChildren - 1;

  const progressActive = useMemo(() => Math.min(3, childIndex + 1), [childIndex]);

  function setActiveChild(next: CheckInChild) {
    updateChild(childIndex, next);
  }

  async function submitAllChildren() {
    const isAppend = draft.mode === 'append';

    if (!isAppend && (!draft.parentFirstName.trim() || !draft.parentLastName.trim())) {
      setSubmitError('Parent first and last name are required');
      return;
    }
    if (isAppend && !draft.appendToken) {
      setSubmitError('Your previous check-in could not be found. Please start a new check-in.');
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError(null);

      if (isAppend) {
        const response = await addChildrenToRegistration(draft.appendToken as string, draft.children);
        if (response.resumeToken) {
          localStorage.setItem(RESUME_TOKEN_STORAGE_KEY, response.resumeToken);
        }
        // Drop the local snapshot so the status page reloads the full registration
        // (existing + newly added children) from the server.
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        sessionStorage.removeItem(APPEND_TOKEN_STORAGE_KEY);
        resetDraft();
        navigate('/status');
        return;
      }

      const response = await postCheckIn({
        parent_fname: draft.parentFirstName.trim(),
        parent_lname: draft.parentLastName.trim(),
        phone: normalizeUsPhone(draft.phone),
        additional_notes: draft.additionalNotes.trim() || null,
        sms_opt_in: draft.smsOptIn,
        children: draft.children,
      });

      const storedPayload: StoredRegistration = {
        response,
        children: draft.children,
      };
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedPayload));
      if (response.resumeToken) {
        localStorage.setItem(RESUME_TOKEN_STORAGE_KEY, response.resumeToken);
      } else {
        localStorage.removeItem(RESUME_TOKEN_STORAGE_KEY);
      }
      navigate('/status');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // The registration is no longer active — abandon the append and start fresh.
        sessionStorage.removeItem(APPEND_TOKEN_STORAGE_KEY);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        localStorage.removeItem(RESUME_TOKEN_STORAGE_KEY);
        resetDraft();
        setSubmitError('Your check-in is no longer active. Please start a new check-in.');
        navigate('/join');
        return;
      }
      if (error instanceof ApiError && error.details?.length) {
        setSubmitError(error.details.join(' | '));
      } else {
        setSubmitError(error instanceof Error ? error.message : 'Unable to submit check-in');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function onNext() {
    if (!activeChild.fname.trim() || !activeChild.lname.trim() || !activeChild.symptoms.trim()) {
      setSubmitError('Please complete all fields for this child.');
      return;
    }

    if (isLastChild) {
      submitAllChildren().catch(() => undefined);
      return;
    }

    setSubmitError(null);
    navigate(`/join/child/${childIndex + 2}`);
  }

  return (
    <Screen form>
      <BrandHeader />

      <div className="form-head">
        <button type="button" className="back-btn" onClick={() => navigate('/join')} aria-label="Back">
          <BackIcon />
        </button>
        <h1 className="form-title">
          Child {childIndex + 1} of {draft.numberOfChildren}
        </h1>
      </div>

      <div className="progress-row" role="progressbar" aria-valuenow={progressActive} aria-valuemax={3}>
        <span className={progressClass(1, progressActive)} />
        <span className={progressClass(2, progressActive)} />
        <span className={progressClass(3, progressActive)} />
      </div>

      <section className="card">
        <label className="field-label" htmlFor="childFirstName">
          Child's First Name
        </label>
        <input
          id="childFirstName"
          className="input"
          value={activeChild.fname}
          onChange={(event) => setActiveChild({ ...activeChild, fname: event.target.value })}
        />

        <label className="field-label" htmlFor="childLastName">
          Child's Last Name
        </label>
        <input
          id="childLastName"
          className="input"
          value={activeChild.lname}
          onChange={(event) => setActiveChild({ ...activeChild, lname: event.target.value })}
        />

        <label className="field-label" htmlFor="reasonForVisit">
          Reason for Visit
        </label>
        <textarea
          id="reasonForVisit"
          className="textarea"
          rows={4}
          value={activeChild.symptoms}
          onChange={(event) => setActiveChild({ ...activeChild, symptoms: event.target.value })}
        />

        {submitError && <p className="error-text">{submitError}</p>}
      </section>

      <button type="button" className="btn btn--gold sticky" disabled={submitting} onClick={onNext}>
        {submitting ? 'Submitting…' : isLastChild ? 'Submit Check-In' : 'Next Child'}
      </button>

      <HelpFooter />
    </Screen>
  );
}
