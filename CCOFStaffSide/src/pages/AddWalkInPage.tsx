import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { postCheckIn } from '../api/queue';
import { StaffPageHeader } from '../components/staff-ui';
import type { CheckInChild } from '../types/queue';
import { normalizeUsPhone } from '../utils/format';

function emptyChild(): CheckInChild {
  return { fname: '', lname: '', symptoms: '' };
}

export function AddWalkInPage() {
  const navigate = useNavigate();
  const [parentFirst, setParentFirst] = useState('');
  const [parentLast, setParentLast] = useState('');
  const [phone, setPhone] = useState('');
  const [children, setChildren] = useState<CheckInChild[]>([emptyChild()]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateChild(index: number, next: CheckInChild) {
    setChildren((prev) => prev.map((child, childIndex) => (childIndex === index ? next : child)));
  }

  function addChild() {
    setChildren((prev) => [...prev, emptyChild()]);
  }

  function removeChild(index: number) {
    setChildren((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, childIndex) => childIndex !== index);
    });
  }

  async function submit() {
    if (!parentFirst.trim() || !phone.trim()) {
      setError('Parent first name and phone are required.');
      return;
    }

    if (children.some((child) => !child.fname.trim() || !child.lname.trim() || !child.symptoms.trim())) {
      setError('Each child requires first name, last name, and symptoms.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await postCheckIn({
        parent_fname: parentFirst.trim(),
        parent_lname: parentLast.trim(),
        phone: normalizeUsPhone(phone),
        additional_notes: null,
        sms_opt_in: true,
        children,
      });
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create walk-in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <StaffPageHeader title="Add Walk-In" subtitle="Register a new family directly from the front desk." />

      <section className="panel form-panel">
        <label className="field-label" htmlFor="parentFirst">
          Parent First Name
        </label>
        <input id="parentFirst" className="text-input" value={parentFirst} onChange={(event) => setParentFirst(event.target.value)} />

        <label className="field-label" htmlFor="parentLast">
          Parent Last Name
        </label>
        <input id="parentLast" className="text-input" value={parentLast} onChange={(event) => setParentLast(event.target.value)} />

        <label className="field-label" htmlFor="phone">
          Phone
        </label>
        <input id="phone" className="text-input" value={phone} onChange={(event) => setPhone(event.target.value)} />

        <div className="children-block">
          <h2>Children</h2>
          {children.map((child, index) => (
            <article key={index} className="child-card">
              <div className="child-card__head">
                <h3>Child {index + 1}</h3>
                {children.length > 1 && (
                  <button type="button" className="child-card__remove" onClick={() => removeChild(index)}>
                    Remove
                  </button>
                )}
              </div>
              <input
                className="text-input"
                placeholder="First name"
                value={child.fname}
                onChange={(event) => updateChild(index, { ...child, fname: event.target.value })}
              />
              <input
                className="text-input"
                placeholder="Last name"
                value={child.lname}
                onChange={(event) => updateChild(index, { ...child, lname: event.target.value })}
              />
              <textarea
                className="text-area"
                rows={3}
                placeholder="Symptoms"
                value={child.symptoms}
                onChange={(event) => updateChild(index, { ...child, symptoms: event.target.value })}
              />
            </article>
          ))}
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn--outline btn--compact" onClick={addChild}>
            + Add Child
          </button>
          <button type="button" className="btn btn--maroon btn--compact" onClick={submit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Create Walk-In'}
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
      </section>
    </>
  );
}
