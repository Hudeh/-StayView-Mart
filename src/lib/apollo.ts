import { ApolloClient, ApolloLink, InMemoryCache, Observable, type FetchResult } from "@apollo/client";
import { decryptJSON, encryptJSON, getActiveGraphqlUrl, requestHeaders } from "@/lib/api";
import {
  cashierName,
  endSession,
  getRefreshToken,
  getToken,
  isAccessTokenExpired,
  isSupersededSessionMessage,
  isUnauthenticatedMessage,
  SESSION_ENDED_MESSAGE,
  setSession,
} from "@/lib/session";

const PUBLIC_OPERATIONS = new Set([
  "loginHotelUser",
  "ForgotPassword",
  "ResetPassword",
  "getBusinessBranch",
  "refreshUserToken",
]);

const REFRESH = `
  mutation refreshUserToken($refreshToken: String!) {
    refreshUserToken(refreshToken: $refreshToken) {
      token
      refreshToken
    }
  }
`;

type GraphResult = {
  errors?: { message?: string }[] | null;
  data?: { errors?: { message?: string }[] | null } | null;
};

function errorMessages(result: unknown): string[] {
  if (!result || typeof result !== "object") return [];
  const body = result as GraphResult;
  return [...(body.errors || []), ...(body.data?.errors || [])]
    .map((error) => error?.message || "")
    .filter(Boolean);
}

function sessionEnded(result: unknown): boolean {
  return errorMessages(result).some((message) => isUnauthenticatedMessage(message));
}

function sessionSuperseded(result: unknown): boolean {
  return errorMessages(result).some((message) => isSupersededSessionMessage(message));
}

async function postGraphQL(operationName: string | undefined, query: string | undefined, variables: unknown, token: string) {
  const encrypted = await encryptJSON(variables);
  const response = await fetch(getActiveGraphqlUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `JWT ${token}` } : {}),
      ...requestHeaders(),
    },
    body: JSON.stringify({
      query,
      variables: encrypted,
      operationName,
    }),
  });
  const raw = await response.json();
  return (typeof raw?.data === "string" ? await decryptJSON(raw.data) : raw) as GraphResult;
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  const result = await postGraphQL("refreshUserToken", REFRESH, { refreshToken }, "");
  if (sessionEnded(result) || sessionSuperseded(result)) return false;
  const root = (result.data ?? result) as {
    refreshUserToken?: { token?: string; refreshToken?: string };
    data?: { refreshUserToken?: { token?: string; refreshToken?: string } };
  };
  const payload = root.refreshUserToken ?? root.data?.refreshUserToken;
  if (!payload?.token) return false;
  setSession(payload.token, payload.refreshToken || refreshToken, cashierName());
  return true;
}

const httpLink = new ApolloLink((operation) => {
  return new Observable((observer) => {
    (async () => {
      const name = operation.operationName;
      const query = operation.query.loc?.source.body;
      const isPublic = PUBLIC_OPERATIONS.has(name || "");
      let token = getToken();

      if (!isPublic && token && isAccessTokenExpired(token)) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          endSession(SESSION_ENDED_MESSAGE);
          throw new Error(SESSION_ENDED_MESSAGE);
        }
        token = getToken();
      }

      let result = await postGraphQL(name, query, operation.variables, token);
      if (!isPublic && sessionSuperseded(result)) {
        endSession("Your session ended because this account signed in on another device.");
        throw new Error("Session ended: signed in on another device");
      }
      if (!isPublic && sessionEnded(result)) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          endSession(SESSION_ENDED_MESSAGE);
          throw new Error(SESSION_ENDED_MESSAGE);
        }
        result = await postGraphQL(name, query, operation.variables, getToken());
        if (sessionEnded(result) || sessionSuperseded(result)) {
          endSession(SESSION_ENDED_MESSAGE);
          throw new Error(SESSION_ENDED_MESSAGE);
        }
      }
      observer.next(result as FetchResult);
      observer.complete();
    })().catch((error) => observer.error(error));
  });
});

export function createMartClient() {
  return new ApolloClient({
    link: httpLink,
    cache: new InMemoryCache(),
    defaultOptions: {
      watchQuery: { errorPolicy: "all" },
      query: { errorPolicy: "all" },
      mutate: { errorPolicy: "all" },
    },
  });
}
