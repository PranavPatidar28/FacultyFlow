"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createAuthClient } from "@neondatabase/auth/next";
import { useState, useSyncExternalStore } from "react";
import { ArrowRight, Layers, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
const auth = createAuthClient();
const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
export function LoginForm({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<
      "login" | "register" | "verify" | "forgot" | "reset"
    >("login"),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [email, setEmail] = useState(""),
    [notice, setNotice] = useState("");
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    clientReady,
    serverReady,
  );
  async function sendCode(address: string) {
    const result = await auth.emailOtp.sendVerificationOtp({
      email: address,
      type: "email-verification",
    });
    if (result.error)
      throw new Error(
        result.error.message || "Unable to send verification code",
      );
    setNotice(
      "A verification code has been sent. Check your inbox and spam folder.",
    );
  }
  async function resendCode() {
    setPending(true);
    setError("");
    setNotice("");
    try {
      await sendCode(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send code");
    } finally {
      setPending(false);
    }
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError("");
    setNotice("");
    const form = new FormData(e.currentTarget);
    try {
      if (mode === "forgot") {
        const result = await auth.forgetPassword.emailOtp({ email });
        if (result.error)
          throw new Error(result.error.message || "Unable to send reset code");
        setMode("reset");
        setNotice(
          "If this email has an account, a reset code has been sent. Check your inbox and spam folder.",
        );
        return;
      }
      if (mode === "reset") {
        const password = String(form.get("password"));
        if (password !== String(form.get("confirmPassword")))
          throw new Error("Passwords must match");
        const result = await auth.emailOtp.resetPassword({
          email,
          otp: String(form.get("otp")),
          password,
        });
        if (result.error)
          throw new Error(result.error.message || "Unable to reset password");
        setMode("login");
        setNotice("Password saved. Sign in with your new password.");
        return;
      }
      const result =
        mode === "register"
          ? await auth.signUp.email({
              name: String(form.get("name")),
              email: String(form.get("email")),
              password: String(form.get("password")),
            })
          : mode === "verify"
            ? await auth.emailOtp.verifyEmail({
                email: String(form.get("email")),
                otp: String(form.get("otp")),
              })
            : await auth.signIn.email({
                email: String(form.get("email")),
                password: String(form.get("password")),
              });
      if (result.error)
        throw new Error(result.error.message || "Authentication failed");
      if (mode === "register") {
        setMode("verify");
        await sendCode(String(form.get("email")));
      } else {
        router.replace("/");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <Layers size={24} />
          </span>
          Faculty<span>Flow</span>
        </div>
        <div>
          <h1>
            Timetables &
            <br />
            <em>class coverage</em>
          </h1>
          <p>Manage schedules, availability, and substitutions.</p>
        </div>
      </div>
      <div className="login-content">
        <div className="login-card">
          <span className="icon-tile">
            <ShieldCheck />
          </span>
          <h2>
            {mode === "register"
              ? "Create an account"
              : mode === "forgot"
                ? "Set or reset your password"
                : mode === "reset"
                  ? "Choose your password"
                  : mode === "verify"
                    ? "Verify your email"
                    : "Welcome back"}
          </h2>
          <p className="muted">
            {mode === "forgot"
              ? "Enter your account email to receive a password reset code."
              : mode === "reset"
                ? "Enter the emailed reset code and choose a new password."
                : mode === "verify"
                  ? "Enter the verification code sent to your email."
                  : "Sign in with your invited college email address."}
          </p>
          <form method="post" onSubmit={submit}>
            {mode === "register" && (
              <label>
                Full name
                <input
                  name="name"
                  required
                  autoComplete="name"
                  disabled={!hydrated || pending}
                />
              </label>
            )}
            <label>
              College email
              <input
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                disabled={!hydrated || pending}
              />
            </label>
            {(mode === "verify" || mode === "reset") && (
              <label>
                Verification code
                <input
                  name="otp"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  disabled={!hydrated || pending}
                />
              </label>
            )}
            {mode !== "verify" && mode !== "forgot" && (
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  disabled={!hydrated || pending}
                  required
                  minLength={8}
                  autoComplete={
                    mode === "register" || mode === "reset"
                      ? "new-password"
                      : "current-password"
                  }
                />
              </label>
            )}
            {mode === "reset" && (
              <label>
                Confirm password
                <input
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  disabled={!hydrated || pending}
                />
              </label>
            )}
            {error && (
              <div role="alert" className="error-box">
                {error}
              </div>
            )}
            {notice && (
              <p role="status" className="tiny muted">
                {notice}
              </p>
            )}
            <Button disabled={pending || !hydrated}>
              {pending
                ? "Please wait…"
                : mode === "register"
                  ? "Create account"
                  : mode === "forgot"
                    ? "Send password reset code"
                    : mode === "reset"
                      ? "Save password"
                      : mode === "verify"
                        ? "Verify email"
                        : "Sign in"}
              <ArrowRight size={16} />
            </Button>
          </form>
          {(mode === "login" || mode === "reset") && (
            <button
              className="text-button"
              disabled={pending || !hydrated}
              onClick={() => {
                setMode("forgot");
                setError("");
                setNotice("");
              }}
            >
              {mode === "reset"
                ? "Request a new reset code"
                : "Set or reset password"}
            </button>
          )}
          {mode === "verify" && (
            <button
              className="text-button"
              disabled={pending || !hydrated || !email}
              onClick={resendCode}
            >
              Send another verification code
            </button>
          )}
          <button
            className="text-button"
            disabled={!hydrated || pending}
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
              setNotice("");
            }}
          >
            {mode === "login"
              ? "Invited for the first time? Create an account"
              : "Already have an account? Sign in"}
          </button>
          {demo && (
            <Link className="demo-link" href="/api/demo" prefetch={false}>
              Explore the synthetic demo <ArrowRight size={14} />
            </Link>
          )}
          <p className="tiny muted">
            Accounts need an invitation from your college administrator.
          </p>
        </div>
      </div>
    </main>
  );
}
