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
  payments?: { method: string; amount: string }[] | null;
};

const RULE = "───────────────────────────────────────";
const WIDTH = 39;

function money(value: number) {
  return new Intl.NumberFormat().format(Number.isFinite(value) ? value : 0);
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

function header(details: ReceiptBranch | null | undefined) {
  if (!details) return "";
  const lines: string[] = [];
  const title = details.businessName?.trim() || details.branchAlias?.trim();
  if (title) lines.push(centerLine(title.toUpperCase()));
  if (details.branchAlias?.trim()) lines.push(centerLine(`Branch Code: ${details.branchAlias.trim()}`));
  const street = details.branchAddress?.trim();
  const cityLine = [details.branchCity, details.branchState].filter(Boolean).join(", ").trim();
  const country = details.branchCountry?.trim();
  const compact = [street, cityLine, country].filter(Boolean).join(", ");
  if (compact) lines.push(centerLine(`Address: ${compact}`));
  const phones = [details.branchPhone, details.branchPhoneMobile].filter(Boolean);
  if (phones.length) lines.push(centerLine(`Tel: ${phones.join(" | ")}`));
  if (details.branchEmail?.trim()) lines.push(centerLine(`Email: ${details.branchEmail.trim()}`));
  if (details.branchWebsiteUrl?.trim()) lines.push(centerLine(`Web: ${details.branchWebsiteUrl.trim()}`));
  if (!lines.length) return "";
  return `${lines.join("\n")}\n${RULE}\n`;
}

function itemLine(name: string, price: string) {
  const gap = 34 - name.length - price.length;
  return name + " ".repeat(Math.max(1, gap)) + price;
}

function methodLabel(method: string) {
  const clean = method.trim().toLowerCase();
  if (clean === "transfer" || clean === "bank_transfer") return "TRANSFER";
  if (clean === "card") return "CARD";
  if (clean === "cash") return "CASH";
  return clean.toUpperCase().replace(/_/g, " ");
}

export function receiptBranch(data: unknown): ReceiptBranch | null {
  const root = (data && typeof data === "object" && "data" in data
    ? (data as { data?: unknown }).data
    : data) as {
    branchAddresses?: ReceiptBranch | ReceiptBranch[];
    getBusinessBranch?: { status?: boolean; data?: { branchAlias?: string; business?: { businessName?: string } } };
  } | null;
  if (!root) return null;
  const raw = root.branchAddresses;
  const address = Array.isArray(raw) ? raw.find((row) => (row as { isPrimary?: boolean }).isPrimary) || raw[0] : raw;
  const business = root.getBusinessBranch?.status ? root.getBusinessBranch.data : undefined;
  const merged: ReceiptBranch = {
    ...(address || {}),
    businessName: business?.business?.businessName,
    branchAlias: business?.branchAlias || address?.branchAlias,
  };
  if (!merged.businessName && !merged.branchAddress && !merged.branchAlias && !merged.branchPhone) return null;
  return merged;
}

export function buildMartReceipt(
  sale: ReceiptSale,
  cashier: string,
  branch: ReceiptBranch | null,
) {
  const lines = (sale.lines || [])
    .map((line) => {
      const qty = Number(line.quantity);
      const qtyText = Number.isFinite(qty) && qty % 1 === 0 ? String(qty) : String(line.quantity);
      return itemLine(`${qtyText}x ${line.name || "—"}`, money(amount(line.lineTotal)));
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
    ? payments.map((pay) => methodLabel(pay.method)).join(", ")
    : "CASH";

  return `${header(branch)}ORDER RECEIPT

Order #: ${sale.receiptNumber || "—"}
Type: COUNTER
Time: ${new Date().toLocaleString()}
Cashier: ${cashier || "—"}

${RULE}
ITEMS
${RULE}
${lines || "—"}

${RULE}
TOTALS
${RULE}
Subtotal:        ${money(subtotal).padStart(15)}
Tax:             ${money(tax).padStart(15)}
${discount > 0 ? `Discount:        -${money(discount).padStart(14)}\n` : ""}${RULE}
TOTAL:           ${money(total).padStart(15)}
${RULE}

Payment Method: ${paymentText}
${tendered > 0 ? `Tendered:        ${money(tendered).padStart(15)}\n` : ""}${change > 0 ? `Change:          ${money(change).padStart(15)}\n` : ""}

Thank you for your order!
Please come again.
`;
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function printMartReceipt(plainText: string) {
  const endpoint = loadPrinter();
  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  try {
    if (endpoint.connection === "network" && endpoint.host && api?.printRawNetwork) {
      await api.printRawNetwork(endpoint.host, endpoint.port || 9100, plainText);
      return;
    }
    if (endpoint.connection !== "browser" && api?.printReceiptSilent) {
      await api.printReceiptSilent(plainText, endpoint.deviceName || null);
      return;
    }
  } catch (error) {
    console.error("Receipt print failed", error);
  }

  const printWindow = window.open("", "", "width=400,height=600");
  if (!printWindow) return;
  printWindow.document.write(`<!DOCTYPE html><html><head><title>POS Receipt</title><style>
    body { font-family: 'Courier New', monospace; margin: 0; padding: 10px; width: 80mm; max-width: 100%; background: white; color: black; }
    pre { margin: 0; font-size: 12px; line-height: 1.4; white-space: pre-wrap; word-wrap: break-word; }
    @media print { body { width: 80mm; margin: 0; padding: 0; } @page { size: 80mm auto; margin: 0; } }
  </style></head><body><pre>${escapeHtml(plainText)}</pre>
  <script>window.print(); window.onafterprint = function() { window.close(); };</script></body></html>`);
  printWindow.document.close();
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
