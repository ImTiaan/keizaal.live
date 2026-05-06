"use client";

import { useState } from "react";

export default function AlchemySchoolLogin() {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/alchemy-school/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error || "Login failed");
      }
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-zinc-800/60 bg-zinc-950/60 backdrop-blur-md p-6 shadow-2xl">
      <div className="text-xs tracking-wider uppercase text-zinc-400">Keizaal</div>
      <h1 className="mt-1 text-2xl font-bold text-zinc-100 font-[family-name:var(--font-cinzel)]">
        Alchemy School
      </h1>
      <p className="mt-2 text-sm text-zinc-400">
        Enter the school password to access the compendium.
      </p>

      <div className="mt-5 flex flex-col gap-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-keizaal-accent"
          autoComplete="current-password"
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
        />
        {error ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
            {error}
          </div>
        ) : null}
        <button
          type="button"
          disabled={submitting || password.trim().length === 0}
          onClick={() => void submit()}
          className="w-full rounded-lg bg-keizaal-accent hover:opacity-90 px-3 py-2 text-sm font-semibold text-black transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? "Checking…" : "Enter"}
        </button>
      </div>
    </div>
  );
}

