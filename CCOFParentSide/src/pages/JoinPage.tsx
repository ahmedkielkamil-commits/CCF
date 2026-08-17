import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCheckInDraft } from '../context/CheckInContext';
import { BackIcon, BrandHeader, HelpFooter, Screen } from '../components/ui';

const APPEND_TOKEN_STORAGE_KEY = 'ccof_append_token';

export function JoinPage() {
  const navigate = useNavigate();
  const {
    draft,
    setParentFirstName,
    setParentLastName,
    setPhone,
    setNumberOfChildren,
    setSmsOptIn,
    startAppend,
    resetDraft,
  } = useCheckInDraft();

  useEffect(() => {
    const appendToken = sessionStorage.getItem(APPEND_TOKEN_STORAGE_KEY);
    if (appendToken && draft.mode !== 'append') {
      startAppend(appendToken);
    } else if (!appendToken && draft.mode === 'append') {
      resetDraft();
    }
    // Reconcile append intent once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAppend = draft.mode === 'append';
  const continueDisabled = isAppend
    ? false
    : !draft.parentFirstName.trim() || !draft.parentLastName.trim() || !draft.phone.trim();

  return (
    <Screen form>
      <BrandHeader />

      <div className="form-head">
        <button type="button" className="back-btn" onClick={() => navigate('/')} aria-label="Back">
          <BackIcon />
        </button>
        <h1 className="form-title">{isAppend ? 'Add Another Child' : 'Join the Walk-In List'}</h1>
      </div>

      {isAppend && (
        <p className="helper-text">
          We'll add the new child to your existing check-in — no need to re-enter your details.
        </p>
      )}

      <section className="card">
        {!isAppend && (
          <>
            <label className="field-label" htmlFor="parentFirstName">
              Parent/Guardian First Name
            </label>
            <input
              id="parentFirstName"
              className="input"
              value={draft.parentFirstName}
              onChange={(event) => setParentFirstName(event.target.value)}
            />

            <label className="field-label" htmlFor="parentLastName">
              Parent/Guardian Last Name
            </label>
            <input
              id="parentLastName"
              className="input"
              value={draft.parentLastName}
              onChange={(event) => setParentLastName(event.target.value)}
            />

            <label className="field-label" htmlFor="phoneNumber">
              Phone Number
            </label>
            <p className="helper-text">Used to send wait updates via text</p>
            <input
              id="phoneNumber"
              className="input"
              value={draft.phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </>
        )}

        <div className="children-stepper">
          <span className="field-label" style={{ margin: 0 }}>
            Number of Children
          </span>
          <div className="stepper-controls">
            <button
              type="button"
              className="stepper-btn"
              aria-label="Fewer children"
              onClick={() => setNumberOfChildren(Math.max(1, draft.numberOfChildren - 1))}
            >
              −
            </button>
            <span className="stepper-count">{draft.numberOfChildren}</span>
            <button
              type="button"
              className="stepper-btn"
              aria-label="More children"
              onClick={() => setNumberOfChildren(Math.min(10, draft.numberOfChildren + 1))}
            >
              +
            </button>
          </div>
        </div>

        {!isAppend && (
          <>
            <label className="sms-toggle">
              <input
                type="checkbox"
                checked={draft.smsOptIn}
                onChange={(event) => setSmsOptIn(event.target.checked)}
              />
              <span>
                <strong>Send me a text when it's almost my turn</strong>
                <small>You can opt out at any time by replying STOP</small>
              </span>
            </label>
          </>
        )}
      </section>

      <button
        type="button"
        className="btn btn--gold sticky"
        onClick={() => navigate('/join/child/1')}
        disabled={continueDisabled}
      >
        Continue
      </button>

      <HelpFooter />
    </Screen>
  );
}
