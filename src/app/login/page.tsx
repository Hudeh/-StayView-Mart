"use client";

import { gql, useMutation } from "@apollo/client";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { getPropertyCode, propertyPath } from "@/lib/property";
import { setSession } from "@/lib/session";

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

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [login, { loading }] = useMutation(LOGIN);
  const property = getPropertyCode();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await login({
        variables: { authData: { username, password, clientApp: "mart" } },
      });
      const payload = result.data?.loginHotelUser;
      if (!payload?.status || !payload.jwtToken) {
        setError(payload?.msg || "Login failed");
        return;
      }
      setSession(payload.jwtToken, payload.refreshToken || "", payload.hotelUser?.fullName || username);
      router.replace(propertyPath("/till"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <form className="login" onSubmit={onSubmit}>
      <h1>StayView Mart</h1>
      <p>Staff sign-in for the counter. Shoppers do not need an account.</p>
      {property ? <p className="ok">Property {property}</p> : null}
      <label>
        Username
        <input value={username} onChange={(event) => setUsername(event.target.value)} autoFocus />
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      <p className="error">{error}</p>
      <button className="primary full" type="submit" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
