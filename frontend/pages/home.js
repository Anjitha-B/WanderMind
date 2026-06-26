import { useState } from "react";
import { useRouter } from "next/router";
import { DateRange } from 'react-date-range';
import { format } from 'date-fns';
import { supabase } from '../utils/supabase';

import 'react-date-range/dist/styles.css'; 
import 'react-date-range/dist/theme/default.css';

export default function Home() {
	const router = useRouter();
	const [interests, setInterests] = useState("culture, food");
	const [destination, setDestination] = useState("");
	const [days, setDays] = useState(1);
	const [itinerary, setItinerary] = useState(null);
	const [loading, setLoading] = useState(false);
	const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [openCalendar, setOpenCalendar] = useState(false);
    const [dateRange, setDateRange] = useState([
        {
            startDate: new Date(),
            endDate: new Date(),
            key: 'selection'
        }
      ]);

    const displayDates = () => {
        const start = format(dateRange[0].startDate, 'MMM dd, yyyy');
        const end = format(dateRange[0].endDate, 'MMM dd, yyyy');
        return `${start} – ${end}`;
    };

	const generateItinerary = async () => {
        setLoading(true);
        try {
            // 1. Format the selected date range into a backend-friendly string format (e.g., "YYYY-MM-DD")
            const formattedStartDate = format(dateRange[0].startDate, 'yyyy-MM-dd');
            const formattedEndDate = format(dateRange[0].endDate, 'yyyy-MM-dd');
        
            // 2. Clean the interests string into an array by splitting on commas and trimming whitespace
            const interestsArray = interests.split(',').map(i => i.trim()).filter(Boolean);

            const response = await fetch("http://localhost:8000/generate-itinerary", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
               
                body: JSON.stringify({
                    destination: destination,
                    start_date: formattedStartDate,
                    end_date: formattedEndDate,
                    interests: interestsArray
                }),
            });
            if (!response.ok) {
                throw new Error("Failed to generate itinerary");
            }

            const data = await response.json();
            setItinerary(data);
        } catch (error) {
            console.error("Generation failed:", error);
        } finally {
            setLoading(false);
        }
    };

	const handleLogout = () => {
		setIsProfileOpen(false);
		router.push("/login");
	};

	const handleProfile = () => {
		setIsProfileOpen(false);
		router.push("/profile");
	};

    const handleTrips = () => {
		setIsProfileOpen(false);
		router.push("/trips");
	};

	// Defensive helpers: some backend responses may return the itinerary array
	// as `data.itinerary` or as the top-level array. Prepare a safe array to map.
	const daysArray = (() => {
		if (!itinerary) return [];
		if (Array.isArray(itinerary.itinerary)) return itinerary.itinerary;
		if (Array.isArray(itinerary)) return itinerary;
		return [];
	})();

	const displayDestinationName = (() => {
		if (!itinerary) return destination || "";
		return itinerary.destination ?? itinerary.dest ?? destination ?? "";
	})();

    const [isSaving, setIsSaving] = useState(false);
    const saveItineraryViaBackend = async () => {
        if (!itinerary) return;
            setIsSaving(true);

        try {
        // 1. Grab the current user session ID from the authentication context layer
            const { data: { user }, error: userError } = await supabase.auth.getUser();
        
            if (userError || !user) {
                alert("You must be logged in to save itineraries!");
                setIsSaving(false);
                return;
            }

            // 2. Format dates from your local calendar tracking objects
            const formattedStartDate = format(dateRange[0].startDate, 'yyyy-MM-dd');
            const formattedEndDate = format(dateRange[0].endDate, 'yyyy-MM-dd');

            // 3. Clean interests string into an array split payload
            const interestsArray = interests.split(',').map(i => i.trim()).filter(Boolean);

            // 4. Fire the data request straight to your FastAPI endpoint gate!
            const response = await fetch("http://localhost:8000/save-itinerary", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    user_id: user.id,                     // Crucial binding anchor
                    destination: itinerary.destination,   // Extracted city/country title string
                    start_date: formattedStartDate,       
                    end_date: formattedEndDate,           
                    interests: interestsArray,            
                    itinerary_data: itinerary.itinerary   // Pass the generated JSON array layout
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Server rejected save query");
            }

            alert("Itinerary saved to your dashboard successfully!");

        } catch (error) {
            console.error("Backend save transaction failed:", error);
            alert(`Failed to save: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

	return (
		<div className="min-h-screen w-full bg-slate-50">
			<header className="w-full bg-white shadow-sm">
				<div className="max-w-10xl mx-auto px-10 py-4 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<img src="/Wander Mind-icon.png" width={50} height={50} alt="logo" />
						<h1 className="text-3xl font-bold text-[#652C15] font-['Forge_BC']">
							WanderMind
						</h1>
					</div>
					<div className="relative">
						<button
							onClick={() => setIsProfileOpen((prev) => !prev)}
							className="flex items-center justify-center rounded-full hover:bg-slate-100 p-2"
							aria-label="Open profile menu"
							aria-expanded={isProfileOpen}
						>
							<img
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
									onClick={handleTrips}
								>
									My Trips
								</button>
                                <button
									className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
									onClick={handleProfile}
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
							style={{ padding: "10px 12px", borderRadius: "6px" }}
							className="border w-[220px] min-w-0 flex-shrink-0"
							placeholder="Destination (e.g., Paris)"
							value={destination}
							onChange={(e) => setDestination(e.target.value)}
						/>

						<div className="relative flex-none w-[260px]">
                        <div 
                            style={{ padding: "10px 12px", borderRadius: "6px" }}
                            className="border bg-white cursor-pointer text-gray-700 flex items-center hover:border-amber-400 transition"
                            onClick={() => setOpenCalendar(!openCalendar)}
                        >
                        <span>📅 {displayDates()}</span>
                        </div>

                        {/* Floating Calendar Overlay Popover */}
                        {openCalendar && (
                            <div className="absolute left-0 top-full z-50 mt-2 p-2 bg-white border border-amber-100 rounded-xl shadow-xl">
                                <DateRange
                                    editableDateInputs={true}
                                    onChange={item => setDateRange([item.selection])}
                                    moveRangeOnFirstSelection={false}
                                    ranges={dateRange}
                                    rangeColors={['#652C15']} 
                                    minDate={new Date()}     // Prevents selecting vacation days in the past
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
                        )  }
                            </div>

						<input
							style={{ padding: "10px 12px", borderRadius: "6px" }}
							className="border w-[280px] min-w-0"
							placeholder="Interests (e.g. culture, food, adventure)"
							value={interests}
							onChange={(e) => setInterests(e.target.value)}
						/>

						<button
							onClick={generateItinerary}
							style={{ padding: "10px 16px", borderRadius: "6px" }}
							className="bg-[#652C15] text-white px-4 py-2 rounded-md flex-shrink-0"
							disabled={!destination || loading}
						>
							{loading ? "Generating..." : "Generate Itinerary"}
						</button>
					</div>
				</div>

				{itinerary && (
					<div className="mt-10 max-w-2xl">
						<div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-semibold text-[#652C15] font-sans">
                                Trip to {itinerary.destination}
                            </h2>
            
                            {/* The interactive Save persistence trigger */}
                            <button 
                                onClick={saveItineraryViaBackend}
                                disabled={isSaving}
                                className="px-4 py-2 bg-[#652C15] text-white rounded-md text-sm font-medium hover:bg-opacity-90 shadow transition disabled:opacity-50"
                            >
                                {isSaving ? "Saving..." : "Save to My Trips"}
                            </button>
                        </div>

						{itinerary.itinerary.map((day) => (
							<div key={day.day} className="bg-white p-4 rounded shadow mb-4">
								<h3 className="text-xl font-bold mb-2">Day {day.day}</h3>
								<ul className="list-disc ml-6">
									{day.activities.map((activity, idx) => (
										<li key={idx}>{activity}</li>
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
