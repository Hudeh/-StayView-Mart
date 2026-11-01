import { ApolloClient, ApolloLink, InMemoryCache, Observable } from "@apollo/client";
import { decryptJSON, encryptJSON, getActiveGraphqlUrl, requestHeaders } from "@/lib/api";
import { getToken } from "@/lib/session";

const httpLink = new ApolloLink((operation) => {
  return new Observable((observer) => {
    (async () => {
      const encrypted = await encryptJSON(operation.variables);
      const token = getToken();
      const response = await fetch(getActiveGraphqlUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `JWT ${token}` } : {}),
          ...requestHeaders(),
        },
        body: JSON.stringify({
          query: operation.query.loc?.source.body,
          variables: encrypted,
          operationName: operation.operationName,
        }),
      });
      const raw = await response.json();
      const result = typeof raw?.data === "string" ? await decryptJSON(raw.data) : raw;
      observer.next(result);
      observer.complete();
    })().catch((error) => observer.error(error));
  });
});

export function createMartClient() {
  return new ApolloClient({
    link: httpLink,
    cache: new InMemoryCache(),
  });
}
