import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { DateRange, type Range } from 'react-date-range';
import { format } from 'date-fns';
import StatusMessage from '../components/StatusMessage';
import type { GenerateRequest, ItineraryResponse, Status, Trip, TripCreate } from '../types/models';
import { apiFetch, errorMessage } from '../utils/api';
import { supabase } from '../utils/supabase';
import { useRequireAuth } from '../utils/useRequireAuth';

import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';

function parseInterests(text: string): string[] {
  return text
    .split(',')
    .map((interest) => interest.trim())
    .filter(Boolean);
}

export default function Home() {
  const router = useRouter();
  const session = useRequireAuth();
  const [interests, setInterests] = useState('culture, food');
  const [destination, setDestination] = useState('');
  const [itinerary, setItinerary] = useState<ItineraryResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<Status | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<Status | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [openCalendar, setOpenCalendar] = useState(false);
  const [dateRange, setDateRange] = useState<Range>(() => ({
    startDate: new Date(),
    endDate: new Date(),
    key: 'selection',
  }));

  const startDate = dateRange.startDate ?? new Date();
  const endDate = dateRange.endDate ?? startDate;
  const displayDates = `${format(startDate, 'MMM dd, yyyy')} – ${format(endDate, 'MMM dd, yyyy')}`;

  const generateItinerary = async () => {
    setIsGenerating(true);
    setGenerateError(null);
    setSaveStatus(null);
    const request: GenerateRequest = {
      destination,
      start_date: format(startDate, 'yyyy-MM-dd'),
      end_date: format(endDate, 'yyyy-MM-dd'),
      interests: parseInterests(interests),
    };
    try {
      const result = await apiFetch<ItineraryResponse>('/api/v1/itineraries/generate', {
        method: 'POST',
        body: JSON.stringify(request),
      });
      setItinerary(result);
    } catch (error) {
      console.error('Generation failed:', error);
      setGenerateError({
        type: 'error',
        text: `Failed to generate itinerary: ${errorMessage(error)}`,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const saveItinerary = async () => {
    if (!itinerary) return;
    setIsSaving(true);
    setSaveStatus(null);
    // The backend takes the owner from the verified access token.
    const trip: TripCreate = {
      destination: itinerary.destination,
      start_date: format(startDate, 'yyyy-MM-dd'),
      end_date: format(endDate, 'yyyy-MM-dd'),
      interests: parseInterests(interests),
      itinerary_data: itinerary.itinerary,
    };
    try {
      await apiFetch<Trip>('/api/v1/trips', { method: 'POST', body: JSON.stringify(trip) });
      setSaveStatus({ type: 'success', text: 'Itinerary saved to your dashboard successfully!' });
    } catch (error) {
      console.error('Save failed:', error);
      setSaveStatus({ type: 'error', text: `Failed to save: ${errorMessage(error)}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    setIsProfileOpen(false);
    const { error } = await supabase.auth.signOut();
    if (error) {
      // Still end this browser's session if the server call failed.
      console.error('Sign out failed:', error);
      await supabase.auth.signOut({ scope: 'local' });
    }
    router.push('/login');
  };

  const goTo = (path: string) => {
    setIsProfileOpen(false);
    router.push(path);
  };

  if (!session) return null;

  return (
    <div className="min-h-screen w-full bg-slate-50">
      <header className="w-full bg-white shadow-sm">
        <div className="max-w-10xl mx-auto px-10 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/Wander Mind-icon.png" width={50} height={50} alt="logo" />
            <h1 className="text-3xl font-bold text-[#652C15] font-['Forge_BC']">WanderMind</h1>
          </div>
          <div className="relative">
            <button
              onClick={() => setIsProfileOpen((open) => !open)}
              className="flex items-center justify-center rounded-full hover:bg-slate-100 p-2"
              aria-label="Open profile menu"
              aria-expanded={isProfileOpen}
            >
              <Image
                src="/Profile-icon.png"
                width={50}
                height={50}
                alt="Profile"
                className="rounded-full"
              />
            </button>
            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-40 rounded-lg border border-slate-200 bg-white shadow-lg">
                <button
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => goTo('/trips')}
                >
                  My Trips
                </button>
                <button
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => goTo('/profile')}
                >
                  Profile
                </button>
                <button
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  onClick={handleLogout}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-10 py-8">
        <h1 className="text-3xl font-bold mb-6 text-[#652C15] font-sans">
          Generate Your Personalized Travel Itinerary with Wander Mind
        </h1>

        <div className="bg-white p-6 rounded shadow-md">
          <div className="flex items-center gap-4 flex-nowrap flex-wrap-0">
            <input
              style={{ padding: '10px 12px', borderRadius: '6px' }}
              className="border w-[220px] min-w-0 flex-shrink-0"
              placeholder="Destination (e.g., Paris)"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />

            <div className="relative flex-none w-[260px]">
              <div
                style={{ padding: '10px 12px', borderRadius: '6px' }}
                className="border bg-white cursor-pointer text-gray-700 flex items-center hover:border-amber-400 transition"
                onClick={() => setOpenCalendar((open) => !open)}
              >
                <span>📅 {displayDates}</span>
              </div>

              {openCalendar && (
                <div className="absolute left-0 top-full z-50 mt-2 p-2 bg-white border border-amber-100 rounded-xl shadow-xl">
                  <DateRange
                    editableDateInputs={true}
                    onChange={(ranges) => {
                      const selection = ranges.selection;
                      if (selection) setDateRange(selection);
                    }}
                    moveRangeOnFirstSelection={false}
                    ranges={[dateRange]}
                    rangeColors={['#652C15']}
                    // No trips in the past.
                    minDate={new Date()}
                  />
                  <div className="flex justify-end p-2 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                    <button
                      className="px-4 py-1.5 bg-[#652C15] text-white text-sm rounded-md font-medium hover:opacity-90"
                      onClick={() => setOpenCalendar(false)}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>

            <input
              style={{ padding: '10px 12px', borderRadius: '6px' }}
              className="border w-[280px] min-w-0"
              placeholder="Interests (e.g. culture, food, adventure)"
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
            />

            <button
              onClick={generateItinerary}
              style={{ padding: '10px 16px', borderRadius: '6px' }}
              className="bg-[#652C15] text-white px-4 py-2 rounded-md flex-shrink-0 disabled:opacity-50"
              disabled={!destination || isGenerating}
            >
              {isGenerating ? 'Generating...' : 'Generate Itinerary'}
            </button>
          </div>

          {isGenerating && (
            <p role="status" className="mt-4 text-sm text-slate-500 animate-pulse">
              Researching and writing your itinerary. This can take up to a minute.
            </p>
          )}
          <StatusMessage status={generateError} className="mt-4" />
        </div>

        {itinerary && (
          <div className="mt-10 max-w-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold text-[#652C15] font-sans">
                Trip to {itinerary.destination}
              </h2>

              <button
                onClick={saveItinerary}
                disabled={isSaving}
                className="px-4 py-2 bg-[#652C15] text-white rounded-md text-sm font-medium hover:bg-opacity-90 shadow transition disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save to My Trips'}
              </button>
            </div>

            <StatusMessage status={saveStatus} className="mb-6" />

            {itinerary.itinerary.map((day) => (
              <div key={day.day} className="bg-white p-4 rounded shadow mb-4">
                <h3 className="text-xl font-bold mb-2">Day {day.day}</h3>
                <ul className="list-disc ml-6">
                  {day.activities.map((activity, index) => (
                    <li key={index}>{activity}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
