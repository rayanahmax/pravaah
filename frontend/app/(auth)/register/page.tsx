"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { resolveLandingPath } from "@/lib/post-auth";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
    setNotice("");
    setLoading(true);

    // Sign up with Supabase Auth only. The profiles row is created by the
    // on_auth_user_created trigger (migration 003) as role TOURIST.
    //
    // No role is sent and no client-side insert is attempted: raw_user_meta_data
    // and any insert from the browser are client-controlled, and AGENTS.md rule 6
    // forbids trusting a client-supplied role. Operator access is granted
    // deliberately by an administrator instead.
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (!authData.user) {
      setError("Registration failed. Please try again.");
      setLoading(false);
      return;
    }

    // Email confirmation disabled -> a session is returned and we can continue.
    if (!authData.session) {
      setNotice(
        "Account created. Check your email to confirm the address, then sign in."
      );
      setLoading(false);
      return;
    }

    router.push(await resolveLandingPath());
    router.refresh();
  }

  return (
    <>
      <h1>Create account</h1>
      <p className="page-header__description">
        Register to access the PRAVAAH platform. New accounts are created as
        tourists; department operator access is granted by an administrator.
      </p>

      <form onSubmit={handleSubmit} className="auth-form">
        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        {notice && (
          <div className="auth-notice" role="status">
            {notice}
          </div>
        )}

        <label className="auth-field">
          <span>Full name</span>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your full name"
            autoComplete="name"
          />
        </label>

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
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            autoComplete="new-password"
          />
        </label>

        <button type="submit" className="primary-button" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="auth-footer">
        Already have an account?{" "}
        <Link href="/login">Sign in</Link>
        {" · "}
        <Link href="/">Start over</Link>
      </p>
    </>
  );
}
