import { useEffect, useRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiError } from '../api/client';
import { CheckInProvider, useCheckInDraft } from '../context/CheckInContext';
import { ChildPage } from './ChildPage';

const mockPostCheckIn = vi.fn();

vi.mock('../api/queue', () => ({
  postCheckIn: (...args: unknown[]) => mockPostCheckIn(...args),
}));

function DraftPrefill() {
  const { setParentFirstName, setParentLastName, setPhone } = useCheckInDraft();
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setParentFirstName('Jane');
    setParentLastName('Doe');
    setPhone('5551234567');
  }, [setParentFirstName, setParentLastName, setPhone]);
  return null;
}

function renderChildPage() {
  render(
    <MemoryRouter initialEntries={['/join/child/1']}>
      <CheckInProvider>
        <DraftPrefill />
        <Routes>
          <Route path="/join/child/:index" element={<ChildPage />} />
        </Routes>
      </CheckInProvider>
    </MemoryRouter>
  );
}

describe('ChildPage', () => {
  beforeEach(() => {
    mockPostCheckIn.mockReset();
  });

  test('shows validation message when child fields are incomplete', async () => {
    const user = userEvent.setup();
    renderChildPage();

    await user.click(screen.getByRole('button', { name: 'Submit Check-In' }));
    expect(screen.getByText('Please complete all fields for this child.')).toBeInTheDocument();
  });

  test('shows queue full error from backend on submit', async () => {
    const user = userEvent.setup();
    mockPostCheckIn.mockRejectedValueOnce(new ApiError(429, 'Queue at capacity'));
    renderChildPage();

    await user.type(screen.getByLabelText("Child's First Name"), 'Amy');
    await user.type(screen.getByLabelText("Child's Last Name"), 'Doe');
    await user.type(screen.getByLabelText('Reason for Visit'), 'Fever');
    await user.click(screen.getByRole('button', { name: 'Submit Check-In' }));

    await waitFor(() => {
      expect(screen.getByText('Queue at capacity')).toBeInTheDocument();
    });
  });
});
