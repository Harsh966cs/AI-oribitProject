"use client";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          background: "#101014",
          color: "#f8fafc",
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          minHeight: "100vh",
        }}
      >
        <main
          role="alert"
          style={{
            margin: "0 auto",
            maxWidth: "32rem",
            padding: "15vh 1.5rem",
          }}
        >
          <p style={{ letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Orbit
          </p>
          <h1>Orbit could not start.</h1>
          <p>
            An unexpected application error occurred. Try again, and contact
            support if the problem continues.
          </p>
          <button
            type="button"
            onClick={() => {
              console.error("Orbit global error", error);
              retry();
            }}
            style={{
              background: "#f8fafc",
              border: 0,
              borderRadius: "0.5rem",
              color: "#101014",
              cursor: "pointer",
              padding: "0.7rem 1rem",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
