import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { CheckInChild } from '../types/queue';

interface ParentDraft {
  parentFirstName: string;
  parentLastName: string;
  phone: string;
  numberOfChildren: number;
  smsOptIn: boolean;
  additionalNotes: string;
  children: CheckInChild[];
  mode: 'new' | 'append';
  appendToken: string | null;
}

interface CheckInContextValue {
  draft: ParentDraft;
  setParentFirstName: (value: string) => void;
  setParentLastName: (value: string) => void;
  setPhone: (value: string) => void;
  setNumberOfChildren: (value: number) => void;
  setSmsOptIn: (value: boolean) => void;
  setAdditionalNotes: (value: string) => void;
  updateChild: (index: number, value: CheckInChild) => void;
  startAppend: (appendToken: string) => void;
  resetDraft: () => void;
}

const defaultChild = (): CheckInChild => ({ fname: '', lname: '', symptoms: '' });

const defaultDraft: ParentDraft = {
  parentFirstName: '',
  parentLastName: '',
  phone: '',
  numberOfChildren: 1,
  smsOptIn: true,
  additionalNotes: '',
  children: [defaultChild()],
  mode: 'new',
  appendToken: null,
};

const CheckInContext = createContext<CheckInContextValue | undefined>(undefined);

function withChildCount(children: CheckInChild[], count: number) {
  if (children.length === count) return children;
  if (children.length > count) return children.slice(0, count);
  const expanded = [...children];
  while (expanded.length < count) {
    expanded.push(defaultChild());
  }
  return expanded;
}

export function CheckInProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<ParentDraft>(defaultDraft);

  const value = useMemo<CheckInContextValue>(
    () => ({
      draft,
      setParentFirstName: (parentFirstName) => setDraft((prev) => ({ ...prev, parentFirstName })),
      setParentLastName: (parentLastName) => setDraft((prev) => ({ ...prev, parentLastName })),
      setPhone: (phone) => setDraft((prev) => ({ ...prev, phone })),
      setNumberOfChildren: (numberOfChildren) =>
        setDraft((prev) => ({
          ...prev,
          numberOfChildren,
          children: withChildCount(prev.children, numberOfChildren),
        })),
      setSmsOptIn: (smsOptIn) => setDraft((prev) => ({ ...prev, smsOptIn })),
      setAdditionalNotes: (additionalNotes) => setDraft((prev) => ({ ...prev, additionalNotes })),
      updateChild: (index, value) =>
        setDraft((prev) => ({
          ...prev,
          children: prev.children.map((child, childIndex) => (childIndex === index ? value : child)),
        })),
      startAppend: (appendToken) =>
        setDraft({
          ...defaultDraft,
          mode: 'append',
          appendToken,
          children: [defaultChild()],
        }),
      resetDraft: () => setDraft(defaultDraft),
    }),
    [draft]
  );

  return <CheckInContext.Provider value={value}>{children}</CheckInContext.Provider>;
}

export function useCheckInDraft() {
  const context = useContext(CheckInContext);
  if (!context) {
    throw new Error('useCheckInDraft must be used within CheckInProvider');
  }
  return context;
}
