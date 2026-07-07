import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AddWalkInPage } from './AddWalkInPage';

const mockPostCheckIn = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../api/queue', () => ({
  postCheckIn: (...args: unknown[]) => mockPostCheckIn(...args),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('AddWalkInPage', () => {
  beforeEach(() => {
    mockPostCheckIn.mockReset();
    mockNavigate.mockReset();
  });

  test('removes an accidentally added child before submit', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AddWalkInPage />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: '+ Add Child' }));
    expect(screen.getByText('Child 2')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[1]);
    expect(screen.queryByText('Child 2')).not.toBeInTheDocument();
    expect(screen.getByText('Child 1')).toBeInTheDocument();
  });

  test('shows queue-full error when backend rejects overfill', async () => {
    const user = userEvent.setup();
    mockPostCheckIn.mockRejectedValueOnce(new Error('Queue at capacity'));

    render(
      <MemoryRouter>
        <AddWalkInPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Parent First Name'), 'Jane');
    await user.type(screen.getByLabelText('Parent Last Name'), 'Doe');
    await user.type(screen.getByLabelText('Phone'), '5551234567');
    await user.type(screen.getByPlaceholderText('First name'), 'Amy');
    await user.type(screen.getByPlaceholderText('Last name'), 'Doe');
    await user.type(screen.getByPlaceholderText('Symptoms'), 'Cough');

    await user.click(screen.getByRole('button', { name: 'Create Walk-In' }));

    await waitFor(() => {
      expect(screen.getByText('Queue at capacity')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
