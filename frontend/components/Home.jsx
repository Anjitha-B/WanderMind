import { useState } from "react";

export default function Home() {
  const [message, setMessage] = useState("");

  const fetchMessage = async () => {
    const res = await fetch("http://127.0.0.1:8000/hello");
    const data = await res.json();
    setMessage(data.message);
  };

  return (
    <div className="p-10">
      <h1 className="text-3xl font-bold mb-4">WanderMind</h1>
      <button
        onClick={fetchMessage}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Fetch Backend Message
      </button>
      {message && <p className="mt-4 text-xl">{message}</p>}
    </div>
  );
}
