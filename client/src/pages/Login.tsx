import { useEffect, useState, type FormEvent } from "react";
import {
  Aperture,
  ArrowRight,
  LoaderCircle,
  Mail,
  LockKeyhole,
} from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export default function Login() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const account = trpc.auth.me.useQuery();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (account.data) setLocation("/");
  }, [account.data, setLocation]);

  const finish = async () => {
    await utils.auth.me.invalidate();
    await utils.library.list.invalidate();
    const next = new URLSearchParams(window.location.search).get("next");
    setLocation(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
  };
  const login = trpc.auth.login.useMutation({
    onSuccess: finish,
    onError: mutationError => setError(mutationError.message),
  });
  const register = trpc.auth.register.useMutation({
    onSuccess: finish,
    onError: mutationError => setError(mutationError.message),
  });
  const busy = login.isPending || register.isPending;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (mode === "signup") register.mutate({ email, password });
    else login.mutate({ email, password });
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-heading">
        <a className="brand auth-brand" href="/" aria-label="Reimagine">
          <span className="brand-symbol" aria-hidden="true">
            <Aperture size={24} strokeWidth={1.7} />
            <i />
          </span>
          <span className="brand-name">
            re<span>imagine</span>
          </span>
        </a>
        <div className="auth-kicker">YOUR PRIVATE PHOTO STUDIO</div>
        <h1 id="auth-heading">
          {mode === "signin" ? "Welcome back." : "Make room for color."}
        </h1>
        <p className="auth-subtitle">
          {mode === "signin"
            ? "Sign in to restore a photo or continue your library."
            : "Create an account to save your photos and colorized results."}
        </p>

        <div className="auth-tabs" role="tablist" aria-label="Account action">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            className={mode === "signin" ? "selected" : ""}
            onClick={() => {
              setMode("signin");
              setError("");
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            className={mode === "signup" ? "selected" : ""}
            onClick={() => {
              setMode("signup");
              setError("");
            }}
          >
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="account-email">Email address</label>
          <div className="auth-input-wrap">
            <Mail size={16} aria-hidden="true" />
            <input
              id="account-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={event => setEmail(event.currentTarget.value)}
              required
              maxLength={320}
            />
          </div>
          <label htmlFor="account-password">Password</label>
          <div className="auth-input-wrap">
            <LockKeyhole size={16} aria-hidden="true" />
            <input
              id="account-password"
              type="password"
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              placeholder={
                mode === "signup" ? "At least 12 characters" : "Your password"
              }
              value={password}
              onChange={event => setPassword(event.currentTarget.value)}
              required
              minLength={mode === "signup" ? 12 : 1}
              maxLength={128}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="auth-submit"
            type="submit"
            disabled={busy || account.isLoading}
          >
            {busy ? <LoaderCircle size={17} className="spin" /> : null}
            {mode === "signin" ? "Sign in to Reimagine" : "Create my account"}
            {!busy && <ArrowRight size={16} />}
          </button>
        </form>
        <p className="auth-footnote">
          Password recovery email isn’t enabled. You can change your password
          from Account while signed in.
        </p>
        <p className="auth-caption">A little color, a lot of history.</p>
      </section>
    </main>
  );
}
