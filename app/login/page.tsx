"use client";

import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const result = mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
      if (result.error) throw result.error;
      setMessage(mode === "login" ? "Signed in. You can return to your workspace." : "Check your email to confirm your account.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="brand-row"><div className="brand-mark">O</div><span>Orbit</span></div>
        <span className="eyebrow">{mode === "login" ? "WELCOME BACK" : "GET STARTED"}</span>
        <h1>{mode === "login" ? "Sign in to Orbit" : "Create your account"}</h1>
        <p className="auth-copy">Use your Supabase account to access workspace data securely.</p>
        <form onSubmit={submit}>
          <label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error && <p className="form-error">{error}</p>}
          {message && <p className="auth-message">{message}</p>}
          <button className="primary-button auth-submit" disabled={isSubmitting}>{isSubmitting ? "Working…" : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        <button className="auth-switch" onClick={() => setMode((current) => current === "login" ? "signup" : "login")}>{mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}</button>
      </div>
    </main>
  );
}
