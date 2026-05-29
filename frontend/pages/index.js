/* import Home from "../components/Home";

export default function IndexPage() {
  return <Home />;
}
 */

import { useState } from "react";

export default function Home() {
  const [interests, setInterests] = useState("culture, food");
  const [destination, setDestination] = useState("");
  const [days, setDays] = useState(1);
  const [itinerary, setItinerary] = useState(null);
  const [loading, setLoading] = useState(false);

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

  // ...existing code...
  return (
    <div className="min-h-screen w-full bg-slate-50">
      <header className="w-full bg-white shadow-sm">
        <div className="max-w-10xl mx-auto px-10 py-4">
          <img src="/Wander Mind-icon.png" width={80} height={30} alt="logo" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-10 py-8">
        <h1 className="text-3xl font-bold mb-6 text-amber-900 font-sans">
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
