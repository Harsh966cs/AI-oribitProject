"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Orbit route error", error);
  }, [error]);

  return (
    <main className="auth-page" role="alert">
      <div className="auth-card">
        <div className="brand-row">
          <div className="brand-mark">O</div>
          <span>Orbit</span>
        </div>
        <span className="eyebrow">WORKSPACE ERROR</span>
        <h1>Orbit could not load this view.</h1>
        <p className="auth-copy">
          Your data was not discarded. Try loading the view again, and check your
          connection if the problem continues.
        </p>
        <button className="primary-button auth-submit" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </main>
  );
}
