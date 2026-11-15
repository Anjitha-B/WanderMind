import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import StatusMessage from '../components/StatusMessage';
import type { DayPlan, Status, Trip, TripList, TripUpdate } from '../types/models';
import { apiFetch, errorMessage } from '../utils/api';
import { addActivity, removeActivity, updateActivity } from '../utils/itinerary';
import { useRequireAuth } from '../utils/useRequireAuth';

export default function MyTrips() {
  const session = useRequireAuth();
  const userId = session?.user.id;
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Status | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  // Reports the result of the last update or delete.
  const [status, setStatus] = useState<Status | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editedItinerary, setEditedItinerary] = useState<DayPlan[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Bumped after an update or delete to load the list again.
  const [reloadCount, setReloadCount] = useState(0);
  const reloadTrips = () => setReloadCount((count) => count + 1);

  useEffect(() => {
    if (!userId) return;
    let active = true;

    apiFetch<TripList>('/api/v1/trips')
      .then((data) => {
        if (!active) return;
        setTrips(data.trips);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error('Loading trips failed:', error);
        setLoadError({ type: 'error', text: `Could not load your trips: ${errorMessage(error)}` });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId, reloadCount]);

  const selectTrip = (trip: Trip) => {
    setSelectedTrip(trip);
    setIsEditing(false);
    setIsConfirmingDelete(false);
    setStatus(null);
  };

  const startEditing = () => {
    if (!selectedTrip) return;
    // No copy needed: every edit below builds new arrays instead of mutating.
    setEditedItinerary(selectedTrip.itinerary_data);
    setIsEditing(true);
    setIsConfirmingDelete(false);
    setStatus(null);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditedItinerary([]);
  };

  const saveEdit = async () => {
    if (!selectedTrip) return;
    setIsSavingEdit(true);
    setStatus(null);
    const update: TripUpdate = { itinerary_data: editedItinerary };
    try {
      await apiFetch<Trip>(`/api/v1/trips/${selectedTrip.id}`, {
        method: 'PATCH',
        body: JSON.stringify(update),
      });
      setSelectedTrip({ ...selectedTrip, itinerary_data: editedItinerary });
      setIsEditing(false);
      setStatus({ type: 'success', text: 'Itinerary updated successfully.' });
      reloadTrips();
    } catch (error) {
      console.error('Update failed:', error);
      setStatus({ type: 'error', text: `Failed to save edits: ${errorMessage(error)}` });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const deleteTrip = async (tripId: string) => {
    setIsDeleting(true);
    setStatus(null);
    try {
      await apiFetch<null>(`/api/v1/trips/${tripId}`, { method: 'DELETE' });
      setSelectedTrip(null);
      setIsEditing(false);
      setStatus({ type: 'success', text: 'Itinerary removed successfully.' });
      reloadTrips();
    } catch (error) {
      console.error('Delete failed:', error);
      setStatus({ type: 'error', text: `Failed to delete: ${errorMessage(error)}` });
    } finally {
      setIsDeleting(false);
      setIsConfirmingDelete(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p role="status" className="text-lg font-medium text-[#652C15]">
          Loading your travel log...
        </p>
      </div>
    );
  }

  const shownItinerary = isEditing ? editedItinerary : (selectedTrip?.itinerary_data ?? []);

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-6 sm:px-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8 border-b border-amber-100 pb-4">
          <div>
            <Link href="/home" className="text-sm text-amber-800 hover:underline">
              ← Back to Generator
            </Link>
            <h1 className="text-3xl font-bold text-[#652C15] font-sans mt-1">My Saved Journeys</h1>
          </div>
          <span className="bg-amber-100 text-amber-900 text-xs font-semibold px-3 py-1 rounded-full">
            {trips.length} {trips.length === 1 ? 'Trip' : 'Trips'} Logged
          </span>
        </div>

        <StatusMessage status={loadError} className="mb-6" />
        <StatusMessage status={status} className="mb-6" />

        {loadError ? null : trips.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-amber-100">
            <p className="text-gray-500 mb-4">You haven&apos;t saved any itineraries yet.</p>
            <Link
              href="/home"
              className="px-5 py-2.5 bg-[#652C15] text-white rounded-md text-sm font-medium hover:bg-opacity-90 shadow transition"
            >
              Plan a New Vacation
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Sidebar list */}
            <div className="lg:col-span-1 space-y-4 overflow-y-auto max-h-[75vh] pr-2">
              {trips.map((trip) => (
                <div
                  key={trip.id}
                  onClick={() => selectTrip(trip)}
                  className={`p-4 bg-white rounded-xl border cursor-pointer transition shadow-sm hover:shadow-md ${
                    selectedTrip?.id === trip.id
                      ? 'border-[#652C15] ring-1 ring-[#652C15]'
                      : 'border-amber-100'
                  }`}
                >
                  <h3 className="font-bold text-lg text-[#652C15] truncate">
                    📍 {trip.destination}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    🗓️ {format(new Date(trip.start_date), 'MMM d')} –{' '}
                    {format(new Date(trip.end_date), 'MMM d, yyyy')}
                  </p>
                  {trip.interests && trip.interests.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {trip.interests.slice(0, 3).map((interest, index) => (
                        <span
                          key={index}
                          className="bg-slate-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-md"
                        >
                          {interest}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Trip details: view or edit */}
            <div className="lg:col-span-2">
              {selectedTrip ? (
                <div className="bg-white p-6 rounded-2xl border border-amber-100 shadow-sm sticky top-6 max-h-[80vh] overflow-y-auto">
                  <div className="flex justify-between items-start mb-4 gap-4">
                    <div>
                      <h2 className="text-2xl font-bold text-[#652C15] font-sans">
                        Adventure in {selectedTrip.destination}
                      </h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Dates: <strong>{selectedTrip.start_date}</strong> to{' '}
                        <strong>{selectedTrip.end_date}</strong>
                      </p>
                    </div>

                    <div className="flex gap-2 shrink-0">
                      {isEditing ? (
                        <>
                          <button
                            onClick={saveEdit}
                            disabled={isSavingEdit}
                            className="px-3 py-1.5 bg-[#652C15] text-white text-xs font-medium rounded-md hover:bg-opacity-90 transition disabled:opacity-50 flex items-center gap-1"
                          >
                            {isSavingEdit ? 'Saving...' : '💾 Save Changes'}
                          </button>
                          <button
                            onClick={cancelEditing}
                            disabled={isSavingEdit}
                            className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-medium rounded-md hover:bg-gray-50 transition"
                          >
                            Cancel
                          </button>
                        </>
                      ) : isConfirmingDelete ? (
                        <>
                          <button
                            onClick={() => deleteTrip(selectedTrip.id)}
                            disabled={isDeleting}
                            className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-md hover:bg-red-700 transition disabled:opacity-50"
                          >
                            {isDeleting ? 'Deleting...' : 'Confirm delete'}
                          </button>
                          <button
                            onClick={() => setIsConfirmingDelete(false)}
                            disabled={isDeleting}
                            className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-medium rounded-md hover:bg-gray-50 transition"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={startEditing}
                            className="px-3 py-1.5 border border-amber-300 text-[#652C15] text-xs font-medium rounded-md hover:bg-amber-50 transition flex items-center gap-1"
                          >
                            ✏️ Edit Trip
                          </button>
                          <button
                            onClick={() => {
                              setIsConfirmingDelete(true);
                              setStatus(null);
                            }}
                            className="px-3 py-1.5 border border-red-200 text-red-600 text-xs font-medium rounded-md hover:bg-red-50 transition flex items-center gap-1"
                          >
                            🗑️ Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isConfirmingDelete && (
                    <p role="alert" className="text-sm text-red-700 mb-2">
                      This permanently deletes the itinerary. Confirm to continue.
                    </p>
                  )}

                  <div className="space-y-6 mt-6 border-t border-slate-100 pt-6">
                    {shownItinerary.map((day, dayIndex) => (
                      <div
                        key={day.day || dayIndex}
                        className="border-l-2 border-amber-200 pl-4 relative"
                      >
                        <div className="absolute w-3 h-3 bg-[#652C15] rounded-full -left-[7px] top-1.5" />
                        <h4 className="font-bold text-lg text-[#652C15] mb-3">Day {day.day}</h4>

                        {isEditing ? (
                          <div className="space-y-2">
                            {day.activities.map((activity, activityIndex) => (
                              <div key={activityIndex} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={activity}
                                  onChange={(e) =>
                                    setEditedItinerary((days) =>
                                      updateActivity(days, dayIndex, activityIndex, e.target.value),
                                    )
                                  }
                                  className="w-full text-sm p-2 border border-slate-200 rounded-md focus:outline-none focus:border-[#652C15]"
                                />
                                <button
                                  onClick={() =>
                                    setEditedItinerary((days) =>
                                      removeActivity(days, dayIndex, activityIndex),
                                    )
                                  }
                                  title="Remove Activity"
                                  className="text-red-500 hover:text-red-700 text-xs px-2 py-1 border border-red-100 rounded hover:bg-red-50"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                            <button
                              onClick={() =>
                                setEditedItinerary((days) => addActivity(days, dayIndex))
                              }
                              className="mt-2 text-xs font-medium text-amber-800 hover:underline flex items-center gap-1"
                            >
                              + Add Activity to Day {day.day}
                            </button>
                          </div>
                        ) : (
                          <ul className="list-disc ml-4 space-y-1.5">
                            {day.activities.map((activity, index) => (
                              <li key={index} className="text-gray-700 text-sm">
                                {activity}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-[40vh] flex flex-col items-center justify-center bg-amber-50/40 rounded-2xl border border-dashed border-amber-200 p-8 text-center text-gray-400">
                  <span>🗺️</span>
                  <p className="text-sm mt-2">
                    Select an itinerary from the sidebar to view or edit full daily details.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
