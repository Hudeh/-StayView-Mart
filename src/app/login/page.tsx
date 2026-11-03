"use client";

import { gql, useMutation } from "@apollo/client";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { NightToggle } from "@/components/NightToggle";
import { StayViewMartMark } from "@/components/StayViewMark";
import { getPropertyCode, propertyPath } from "@/lib/property";
import { consumeSessionMessage, setSession } from "@/lib/session";


const LOGIN = gql`
  mutation loginHotelUser($authData: LoginInput!) {
    loginHotelUser(authData: $authData) {
      status
      msg
      jwtToken
      refreshToken
      hotelUser {
        fullName
        designation
      }
    }
  }
`;

const FORGOT = gql`
  mutation ForgotPassword($input: ForgotPasswordInput!) {
    forgotPassword(input: $input) {
      success
      message
    }
  }
`;

const RESET = gql`
  mutation ResetPassword($input: ResetPasswordInput!) {
    resetPassword(input: $input) {
      success
      message
    }
  }
`;

type Mode = "login" | "forgot" | "reset";

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      {open ? (
        <path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
      ) : (
        <path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" />
      )}
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const property = getPropertyCode();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [forgotUsername, setForgotUsername] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [branchAlias, setBranchAlias] = useState(property);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [login, { loading }] = useMutation(LOGIN);
  const [forgotPassword, { loading: forgotLoading }] = useMutation(FORGOT);
  const [resetPassword, { loading: resetLoading }] = useMutation(RESET);

  useEffect(() => {
    const message = consumeSessionMessage();
    if (message) setError(message);
  }, []);

  function clearMessages() {
    setError("");
    setInfo("");
  }

  async function onLogin(event: FormEvent) {
    event.preventDefault();
    clearMessages();
    try {
      const result = await login({
        variables: { authData: { username, password, clientApp: "mart" } },
      });
      const payload = result.data?.loginHotelUser ?? result.data?.data?.loginHotelUser;
      if (!payload?.status || !payload.jwtToken) {
        setError(payload?.msg || "invalid username or password!");
        return;
      }
      setSession(payload.jwtToken, payload.refreshToken || "", payload.hotelUser?.fullName || username);
      router.replace(propertyPath("/till"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  async function onForgot(event: FormEvent) {
    event.preventDefault();
    clearMessages();
    if (!forgotUsername.trim() || !forgotEmail.trim() || !branchAlias.trim()) {
      setError("Username, email, and branch alias are required.");
      return;
    }
    try {
      const result = await forgotPassword({
        variables: {
          input: {
            username: forgotUsername.trim(),
            email: forgotEmail.trim(),
            branchAlias: branchAlias.trim(),
          },
        },
      });
      const payload = result.data?.forgotPassword ?? result.data?.data?.forgotPassword;
      setInfo(payload?.message || "If an account matches those details, a 6-digit reset code has been sent.");
      setMode("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send reset email.");
    }
  }

  async function onReset(event: FormEvent) {
    event.preventDefault();
    clearMessages();
    const code = otp.replace(/\D/g, "");
    if (!forgotUsername.trim() || !forgotEmail.trim() || !branchAlias.trim()) {
      setError("Username, email, and branch alias are required.");
      return;
    }
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    try {
      const result = await resetPassword({
        variables: {
          input: {
            otp: code,
            username: forgotUsername.trim(),
            email: forgotEmail.trim(),
            branchAlias: branchAlias.trim(),
            newPassword,
          },
        },
      });
      const payload = result.data?.resetPassword ?? result.data?.data?.resetPassword;
      if (!payload?.success) {
        setError(payload?.message || "Unable to reset password.");
        return;
      }
      setInfo("");
      setMode("login");
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setError("");
      setInfo(payload.message || "Password updated. Sign in now.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset password.");
    }
  }

  return (
    <div className="login-screen">
      <NightToggle className="night-float" />
      <div className="login-card">
        <StayViewMartMark />
        {mode === "login" ? (
          <form className="login-form" onSubmit={onLogin}>
            <label className="field">
              <span>Username</span>
              <input placeholder=" " value={username} onChange={(event) => setUsername(event.target.value)} autoFocus required />
            </label>
            <label className="field password">
              <span>Password</span>
              <input
                placeholder=" "
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                className="eye"
                type="button"
                aria-label="toggle password visibility"
                onClick={() => setShowPassword((open) => !open)}
              >
                <EyeIcon open={showPassword} />
              </button>
            </label>
            <button
              className="linkish"
              type="button"
              onClick={() => {
                clearMessages();
                setBranchAlias(property);
                setMode("forgot");
              }}
            >
              Forgot password?
            </button>
            {error ? <p className="login-alert error">{error}</p> : null}
            {info ? <p className="login-alert ok">{info}</p> : null}
            <button className="submit" type="submit" disabled={loading}>
              {loading ? "Login" : "Login"}
            </button>
           <span className="powered-by">Powered By StayView</span>
          </form>
        ) : null}
        {mode === "forgot" ? (
          <form className="login-form" onSubmit={onForgot}>
            <h2>Forgot password</h2>
            <p className="login-copy">
              Enter your username, registered email, and branch alias. We will send a 6-digit verification code if the details match.
            </p>
            <label className="field">
              <span>Username</span>
              <input placeholder=" " value={forgotUsername} onChange={(event) => setForgotUsername(event.target.value)} required />
            </label>
            <label className="field">
              <span>Email</span>
              <input placeholder=" " type="email" value={forgotEmail} onChange={(event) => setForgotEmail(event.target.value)} required />
            </label>
            <label className="field">
              <span>Branch alias</span>
              <input placeholder=" " value={branchAlias} onChange={(event) => setBranchAlias(event.target.value)} required />
            </label>
            {error ? <p className="login-alert error">{error}</p> : null}
            {info ? <p className="login-alert ok">{info}</p> : null}
            <button className="submit" type="submit" disabled={forgotLoading}>
              Send reset email
            </button>
            <button className="text-btn" type="button" onClick={() => { clearMessages(); setMode("login"); }}>
              Back to login
            </button>
            <button className="linkish center" type="button" onClick={() => { clearMessages(); setMode("reset"); }}>
              Already have a code?
            </button>
          </form>
        ) : null}
        {mode === "reset" ? (
          <form className="login-form" onSubmit={onReset}>
            <h2>Reset password</h2>
            <p className="login-copy">Enter the 6-digit code from your email and choose a new password.</p>
            <label className="field">
              <span>Username</span>
              <input placeholder=" " value={forgotUsername} onChange={(event) => setForgotUsername(event.target.value)} required />
            </label>
            <label className="field">
              <span>Email</span>
              <input placeholder=" " type="email" value={forgotEmail} onChange={(event) => setForgotEmail(event.target.value)} required />
            </label>
            <label className="field">
              <span>Branch alias</span>
              <input placeholder=" " value={branchAlias} onChange={(event) => setBranchAlias(event.target.value)} required />
            </label>
            <label className="field">
              <span>6-digit code</span>
              <input
                placeholder=" "
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                required
              />
            </label>
            <label className="field password">
              <span>New password</span>
              <input
                placeholder=" "
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
              <button className="eye" type="button" aria-label="toggle password visibility" onClick={() => setShowNewPassword((open) => !open)}>
                <EyeIcon open={showNewPassword} />
              </button>
            </label>
            <label className="field">
              <span>Confirm password</span>
              <input
                placeholder=" "
                type={showNewPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </label>
            {error ? <p className="login-alert error">{error}</p> : null}
            <button className="submit" type="submit" disabled={resetLoading}>
              Update password
            </button>
            <button className="text-btn" type="button" onClick={() => { clearMessages(); setMode("login"); }}>
              Back to login
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
