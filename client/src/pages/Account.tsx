import { useState, type FormEvent } from "react";
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { trpc } from "@/lib/trpc";

export default function Account() {
  const utils = trpc.useUtils();
  const { data: user } = trpc.auth.me.useQuery();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const update = trpc.auth.changePassword.useMutation({
    onSuccess: async () => {
      setCurrentPassword("");
      setNewPassword("");
      setError("");
      setMessage(
        "Password changed. Other signed-in sessions have been closed."
      );
      await utils.auth.me.invalidate();
    },
    onError: mutationError => {
      setMessage("");
      setError(mutationError.message);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    update.mutate({ currentPassword, newPassword });
  }

  return (
    <div className="app-shell">
      <AppHeader active="account" />
      <main className="account-page">
        <div className="account-heading">
          <span className="eyebrow">YOUR REIMAGINE ACCOUNT</span>
          <h1>Account settings</h1>
          <p>Manage the email and password used for your photo library.</p>
        </div>
        <section className="settings-card" aria-labelledby="identity-heading">
          <div className="settings-card-title">
            <span className="settings-icon">
              <ShieldCheck size={18} />
            </span>
            <div>
              <h2 id="identity-heading">Your sign-in</h2>
              <p>One account, one private photo history.</p>
            </div>
          </div>
          <dl className="account-detail-list">
            <div>
              <dt>Email address</dt>
              <dd>{user?.email ?? "Signed-in account"}</dd>
            </div>
            <div>
              <dt>Account type</dt>
              <dd>Email and password</dd>
            </div>
          </dl>
        </section>
        <section className="settings-card" aria-labelledby="password-heading">
          <div className="settings-card-title">
            <span className="settings-icon">
              <KeyRound size={18} />
            </span>
            <div>
              <h2 id="password-heading">Change password</h2>
              <p>Use your current password to confirm this change.</p>
            </div>
          </div>
          <form className="settings-form" onSubmit={submit}>
            <label htmlFor="current-password">Current password</label>
            <div className="settings-password-wrap">
              <input
                id="current-password"
                type={showCurrentPassword ? "text" : "password"}
                autoComplete="current-password"
                value={currentPassword}
                onChange={event =>
                  setCurrentPassword(event.currentTarget.value)
                }
                required
                maxLength={128}
              />
              <button
                type="button"
                className="password-visibility-toggle"
                aria-label={
                  showCurrentPassword
                    ? "Hide current password"
                    : "Show current password"
                }
                aria-pressed={showCurrentPassword}
                aria-controls="current-password"
                onClick={() => setShowCurrentPassword(value => !value)}
              >
                {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <label htmlFor="new-password">New password</label>
            <div className="settings-password-wrap">
              <input
                id="new-password"
                type={showNewPassword ? "text" : "password"}
                autoComplete="new-password"
                value={newPassword}
                onChange={event => setNewPassword(event.currentTarget.value)}
                required
                minLength={12}
                maxLength={128}
              />
              <button
                type="button"
                className="password-visibility-toggle"
                aria-label={
                  showNewPassword ? "Hide new password" : "Show new password"
                }
                aria-pressed={showNewPassword}
                aria-controls="new-password"
                onClick={() => setShowNewPassword(value => !value)}
              >
                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <span className="field-hint">Use at least 12 characters.</span>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="form-success" role="status">
                <Check size={15} />
                {message}
              </p>
            )}
            <button
              className="auth-submit settings-submit"
              type="submit"
              disabled={update.isPending}
            >
              {update.isPending ? (
                <LoaderCircle size={16} className="spin" />
              ) : null}
              Update password
            </button>
          </form>
        </section>
      </main>
      <footer className="page-footer account-footer">
        <span className="footer-brand">Reimagine</span>
        <span>Old photos, seen with new eyes.</span>
        <a href="/library" className="back-top">
          Your history
        </a>
      </footer>
    </div>
  );
}
