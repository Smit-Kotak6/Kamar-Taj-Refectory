import { useEffect, useState } from 'react';
import { getMeals, type Meal } from './api';

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function ApiTest() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMeals(todayStr())
      .then(setMeals)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="p-4 text-[#C0394B]">{error}</p>;
  if (meals.length === 0) return <p className="p-4">Loading...</p>;

  return (
    <div className="p-4 space-y-3">
      {meals.map((m) => (
        <div key={m.id} className="rounded-2xl border border-[#F1E4D8] bg-[#FFFDFB] p-4">
          <p className="font-semibold capitalize">{m.type}: {m.title}</p>
          <p className="text-sm">Status: {m.closed ? 'UNAVAILABLE — MESS CLOSED' : m.status}</p>
          <p className="text-sm">Cutoff: {new Date(m.cutoffAt).toLocaleTimeString()}</p>
        </div>
      ))}
    </div>
  );
}