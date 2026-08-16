import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { format } from 'date-fns';
import Link from 'next/link';

export default function MyTrips() {
    const [trips, setTrips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTrip, setSelectedTrip] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Edit Mode State
    const [isEditing, setIsDeletingState] = useState(false);
    const [editedItineraryData, setEditedItineraryData] = useState([]);
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    useEffect(() => {
        fetchUserTrips();
    }, []);

    const fetchUserTrips = async () => {
        try {
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) {
                setLoading(false);
                return;
            }

            const response = await fetch(`http://localhost:8000/get-trips/${user.id}`);
            if (!response.ok) throw new Error("Failed to pull dashboard rows");

            const data = await response.json();
            setTrips(data.trips);
        } catch (error) {
            console.error("Dashboard sync error:", error);
        } finally {
            setLoading(false);
        }
    };

    // Trigger Edit Mode for Selected Trip
    const startEditing = () => {
        if (!selectedTrip) return;
        // Deep clone itinerary_data into editable state
        setEditedItineraryData(JSON.parse(JSON.stringify(selectedTrip.itinerary_data)));
        setIsDeletingState(true);
    };

    const cancelEditing = () => {
        setIsDeletingState(false);
        setEditedItineraryData([]);
    };

    // Handler to modify text of an activity
    const handleActivityChange = (dayIndex, activityIndex, newValue) => {
        const updated = [...editedItineraryData];
        updated[dayIndex].activities[activityIndex] = newValue;
        setEditedItineraryData(updated);
    };

    // Handler to delete an activity row from a day
    const removeActivity = (dayIndex, activityIndex) => {
        const updated = [...editedItineraryData];
        updated[dayIndex].activities.splice(activityIndex, 1);
        setEditedItineraryData(updated);
    };

    // Handler to add a new activity row to a day
    const addActivity = (dayIndex) => {
        const updated = [...editedItineraryData];
        updated[dayIndex].activities.push("New custom activity...");
        setEditedItineraryData(updated);
    };

    // Save Updated Itinerary to Backend API
    const saveItineraryEdit = async () => {
        setIsSavingEdit(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const response = await fetch(`http://localhost:8000/update-itinerary/${selectedTrip.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: user.id,
                    itinerary_data: editedItineraryData
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Server rejected update");
            }

            alert("✅ Itinerary updated successfully!");

            // Update local state and trip selection
            const updatedTrip = { ...selectedTrip, itinerary_data: editedItineraryData };
            setSelectedTrip(updatedTrip);
            setIsDeletingState(false);

            // Refresh sidebar list
            fetchUserTrips();

        } catch (error) {
            console.error("Update failure:", error);
            alert(`Failed to save edits: ${error.message}`);
        } finally {
            setIsSavingEdit(false);
        }
    };

    // Delete Handler
    const deleteItinerary = async (tripId) => {
        if (!confirm("Are you sure you want to permanently delete this itinerary?")) return;
        setIsDeleting(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const response = await fetch(`http://localhost:8000/delete-itinerary/${tripId}/${user.id}`, {
                method: "DELETE"
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Server rejected deletion");
            }

            alert("🗑️ Itinerary removed successfully.");
            setSelectedTrip(null);
            setIsDeletingState(false);
            fetchUserTrips();

        } catch (error) {
            console.error("Deletion failure:", error);
            alert(`Failed to delete: ${error.message}`);
        } finally {
            setIsDeleting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <p className="text-lg font-medium text-[#652C15]">Loading your travel log...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 py-10 px-6 sm:px-10">
            <div className="max-w-6xl mx-auto">
                {/* Header Section */}
                <div className="flex justify-between items-center mb-8 border-b border-amber-100 pb-4">
                    <div>
                        <Link href="/home" className="text-sm text-amber-800 hover:underline">← Back to Generator</Link>
                        <h1 className="text-3xl font-bold text-[#652C15] font-sans mt-1">My Saved Journeys</h1>
                    </div>
                    <span className="bg-amber-100 text-amber-900 text-xs font-semibold px-3 py-1 rounded-full">
                        {trips.length} {trips.length === 1 ? 'Trip' : 'Trips'} Logged
                    </span>
                </div>

                {trips.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-amber-100">
                        <p className="text-gray-500 mb-4">You haven't saved any itineraries yet.</p>
                        <Link href="/home" className="px-5 py-2.5 bg-[#652C15] text-white rounded-md text-sm font-medium hover:bg-opacity-90 shadow transition">
                            Plan a New Vacation
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* LEFT COLUMN: SIDEBAR LIST */}
                        <div className="lg:col-span-1 space-y-4 overflow-y-auto max-h-[75vh] pr-2">
                            {trips.map((trip) => (
                                <div 
                                    key={trip.id}
                                    onClick={() => {
                                        setSelectedTrip(trip);
                                        setIsDeletingState(false);
                                    }}
                                    className={`p-4 bg-white rounded-xl border cursor-pointer transition shadow-sm hover:shadow-md ${
                                        selectedTrip?.id === trip.id ? 'border-[#652C15] ring-1 ring-[#652C15]' : 'border-amber-100'
                                    }`}
                                >
                                    <h3 className="font-bold text-lg text-[#652C15] truncate">📍 {trip.destination}</h3>
                                    <p className="text-xs text-gray-500 mt-1">
                                        🗓️ {format(new Date(trip.start_date), 'MMM d')} – {format(new Date(trip.end_date), 'MMM d, yyyy')}
                                    </p>
                                    {trip.interests && trip.interests.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-3">
                                            {trip.interests.slice(0, 3).map((interest, idx) => (
                                                <span key={idx} className="bg-slate-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-md">
                                                    {interest}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* RIGHT COLUMN: TRIP DETAILS & EDIT / VIEW PANEL */}
                        <div className="lg:col-span-2">
                            {selectedTrip ? (
                                <div className="bg-white p-6 rounded-2xl border border-amber-100 shadow-sm sticky top-6 max-h-[80vh] overflow-y-auto">
                                    
                                    {/* Action Header */}
                                    <div className="flex justify-between items-start mb-4 gap-4">
                                        <div>
                                            <h2 className="text-2xl font-bold text-[#652C15] font-sans">
                                                Adventure in {selectedTrip.destination}
                                            </h2>
                                            <p className="text-sm text-gray-500 mt-1">
                                                Dates: <strong>{selectedTrip.start_date}</strong> to <strong>{selectedTrip.end_date}</strong>
                                            </p>
                                        </div>
                                        
                                        {/* ACTION BUTTONS */}
                                        <div className="flex gap-2 shrink-0">
                                            {!isEditing ? (
                                                <>
                                                    <button
                                                        onClick={startEditing}
                                                        className="px-3 py-1.5 border border-amber-300 text-[#652C15] text-xs font-medium rounded-md hover:bg-amber-50 transition flex items-center gap-1"
                                                    >
                                                        ✏️ Edit Trip
                                                    </button>
                                                    <button
                                                        onClick={() => deleteItinerary(selectedTrip.id)}
                                                        disabled={isDeleting}
                                                        className="px-3 py-1.5 border border-red-200 text-red-600 text-xs font-medium rounded-md hover:bg-red-50 transition disabled:opacity-50 flex items-center gap-1"
                                                    >
                                                        {isDeleting ? "Erasing..." : "🗑️ Delete"}
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={saveItineraryEdit}
                                                        disabled={isSavingEdit}
                                                        className="px-3 py-1.5 bg-[#652C15] text-white text-xs font-medium rounded-md hover:bg-opacity-90 transition disabled:opacity-50 flex items-center gap-1"
                                                    >
                                                        {isSavingEdit ? "Saving..." : "💾 Save Changes"}
                                                    </button>
                                                    <button
                                                        onClick={cancelEditing}
                                                        disabled={isSavingEdit}
                                                        className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-medium rounded-md hover:bg-gray-50 transition"
                                                    >
                                                        Cancel
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* CONTENT VIEW / EDIT MODE */}
                                    <div className="space-y-6 mt-6 border-t border-slate-100 pt-6">
                                        {(isEditing ? editedItineraryData : selectedTrip.itinerary_data).map((day, dayIdx) => (
                                            <div key={day.day || dayIdx} className="border-l-2 border-amber-200 pl-4 relative">
                                                <div className="absolute w-3 h-3 bg-[#652C15] rounded-full -left-[7px] top-1.5" />
                                                <h4 className="font-bold text-lg text-[#652C15] mb-3">Day {day.day}</h4>
                                                
                                                {isEditing ? (
                                                    /* EDITABLE MODE ACTIVITY LIST */
                                                    <div className="space-y-2">
                                                        {day.activities.map((act, actIdx) => (
                                                            <div key={actIdx} className="flex items-center gap-2">
                                                                <input
                                                                    type="text"
                                                                    value={act}
                                                                    onChange={(e) => handleActivityChange(dayIdx, actIdx, e.target.value)}
                                                                    className="w-full text-sm p-2 border border-slate-200 rounded-md focus:outline-none focus:border-[#652C15]"
                                                                />
                                                                <button
                                                                    onClick={() => removeActivity(dayIdx, actIdx)}
                                                                    title="Remove Activity"
                                                                    className="text-red-500 hover:text-red-700 text-xs px-2 py-1 border border-red-100 rounded hover:bg-red-50"
                                                                >
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        ))}
                                                        <button
                                                            onClick={() => addActivity(dayIdx)}
                                                            className="mt-2 text-xs font-medium text-amber-800 hover:underline flex items-center gap-1"
                                                        >
                                                            + Add Activity to Day {day.day}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    /* DISPLAY MODE ACTIVITY LIST */
                                                    <ul className="list-disc ml-4 space-y-1.5">
                                                        {day.activities.map((activity, idx) => (
                                                            <li key={idx} className="text-gray-700 text-sm">{activity}</li>
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
                                    <p className="text-sm mt-2">Select an itinerary from the sidebar to view or edit full daily details.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}