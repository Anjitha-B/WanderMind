import { useState } from "react";
import { useRouter } from "next/router";

export default function Home() {
	const router = useRouter();
	const [interests, setInterests] = useState("culture, food");
	const [destination, setDestination] = useState("");
	const [days, setDays] = useState(1);
	const [itinerary, setItinerary] = useState(null);
	const [loading, setLoading] = useState(false);
	const [isProfileOpen, setIsProfileOpen] = useState(false);

	const generateItinerary = async () => {
		setLoading(true);
		setItinerary(null);

		const res = await fetch("http://localhost:8000/generate-itinerary", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				destination,
				days,
				interests: interests.split(",").map((i) => i.trim()),
			}),
		});

		const data = await res.json();
		setItinerary(data);
		setLoading(false);
	};

	const handleLogout = () => {
		setIsProfileOpen(false);
		router.push("/login");
	};

	const handleProfile = () => {
		setIsProfileOpen(false);
		router.push("/profile");
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
					<div
						style={{
							display: "flex",
							alignItems: "center",
							columnGap: "16px",
							flexWrap: "wrap",
						}}
					>
						<input
							style={{ width: "220px", padding: "10px 12px", borderRadius: "6px" }}
							className="border"
							placeholder="Destination (e.g., Paris)"
							value={destination}
							onChange={(e) => setDestination(e.target.value)}
						/>

						<input
							style={{ width: "100px", padding: "10px 12px", borderRadius: "6px" }}
							className="border"
							type="number"
							min="1"
							value={days}
							onChange={(e) => setDays(Number(e.target.value))}
						/>

						<input
							style={{ width: "280px", padding: "10px 12px", borderRadius: "6px" }}
							className="border"
							placeholder="Interests (e.g. culture, food, adventure)"
							value={interests}
							onChange={(e) => setInterests(e.target.value)}
						/>

						<button
							onClick={generateItinerary}
							style={{ padding: "10px 16px", borderRadius: "6px" }}
							className="bg-blue-600 text-white"
							disabled={!destination || loading}
						>
							{loading ? "Generating..." : "Generate Itinerary"}
						</button>
					</div>
				</div>

				{itinerary && (
					<div className="mt-10 max-w-2xl">
						<h2 className="text-2xl font-semibold mb-4">
							Trip to {itinerary.destination}
						</h2>

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
