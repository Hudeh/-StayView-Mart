export type ReceiptBranch = {
  businessName?: string | null;
  branchAlias?: string | null;
  branchAddress?: string | null;
  branchCity?: string | null;
  branchState?: string | null;
  branchCountry?: string | null;
  branchPhone?: string | null;
  branchPhoneMobile?: string | null;
  branchEmail?: string | null;
  branchWebsiteUrl?: string | null;
};

export type ReceiptSale = {
  receiptNumber: string;
  subtotal?: string | null;
  discountAmount?: string | null;
  taxAmount?: string | null;
  total: string;
  changeAmount?: string | null;
  lines?: { name: string; quantity: string; lineTotal?: string | null }[] | null;
  payments?: { method: string; amount: string; bankName?: string | null }[] | null;
};

const RULE = "---------------------------------------";
const WIDTH = 39;

function money(value: number) {
  const amount = Number.isFinite(value) ? value : 0;
  const whole = Number.isInteger(amount);
  return new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function amount(value?: string | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function centerLine(text: string) {
  const clean = text.trim();
  if (!clean) return "";
  if (clean.length >= WIDTH) return clean;
  const padLeft = Math.floor((WIDTH - clean.length) / 2);
  return `${" ".repeat(Math.max(0, padLeft))}${clean}`;
}

function wrapCentered(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [] as string[];
  const words = clean.split(" ");
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > WIDTH && current) {
      lines.push(centerLine(current));
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(centerLine(current));
  return lines;
}

function fieldText(row: Record<string, unknown>, camel: string, snake: string) {
  const value = row[camel] ?? row[snake];
  if (value == null) return "";
  return String(value).trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function pushDetail(lines: string[], label: string, value?: string | null) {
  const text = (value || "").trim();
  if (!text) return;
  lines.push(...wrapCentered(`${label}: ${text}`));
}

function header(details: ReceiptBranch | null | undefined) {
  if (!details) return "";
  const lines: string[] = [];
  const title = details.businessName?.trim() || details.branchAlias?.trim();
  if (title) lines.push(...wrapCentered(title.toUpperCase()));
  if (details.branchAlias?.trim()) lines.push(centerLine(`Branch Code: ${details.branchAlias.trim()}`));
  pushDetail(lines, "Address", details.branchAddress);
  pushDetail(lines, "City", details.branchCity);
  pushDetail(lines, "State", details.branchState);
  pushDetail(lines, "Country", details.branchCountry);
  pushDetail(lines, "Phone", details.branchPhone);
  pushDetail(lines, "Mobile", details.branchPhoneMobile);
  pushDetail(lines, "Email", details.branchEmail);
  pushDetail(lines, "Website", details.branchWebsiteUrl);
  if (!lines.length) return "";
  return `${lines.join("\n")}\n${RULE}\n`;
}

function itemLine(name: string, price: string) {
  const gap = 34 - name.length - price.length;
  return name + " ".repeat(Math.max(1, gap)) + price;
}

function methodLabel(method: string, bankName?: string | null) {
  const clean = method.trim().toLowerCase();
  if (clean === "transfer" || clean === "bank_transfer") {
    const bank = (bankName || "").trim();
    return bank ? `TRANSFER ${bank}` : "TRANSFER";
  }
  if (clean === "card") return "CARD";
  if (clean === "cash") return "CASH";
  return clean.toUpperCase().replace(/_/g, " ");
}

export function receiptBranch(data: unknown): ReceiptBranch | null {
  let current = asRecord(data);
  if (current && asRecord(current.data) && !("getBusinessBranch" in current) && !("branchAddresses" in current)) {
    current = asRecord(current.data);
  }
  if (!current) return null;
  const raw = current.branchAddresses ?? current.branch_addresses;
  const addressRow = Array.isArray(raw)
    ? raw.find((row) => Boolean(asRecord(row)?.isPrimary ?? asRecord(row)?.is_primary)) || raw[0]
    : raw;
  const address = asRecord(addressRow);
  const branchPayload = asRecord(current.getBusinessBranch);
  const branchData = branchPayload?.status === false ? null : asRecord(branchPayload?.data);
  const business = asRecord(branchData?.business);
  const company = business || {};
  const place = address || {};
  const merged: ReceiptBranch = {
    businessName: fieldText(company, "businessName", "business_name"),
    branchAlias: fieldText(branchData || {}, "branchAlias", "branch_alias") || fieldText(place, "branchAlias", "branch_alias"),
    branchAddress: fieldText(place, "branchAddress", "branch_address") || fieldText(company, "businessAddress", "business_address"),
    branchCity:
      fieldText(place, "branchCity", "branch_city") ||
      fieldText(company, "businessCity", "business_city") ||
      fieldText(company, "city", "city"),
    branchState: fieldText(place, "branchState", "branch_state") || fieldText(company, "businessState", "business_state"),
    branchCountry:
      fieldText(place, "branchCountry", "branch_country") ||
      fieldText(company, "businessCountry", "business_country") ||
      fieldText(company, "country", "country"),
    branchPhone: fieldText(place, "branchPhone", "branch_phone") || fieldText(company, "businessPhone", "business_phone"),
    branchPhoneMobile:
      fieldText(place, "branchPhoneMobile", "branch_phone_mobile") ||
      fieldText(company, "businessPhoneMobile", "business_phone_mobile"),
    branchEmail: fieldText(place, "branchEmail", "branch_email") || fieldText(company, "businessEmail", "business_email"),
    branchWebsiteUrl:
      fieldText(place, "branchWebsiteUrl", "branch_website_url") ||
      fieldText(company, "businessWebsiteUrl", "business_website_url"),
  };
  if (!merged.businessName && !merged.branchAddress && !merged.branchAlias && !merged.branchPhone && !merged.branchEmail) {
    return null;
  }
  return merged;
}

export function receiptSettings(data: unknown): { footer: string; maxPrints: number } {
  const root = (data && typeof data === "object" && "data" in data
    ? (data as { data?: unknown }).data
    : data) as { martReceiptSettings?: { footer?: string | null; maxPrints?: number | null } } | null;
  const row = root?.martReceiptSettings;
  const max = Number(row?.maxPrints);
  return {
    footer: row?.footer ?? "Thank you for your order!\nPlease come again.",
    maxPrints: Number.isFinite(max) && max >= 1 ? Math.min(20, Math.floor(max)) : 1,
  };
}

export function buildMartReceipt(
  sale: ReceiptSale,
  cashier: string,
  branch: ReceiptBranch | null,
  footer?: string | null,
) {
  const lines = (sale.lines || [])
    .map((line) => {
      const qty = Number(line.quantity);
      const qtyText = Number.isFinite(qty) && qty % 1 === 0 ? String(qty) : String(line.quantity);
      return itemLine(`${qtyText}x ${line.name || "-"}`, money(amount(line.lineTotal)));
    })
    .join("\n");
  const subtotal = amount(sale.subtotal);
  const tax = amount(sale.taxAmount);
  const discount = amount(sale.discountAmount);
  const total = amount(sale.total);
  const change = amount(sale.changeAmount);
  const payments = sale.payments || [];
  const tendered = payments.reduce((sum, pay) => sum + amount(pay.amount), 0);
  const paymentText = payments.length
    ? payments.map((pay) => methodLabel(pay.method, pay.bankName)).join(", ")
    : "CASH";

  return `${header(branch)}SALES RECEIPT

Sales #: ${sale.receiptNumber || "-"}
Type: COUNTER
Time: ${new Date().toLocaleString()}
Cashier: ${cashier || "-"}

${RULE}
ITEMS
${RULE}
${lines || "-"}

${RULE}
TOTALS
${RULE}
Subtotal:        ${money(subtotal).padStart(15)}
Tax:             ${money(tax).padStart(15)}
${discount > 0 ? `Discount:        -${money(discount).padStart(14)}\n` : ""}${RULE}
TOTAL:           ${money(total).padStart(15)}
${RULE}

Payment Method: ${paymentText}
${tendered > 0 ? `Tendered:        ${money(tendered).padStart(15)}\n` : ""}${change > 0 ? `Change:          ${money(change).padStart(15)}\n` : ""}${footerText(footer)}`;
}

function footerText(footer?: string | null) {
  const text = (footer ?? "Thank you for your order!\nPlease come again.").trim();
  if (!text) return "\n";
  return `\n${text}\n`;
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function printMartReceipt(plainText: string): Promise<boolean> {
  const endpoint = loadPrinter();
  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  try {
    if (endpoint.connection === "network" && endpoint.host && api?.printRawNetwork) {
      await api.printRawNetwork(endpoint.host, endpoint.port || 9100, plainText);
      return true;
    }
    if (api?.printReceiptSilent) {
      const deviceName = endpoint.connection === "os" ? endpoint.deviceName || null : null;
      await api.printReceiptSilent(plainText, deviceName);
      return true;
    }
  } catch (error) {
    console.error("Receipt print failed", error);
  }

  const printWindow = window.open("", "", "width=400,height=600");
  if (!printWindow) return false;
  printWindow.document.write(`<!DOCTYPE html><html><head><title>POS Receipt</title><style>
    body { font-family: 'Courier New', monospace; margin: 0; padding: 10px; width: 80mm; max-width: 100%; background: white; color: black; }
    pre { margin: 0; font-size: 12px; line-height: 1.4; white-space: pre-wrap; word-wrap: break-word; }
    @media print { body { width: 80mm; margin: 0; padding: 0; } @page { size: 80mm auto; margin: 0; } }
  </style></head><body><pre>${escapeHtml(plainText)}</pre>
  <script>window.print(); window.onafterprint = function() { window.close(); };</script></body></html>`);
  printWindow.document.close();
  return true;
}

export type MartPrinterConfig = {
  connection: "browser" | "os" | "network";
  deviceName: string;
  host: string;
  port: number;
};

const PRINTER_KEY = "mart-printer-config";

export function loadPrinter(): MartPrinterConfig {
  if (typeof window === "undefined") {
    return { connection: "browser", deviceName: "", host: "", port: 9100 };
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(PRINTER_KEY) || "") as Partial<MartPrinterConfig>;
    const connection = parsed.connection === "os" || parsed.connection === "network" ? parsed.connection : "browser";
    return {
      connection,
      deviceName: parsed.deviceName || "",
      host: parsed.host || "",
      port: Number(parsed.port) > 0 ? Number(parsed.port) : 9100,
    };
  } catch {
    return { connection: "browser", deviceName: "", host: "", port: 9100 };
  }
}

export function savePrinter(config: MartPrinterConfig) {
  localStorage.setItem(PRINTER_KEY, JSON.stringify(config));
}
