import { getPropertyCode } from "@/lib/property";

const CLOUD_API_KEY = "branchAPI";
const EDGE_API_KEY = "branchEdgeAPI";
const ACTIVE_ROUTE_KEY = "branchApiRoute";
const HYBRID_ENABLED_KEY = "hybridEdgeEnabled";
const RESOLVED_PROPERTY_KEY = "mart-api-property";

export type BranchApi = {
  branchAlias: string;
  branchApiDomain: string;
  edgeApiDomain?: string | null;
  hybridEdgeEnabled?: boolean | null;
  branchFrontendDomain?: string | null;
};

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let text = "";
  bytes.forEach((byte) => {
    text += String.fromCharCode(byte);
  });
  return btoa(text);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function aesKey() {
  const raw = hexToBytes(process.env.NEXT_PUBLIC_AES_SECRET_KEY || "");
  return crypto.subtle.importKey("raw", raw.buffer as ArrayBuffer, "AES-CBC", false, ["encrypt", "decrypt"]);
}

export async function encryptJSON(data: unknown): Promise<string> {
  const iv = hexToBytes(process.env.NEXT_PUBLIC_AES_IV || "");
  const encoded = new TextEncoder().encode(JSON.stringify(data ?? {}));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv: iv.buffer as ArrayBuffer },
    await aesKey(),
    encoded,
  );
  return bytesToBase64(new Uint8Array(encrypted));
}

export async function decryptJSON(payload: string): Promise<Record<string, unknown>> {
  const iv = hexToBytes(process.env.NEXT_PUBLIC_AES_IV || "");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv: iv.buffer as ArrayBuffer },
    await aesKey(),
    base64ToBytes(payload).buffer as ArrayBuffer,
  );
  console.log("decrypted", JSON.parse(new TextDecoder().decode(decrypted)))
  return JSON.parse(new TextDecoder().decode(decrypted));
}

/** Local Electron gets http://1000.localhost:8000/api/. That host is not a tenant domain. */
export function rewriteLocalTenantApiHost(url: string): string {
  const trimmed = (url || "").trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `http://${trimmed}`);
    const host = parsed.hostname.toLowerCase();
    if (host.endsWith(".localhost") && host !== "localhost") {
      parsed.hostname = "localhost";
      return parsed.toString();
    }
  } catch {
    /* keep original */
  }
  return trimmed;
}

export function normalizeApiBase(url: string): string {
  let trimmed = rewriteLocalTenantApiHost((url || "").trim().replace(/^['"]|['"]$/g, ""));
  if (!trimmed) return trimmed;
  trimmed = trimmed.replace(/\/?graphql\/?$/i, "");
  trimmed = trimmed.replace(/\/+$/, "");
  return `${trimmed}/`;
}

export function toGraphqlUrl(apiBase: string): string {
  return `${normalizeApiBase(apiBase)}graphql`;
}

const DIRECTORY_API = normalizeApiBase(
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/",
);

export function persistBranchApi(branch: BranchApi): void {
  if (typeof window === "undefined" || !branch.branchApiDomain) return;
  localStorage.setItem(CLOUD_API_KEY, normalizeApiBase(branch.branchApiDomain));
  if (branch.edgeApiDomain) {
    localStorage.setItem(EDGE_API_KEY, normalizeApiBase(branch.edgeApiDomain));
  } else {
    localStorage.removeItem(EDGE_API_KEY);
  }
  localStorage.setItem(HYBRID_ENABLED_KEY, branch.hybridEdgeEnabled ? "1" : "0");
  localStorage.setItem(ACTIVE_ROUTE_KEY, "cloud");
  localStorage.setItem(RESOLVED_PROPERTY_KEY, branch.branchAlias.toLowerCase());
  if (branch.branchFrontendDomain) {
    localStorage.setItem("branchFrontendDomain", branch.branchFrontendDomain);
  }
}

/** Branch API saved for this property. Empty until getBusinessBranch has stored it. */
export function getStoredApiBase(): string {
  if (typeof window === "undefined") return "";
  const route = localStorage.getItem(ACTIVE_ROUTE_KEY);
  if (route === "edge") {
    const edge = localStorage.getItem(EDGE_API_KEY);
    if (edge) return normalizeApiBase(edge);
  }
  const cloud = localStorage.getItem(CLOUD_API_KEY);
  return cloud ? normalizeApiBase(cloud) : "";
}

/** GraphQL URL for the property. Apollo uses this only after the branch API is stored. */
export function getActiveGraphqlUrl(): string {
  const base = getStoredApiBase();
  if (!base) throw new Error("Property API is not ready.");
  return toGraphqlUrl(base);
}

export function apiReadyFor(propertyCode: string): boolean {
  if (typeof window === "undefined") return false;
  const code = propertyCode.trim().toLowerCase();
  return Boolean(code) && localStorage.getItem(RESOLVED_PROPERTY_KEY) === code && Boolean(localStorage.getItem(CLOUD_API_KEY));
}

const GET_BRANCH = `
  query getBusinessBranch($branchAlias: String!) {
    getBusinessBranch(branchAlias: $branchAlias) {
      status
      msg
      data {
        branchAlias
        branchApiDomain
        hybridEdgeEnabled
        edgeApiDomain
        branchFrontendDomain
      }
    }
  }
`;

/** Look the property up on the directory API, then keep its API address in localStorage. */
export async function resolveBranchApi(propertyCode: string): Promise<BranchApi> {
  const alias = propertyCode.trim().toLowerCase();
  if (!alias) throw new Error("Property code is missing from the address.");
  const response = await fetch(toGraphqlUrl(DIRECTORY_API), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Branch-Alias": alias,
    },
    body: JSON.stringify({
      query: GET_BRANCH,
      variables: await encryptJSON({ branchAlias: alias }),
      operationName: "getBusinessBranch",
    }),
  });
  const raw = await response.json();
  const result = (typeof raw?.data === "string" ? await decryptJSON(raw.data) : raw) as {
    data?: { getBusinessBranch?: { status?: boolean; msg?: string; data?: BranchApi } };
    errors?: { message?: string }[];
  };
  const error = result.errors?.[0]?.message;
  if (error) throw new Error(error);
  const payload = result.data?.getBusinessBranch;
  if (!payload?.status || !payload.data?.branchApiDomain) {
    throw new Error(payload?.msg || "Property code was not found.");
  }
  persistBranchApi(payload.data);
  return payload.data;
}

export function requestHeaders(): Record<string, string> {
  const alias = getPropertyCode();
  return alias ? { "X-Branch-Alias": alias } : {};
}
