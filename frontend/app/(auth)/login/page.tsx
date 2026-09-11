"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { resolveLandingPath } from "@/lib/post-auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Redirect if already authenticated, to whichever surface the role owns.
  useEffect(() => {
    async function redirectIfSignedIn() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) router.replace(await resolveLandingPath());
    }
    void redirectIfSignedIn();
  }, [supabase, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // The role decides the destination: operators get the console, visitors get
    // their own home. Server-side guards are unchanged by this choice.
    router.push(await resolveLandingPath());
    router.refresh();
  }

  return (
    <>
      <h1>Sign in</h1>
      <p className="page-header__description">
        Sign in to request and track permits as a visitor, or to open the department operations
        console. You are taken to the surface your account belongs to.
      </p>

      <form onSubmit={handleSubmit} className="auth-form">
        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        <label className="auth-field">
          <span>Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </label>

        <label className="auth-field">
          <span>Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            autoComplete="current-password"
          />
        </label>

        <button type="submit" className="primary-button" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="auth-footer">
        Don&apos;t have an account?{" "}
        <Link href="/register">Create one</Link>
        {" · "}
        <Link href="/">Start over</Link>
      </p>
    </>
  );
}
