import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { format } from 'date-fns';
import Link from 'next/link';

export default function MyTrips() {
    const [trips, setTrips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTrip, setSelectedTrip] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

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

    // NEW DELETE HANDLER TRUCKING OVER THE BACKEND ENDPOINT
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
            
            // Clear out the main screen panel selection state
            setSelectedTrip(null);
            
            // Refresh the left lane feed array live locally
            fetchUserTrips();

        } catch (error) {
            console.error("Deletion lifecycle failure:", error);
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
                        {/* LEFT COLUMN: LIST */}
                        <div className="lg:col-span-1 space-y-4 overflow-y-auto max-h-[75vh] pr-2">
                            {trips.map((trip) => (
                                <div 
                                    key={trip.id}
                                    onClick={() => setSelectedTrip(trip)}
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

                        {/* RIGHT COLUMN: DETAILED VIEW WITH DELETE ACTION */}
                        <div className="lg:col-span-2">
                            {selectedTrip ? (
                                <div className="bg-white p-6 rounded-2xl border border-amber-100 shadow-sm sticky top-6 max-h-[80vh] overflow-y-auto">
                                    
                                    {/* Action Row Container Header */}
                                    <div className="flex justify-between items-start mb-4 gap-4">
                                        <div>
                                            <h2 className="text-2xl font-bold text-[#652C15] font-sans">
                                                Adventure in {selectedTrip.destination}
                                            </h2>
                                            <p className="text-sm text-gray-500 mt-1">
                                                Full schedule matching window: <strong>{selectedTrip.start_date}</strong> to <strong>{selectedTrip.end_date}</strong>
                                            </p>
                                        </div>
                                        
                                        {/* THE DYNAMIC DELETE BUTTON INTERACTION */}
                                        <button
                                            onClick={() => deleteItinerary(selectedTrip.id)}
                                            disabled={isDeleting}
                                            className="px-3 py-1.5 border border-red-200 text-red-600 text-xs font-medium rounded-md hover:bg-red-50 transition disabled:opacity-50 flex items-center gap-1 shrink-0"
                                        >
                                            {isDeleting ? "Erasing..." : "🗑️ Delete Trip"}
                                        </button>
                                    </div>

                                    <div className="space-y-6 mt-6 border-t border-slate-100 pt-6">
                                        {selectedTrip.itinerary_data.map((day) => (
                                            <div key={day.day} className="border-l-2 border-amber-200 pl-4 relative">
                                                <div className="absolute w-3 h-3 bg-[#652C15] rounded-full -left-[7px] top-1.5" />
                                                <h4 className="font-bold text-lg text-[#652C15] mb-2">Day {day.day}</h4>
                                                <ul className="list-disc ml-4 space-y-1.5">
                                                    {day.activities.map((activity, idx) => (
                                                        <li key={idx} className="text-gray-700 text-sm">{activity}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full min-h-[40vh] flex flex-col items-center justify-center bg-amber-50/40 rounded-2xl border border-dashed border-amber-200 p-8 text-center text-gray-400">
                                    <span>🗺️</span>
                                    <p className="text-sm mt-2">Select an itinerary from the sidebar to view full daily details.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}