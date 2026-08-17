import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CheckInProvider } from '../context/CheckInContext';
import { JoinPage } from './JoinPage';

describe('JoinPage', () => {
  test('Continue is disabled until required fields are entered', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CheckInProvider>
          <JoinPage />
        </CheckInProvider>
      </MemoryRouter>
    );

    const continueBtn = screen.getByRole('button', { name: 'Continue' });
    expect(continueBtn).toBeDisabled();

    await user.type(screen.getByLabelText('Parent/Guardian First Name'), 'Jane');
    await user.type(screen.getByLabelText('Parent/Guardian Last Name'), 'Doe');
    expect(continueBtn).toBeDisabled();

    await user.type(screen.getByLabelText('Phone Number'), '5551234567');
    expect(continueBtn).toBeEnabled();
  });
});
