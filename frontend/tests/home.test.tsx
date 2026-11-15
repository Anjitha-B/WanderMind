import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { format } from 'date-fns';
import type { Mock } from 'vitest';
import { apiFetch } from '../utils/api';
import Home from '../pages/home';

vi.mock('next/router', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('../utils/supabase', () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock('../utils/useRequireAuth', () => ({
  useRequireAuth: () => ({ access_token: 'token', user: { id: 'user-a' } }),
}));
vi.mock('../utils/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/api')>()),
  apiFetch: vi.fn(),
}));

const apiFetchMock = apiFetch as Mock;
const TODAY = format(new Date(), 'yyyy-MM-dd');
const ITINERARY = [{ day: 1, activities: ['Tram 28'] }];

function bodyOf(call: unknown[]): unknown {
  const options = call[1] as RequestInit;
  return JSON.parse(options.body as string);
}

const destinationInput = () => screen.getByPlaceholderText('Destination (e.g., Paris)');
const interestsInput = () => screen.getByPlaceholderText(/^Interests/);

async function generateLisbon() {
  apiFetchMock.mockResolvedValueOnce({ destination: 'Lisbon', itinerary: ITINERARY });
  fireEvent.change(destinationInput(), { target: { value: 'Lisbon' } });
  fireEvent.change(interestsInput(), { target: { value: 'food, trams' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate Itinerary' }));
  await screen.findByText('Tram 28');
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('Home: saving a generated itinerary', () => {
  it('saves the request that produced the itinerary when the form is unchanged', async () => {
    render(<Home />);
    await generateLisbon();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    apiFetchMock.mockResolvedValueOnce({ id: '1' });
    fireEvent.click(screen.getByRole('button', { name: 'Save to My Trips' }));
    await screen.findByText(/saved to your dashboard/);

    const [generateCall, saveCall] = apiFetchMock.mock.calls as unknown[][];
    expect(saveCall?.[0]).toBe('/api/v1/trips');
    expect(bodyOf(saveCall ?? [])).toEqual({
      ...(bodyOf(generateCall ?? []) as object),
      itinerary_data: ITINERARY,
    });
  });

  it('still saves the original destination and interests after the form changes', async () => {
    render(<Home />);
    await generateLisbon();

    fireEvent.change(destinationInput(), { target: { value: 'Porto' } });
    fireEvent.change(interestsInput(), { target: { value: 'wine' } });

    // The page says which trip the itinerary belongs to.
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('It was made for Lisbon');
    expect(note).toHaveTextContent('saving keeps those details');

    apiFetchMock.mockResolvedValueOnce({ id: '1' });
    fireEvent.click(screen.getByRole('button', { name: 'Save to My Trips' }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));

    expect(bodyOf(apiFetchMock.mock.calls[1] as unknown[])).toEqual({
      destination: 'Lisbon',
      start_date: TODAY,
      end_date: TODAY,
      interests: ['food', 'trams'],
      itinerary_data: ITINERARY,
    });
  });

  it('drops the note when the form is put back', async () => {
    render(<Home />);
    await generateLisbon();

    fireEvent.change(destinationInput(), { target: { value: 'Porto' } });
    expect(screen.getByRole('note')).toBeInTheDocument();
    fireEvent.change(destinationInput(), { target: { value: 'Lisbon' } });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('uses the new values after generating again', async () => {
    render(<Home />);
    await generateLisbon();

    apiFetchMock.mockResolvedValueOnce({ destination: 'Porto', itinerary: ITINERARY });
    fireEvent.change(destinationInput(), { target: { value: 'Porto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Itinerary' }));
    await screen.findByText('Trip to Porto');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    apiFetchMock.mockResolvedValueOnce({ id: '2' });
    fireEvent.click(screen.getByRole('button', { name: 'Save to My Trips' }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(3));
    expect(bodyOf(apiFetchMock.mock.calls[2] as unknown[])).toMatchObject({
      destination: 'Porto',
    });
  });
});
