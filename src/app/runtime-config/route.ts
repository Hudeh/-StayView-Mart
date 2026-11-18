import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Read at container start. These names are not baked into the browser bundle. */
export function GET() {
  const env = process.env;
  const apiBaseUrl = (env["MART_API_BASE_URL"] || "").trim();
  return NextResponse.json({
    apiBaseUrl,
    aesSecretKey: (env["MART_AES_SECRET_KEY"] || "").trim(),
    aesIv: (env["MART_AES_IV"] || "").trim(),
    pinApi: Boolean(apiBaseUrl),
  });
}
