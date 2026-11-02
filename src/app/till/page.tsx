"use client";

import { gql, useLazyQuery, useMutation, useQuery } from "@apollo/client";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { PinDigits } from "@/components/PinDigits";
import { StayViewMartMark } from "@/components/StayViewMark";
import { propertyPath, getPropertyCode } from "@/lib/property";
import { buildMartReceipt, printMartReceipt, receiptBranch } from "@/lib/receipt";
import { cashierName, clearSession, getToken } from "@/lib/session";

const LOCK_KEY = "mart-screen-locked";

const DRAWER = gql`
  query currentMartDrawer {
    currentMartDrawer { id status openingFloat }
  }
`;

const LOOKUP = gql`
  query lookupMartBarcode($code: String!) {
    lookupMartBarcode(code: $code) {
      productId variantId name barcode sku unitPrice unitOfMeasure quantityOnHand
    }
  }
`;

const SEARCH = gql`
  query searchMartCatalog($term: String!) {
    searchMartCatalog(term: $term) {
      productId variantId name barcode sku unitPrice unitOfMeasure quantityOnHand
    }
  }
`;

const HEADER = gql`
  query martReceiptHeader($branchAlias: String!) {
    branchAddresses(branchAlias: $branchAlias) {
      branchEmail branchPhone branchPhoneMobile branchCity branchState branchCountry branchAddress branchWebsiteUrl isPrimary
    }
    getBusinessBranch(branchAlias: $branchAlias) {
      status
      data { branchAlias business { businessName } }
    }
  }
`;

const LOYALTY = gql`
  query martLoyaltyCard($phone: String) {
    martLoyaltyCard(phone: $phone) {
      phone name points value nairaPerPoint pointsPer100 active found
    }
  }
`;

const HELD = gql`
  query listHeldMartTickets {
    listHeldMartTickets {
      id receiptNumber total
      lines { productId variantId name barcode quantity unitPrice }
    }
  }
`;

const OPEN_DRAWER = gql`
  mutation openMartDrawer($openingFloat: String) {
    openMartDrawer(openingFloat: $openingFloat) { drawer { id status openingFloat } }
  }
`;

const CLOSE_DRAWER = gql`
  mutation closeMartDrawer($closingCash: String!, $note: String) {
    closeMartDrawer(closingCash: $closingCash, note: $note) { drawer { id status } }
  }
`;

const COMPLETE = gql`
  mutation completeMartSale(
    $lines: [MartLineInput]!
    $payments: [MartTenderInput]!
    $discount: String
    $taxRate: String
    $notes: String
    $heldSaleId: ID
    $loyaltyPhone: String
    $redeemPoints: String
  ) {
    completeMartSale(
      lines: $lines
      payments: $payments
      discount: $discount
      taxRate: $taxRate
      notes: $notes
      heldSaleId: $heldSaleId
      loyaltyPhone: $loyaltyPhone
      redeemPoints: $redeemPoints
    ) {
      sale {
        id receiptNumber subtotal discountAmount taxAmount total changeAmount
        lines { name quantity unitPrice lineTotal }
        payments { method amount }
      }
    }
  }
`;

const HOLD = gql`
  mutation holdMartTicket($lines: [MartLineInput]!, $discount: String, $notes: String, $heldSaleId: ID) {
    holdMartTicket(lines: $lines, discount: $discount, notes: $notes, heldSaleId: $heldSaleId) {
      sale { id receiptNumber total }
    }
  }
`;

const CASHIER = gql`
  query currentMartCashier {
    currentMartCashier { fullName photoUrl }
  }
`;

const TILL_TAX = gql`
  query martTillTax {
    martTillTax { ratePercent flatAmount label }
  }
`;

const UNLOCK = gql`
  mutation unlockMartTill($userPin: String!) {
    unlockMartTill(userPin: $userPin) { success message }
  }
`;

const VOID = gql`
  mutation voidMartTicket($saleId: ID!, $managerPin: String!, $reason: String) {
    voidMartTicket(saleId: $saleId, managerPin: $managerPin, reason: $reason) {
      sale { id receiptNumber status }
    }
  }
`;

type Item = {
  productId: string;
  variantId?: string | null;
  name: string;
  barcode?: string | null;
  unitPrice: string;
  unitOfMeasure?: string | null;
  quantityOnHand?: string | null;
};

type CartLine = Item & { quantity: number };

type Sale = {
  id: string;
  receiptNumber: string;
  subtotal?: string;
  discountAmount?: string;
  taxAmount?: string;
  total: string;
  changeAmount?: string;
  status?: string;
  lines?: {
    productId: string;
    variantId?: string | null;
    name: string;
    barcode?: string | null;
    quantity: string;
    unitPrice: string;
    lineTotal?: string;
  }[];
  payments?: { method: string; amount: string }[];
};

function pointText(value?: string | null) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "0";
  return Number.isInteger(amount) ? String(amount) : String(amount);
}

function money(value: number) {
  return value.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function stockText(value?: string | null) {
  if (value == null || value === "") return "";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  const text = Number.isInteger(amount) ? String(amount) : String(Math.round(amount * 1000) / 1000);
  return `stock ${text}`;
}

function errorText(error: unknown) {
  const graph = (error as { graphQLErrors?: { message?: string }[] })?.graphQLErrors?.[0]?.message;
  if (graph) return graph;
  return error instanceof Error ? error.message : "Request failed";
}

export default function TillPage() {
  const router = useRouter();
  const scanRef = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState("");
  const [hits, setHits] = useState<Item[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState("0");
  const [locked, setLocked] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinReset, setPinReset] = useState(0);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [countedCash, setCountedCash] = useState("0");
  const [shiftError, setShiftError] = useState("");
  const [cash, setCash] = useState("");
  const [card, setCard] = useState("");
  const [transfer, setTransfer] = useState("");
  const [loyaltyPhone, setLoyaltyPhone] = useState("");
  const [redeemPoints, setRedeemPoints] = useState("");
  const [floatAmount, setFloatAmount] = useState("0");
  const [heldId, setHeldId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState<"pay" | "hold" | null>(null);

  const drawerQuery = useQuery(DRAWER, { skip: !getToken() });
  const cashierQuery = useQuery(CASHIER, { skip: !getToken() });
  const taxQuery = useQuery(TILL_TAX, { skip: !getToken() });
  const headerQuery = useQuery(HEADER, {
    variables: { branchAlias: getPropertyCode() },
    skip: !getToken() || !getPropertyCode(),
  });
  const heldQuery = useQuery(HELD, { skip: !getToken(), pollInterval: 60000 });
  const [lookup] = useLazyQuery(LOOKUP);
  const [lookupLoyalty, { data: loyaltyData }] = useLazyQuery(LOYALTY);
  const [search] = useLazyQuery(SEARCH);
  const [openDrawer, { loading: opening }] = useMutation(OPEN_DRAWER);
  const [closeDrawer, { loading: closing }] = useMutation(CLOSE_DRAWER);
  const [completeSale] = useMutation(COMPLETE);
  const [holdTicket] = useMutation(HOLD);
  const [voidTicket, { loading: voiding }] = useMutation(VOID);
  const [unlockTill, { loading: unlocking }] = useMutation(UNLOCK);

  useEffect(() => {
    if (!getToken()) router.replace(propertyPath("/login"));
    else setLocked(sessionStorage.getItem(LOCK_KEY) === "1");
  }, [router]);

  const drawer = drawerQuery.data?.currentMartDrawer;
  const cashier = cashierQuery.data?.currentMartCashier;
  const displayName = cashier?.fullName || cashierName();
  const photoUrl = cashier?.photoUrl || "";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
  const taxInfo = taxQuery.data?.martTillTax;
  const taxRate = Number(taxInfo?.ratePercent) || 0;
  const taxFlat = Number(taxInfo?.flatAmount) || 0;
  const subtotal = cart.reduce((sum, line) => sum + Number(line.unitPrice) * line.quantity, 0);
  const discountValue = Math.min(subtotal, Math.max(0, Number(discount) || 0));
  const loyalty = loyaltyData?.martLoyaltyCard ?? loyaltyData?.data?.martLoyaltyCard;
  const redeemMoney = Math.min(
    Math.max(0, subtotal - discountValue),
    Math.max(0, Number(redeemPoints) || 0) * (Number(loyalty?.nairaPerPoint) || 0),
  );
  const taxable = Math.max(0, subtotal - discountValue - redeemMoney);
  const tax = (taxable * taxRate) / 100 + taxFlat;
  const due = taxable + tax;
  const tendered = (Number(cash) || 0) + (Number(card) || 0) + (Number(transfer) || 0);
  const change = Math.max(0, tendered - due);
  const itemCount = cart.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const itemCountLabel = Number.isInteger(itemCount) ? String(itemCount) : String(Math.round(itemCount * 1000) / 1000);

  const lineInput = useMemo(
    () =>
      cart.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        quantity: String(line.quantity),
      })),
    [cart],
  );

  function changeQty(index: number, delta: number) {
    setCart((current) =>
      current
        .map((row, i) => (i === index ? { ...row, quantity: row.quantity + delta } : row))
        .filter((row) => row.quantity > 0),
    );
  }

  function addItem(item: Item) {
    setCart((current) => {
      const index = current.findIndex(
        (line) => line.productId === item.productId && line.variantId === item.variantId,
      );
      if (index === -1) return [...current, { ...item, quantity: 1 }];
      return current.map((line, i) => (i === index ? { ...line, quantity: line.quantity + 1 } : line));
    });
    setScan("");
    setHits([]);
    scanRef.current?.focus();
  }

  useEffect(() => {
    const term = scan.trim();
    if (!term) {
      setHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      search({ variables: { term }, fetchPolicy: "network-only" })
        .then((result) => {
          if (scanRef.current?.value.trim() !== term) return;
          setHits((result.data?.searchMartCatalog || []) as Item[]);
          setError("");
        })
        .catch((err) => setError(errorText(err)));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [scan, search]);

  async function onScan(event: FormEvent) {
    event.preventDefault();
    setError("");
    const code = scan.trim();
    if (!code) return;
    try {
      const result = await lookup({ variables: { code }, fetchPolicy: "network-only" });
      const item = result.data?.lookupMartBarcode as Item | undefined;
      if (item?.productId) {
        addItem(item);
        return;
      }
    } catch {
      /* A typed name is not a barcode. Show the close name matches instead. */
    }
    try {
      const result = await search({ variables: { term: code }, fetchPolicy: "network-only" });
      const rows = (result.data?.searchMartCatalog || []) as Item[];
      setHits(rows);
      if (rows.length === 1) addItem(rows[0]);
      else if (rows.length === 0) setError("Product not found");
    } catch (err) {
      setError(errorText(err));
    }
  }

  function payments() {
    const rows = [
      { method: "cash", amount: cash || "0" },
      { method: "card", amount: card || "0" },
      { method: "transfer", amount: transfer || "0" },
    ].filter((row) => Number(row.amount) > 0);
    if (!rows.length && due > 0) return [{ method: "cash", amount: due.toFixed(2) }];
    return rows;
  }

  async function ensureDrawer() {
    if (drawerQuery.data?.currentMartDrawer) return;
    await openDrawer({ variables: { openingFloat: floatAmount || "0" } });
    await drawerQuery.refetch();
  }

  async function pay() {
    if (working) return;
    setWorking("pay");
    setError("");
    setNotice("");
    try {
      await ensureDrawer();
      const result = await completeSale({
        variables: {
          lines: lineInput,
          payments: payments(),
          discount: String(discountValue),
          taxRate: String(taxRate || 0),
          heldSaleId: heldId,
          loyaltyPhone: loyalty?.found ? loyalty.phone : "",
          redeemPoints: loyalty?.found ? redeemPoints || "0" : "0",
        },
      });
      const sale = (result.data?.completeMartSale?.sale ?? result.data?.data?.completeMartSale?.sale) as Sale;
      if (!sale?.receiptNumber) {
        setError("Payment did not complete.");
        return;
      }
      setReceipt(sale);
      const text = buildMartReceipt(sale, displayName, receiptBranch(headerQuery.data) || { branchAlias: getPropertyCode() });
      void printMartReceipt(text);
      setCart([]);
      setHeldId(null);
      setCash("");
      setCard("");
      setTransfer("");
      setDiscount("0");
      setLoyaltyPhone("");
      setRedeemPoints("");
      setNotice(`Paid ${sale.receiptNumber}`);
      heldQuery.refetch();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setWorking(null);
    }
  }

  async function hold() {
    if (working) return;
    setWorking("hold");
    setError("");
    try {
      await ensureDrawer();
      const result = await holdTicket({
        variables: { lines: lineInput, discount: String(discountValue), heldSaleId: heldId },
      });
      const sale = result.data?.holdMartTicket?.sale ?? result.data?.data?.holdMartTicket?.sale;
      if (!sale?.receiptNumber) {
        setError("Could not hold this sale.");
        return;
      }
      setNotice(heldId ? `Updated ${sale.receiptNumber}` : `Held ${sale.receiptNumber}`);
      setCart([]);
      setHeldId(null);
      heldQuery.refetch();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setWorking(null);
    }
  }

  async function recall(sale: {
    id: string;
    receiptNumber: string;
    lines?: { productId: string; variantId?: string | null; name: string; barcode?: string | null; quantity: string; unitPrice: string }[];
  }) {
    setHeldId(sale.id);
    setCart(
      (sale.lines || []).map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        name: line.name,
        barcode: line.barcode,
        unitPrice: line.unitPrice,
        quantity: Number(line.quantity),
      })),
    );
    setNotice(`Recalled ${sale.receiptNumber}`);
  }

  async function voidLast() {
    if (!receipt?.id) return;
    const pin = window.prompt("Manager PIN");
    if (!pin) return;
    const reason = window.prompt("Reason") || "Voided at the till";
    try {
      await voidTicket({ variables: { saleId: receipt.id, managerPin: pin, reason } });
      setNotice(`${receipt.receiptNumber} voided`);
      setReceipt(null);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="shell">
      <header className="top">
        <strong>StayView Mart</strong>
        <span className="who">
          {photoUrl ? (
            <img className="avatar" src={photoUrl} alt="" />
          ) : (
            <span className="avatar" aria-hidden="true">{initials || "M"}</span>
          )}
          <span>{displayName}</span>
        </span>
        <div className="row no-print">
          {!drawer ? (
            <>
              <input value={floatAmount} onChange={(event) => setFloatAmount(event.target.value)} placeholder="Opening float" />
              <button
                type="button"
                onClick={async () => {
                  await openDrawer({ variables: { openingFloat: floatAmount || "0" } });
                  drawerQuery.refetch();
                }}
                disabled={opening}
              >
                Open drawer
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setCountedCash("0");
                setShiftError("");
                setShiftOpen(true);
              }}
              disabled={closing}
            >
              End shift
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              sessionStorage.setItem(LOCK_KEY, "1");
              setPinError("");
              setPinReset((value) => value + 1);
              setLocked(true);
            }}
          >
            Lock
          </button>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem(LOCK_KEY);
              clearSession();
              router.replace(propertyPath("/login"));
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="till">
        <section className="panel scan">
          <form onSubmit={onScan}>
            <label>
              Scan or search
              <input
                ref={scanRef}
                value={scan}
                onChange={(event) => setScan(event.target.value)}
                placeholder="Type a product name or scan a barcode"
                autoFocus
              />
            </label>
            <div className="actions no-print">
              <button className="primary" type="submit">Add</button>
            </div>
          </form>
          <div className="hits">
            {hits.map((item) => (
              <button className="hit" type="button" key={`${item.productId}-${item.variantId || ""}`} onClick={() => addItem(item)}>
                <span>
                  <strong>{item.name}</strong>
                  <br />
                  <small>
                    {[item.barcode || item.unitOfMeasure, stockText(item.quantityOnHand)].filter(Boolean).join(" · ")}
                  </small>
                </span>
                <span>{money(Number(item.unitPrice))}</span>
              </button>
            ))}
          </div>
          <p className="error">{error}</p>
          <p className="ok">{notice}</p>
          {receipt ? (
            <div className="receipt" id="receipt">
              <pre className="receipt-slip">{buildMartReceipt(receipt, displayName, receiptBranch(headerQuery.data) || { branchAlias: getPropertyCode() })}</pre>
              <button
                className="ghost no-print"
                type="button"
                onClick={() => void printMartReceipt(buildMartReceipt(receipt, displayName, receiptBranch(headerQuery.data) || { branchAlias: getPropertyCode() }))}
              >
                Print receipt
              </button>
              <button className="danger no-print" type="button" onClick={voidLast} disabled={voiding}>Void with manager PIN</button>
            </div>
          ) : null}
        </section>

        <section className="panel pay">
          <h2>Cart ({itemCountLabel})</h2>
          <div className="cart">
            {cart.length === 0 ? <p>Scan an item to start the sale.</p> : null}
            {cart.map((line, index) => (
              <div className="line" key={`${line.productId}-${index}`}>
                <span>
                  <strong>{line.name}</strong>
                  <br />
                  <small>
                    {money(Number(line.unitPrice))}
                    {stockText(line.quantityOnHand) ? ` · ${stockText(line.quantityOnHand)}` : ""}
                  </small>
                </span>
                <div className="qty">
                  <button type="button" aria-label={`Decrease ${line.name}`} onClick={() => changeQty(index, -1)}>
                    −
                  </button>
                  <strong>{line.quantity}</strong>
                  <button type="button" aria-label={`Increase ${line.name}`} onClick={() => changeQty(index, 1)}>
                    +
                  </button>
                </div>
                <strong>{money(Number(line.unitPrice) * line.quantity)}</strong>
              </div>
            ))}
          </div>
          <div className="totals">
            <span>Subtotal</span><span>{money(subtotal)}</span>
            <label>Discount</label>
            <input value={discount} onChange={(event) => setDiscount(event.target.value)} />
            <label>Loyalty phone</label>
            <input
              value={loyaltyPhone}
              placeholder="Optional"
              onChange={(event) => {
                const next = event.target.value;
                setLoyaltyPhone(next);
                const digits = next.replace(/\D/g, "");
                if (digits.length >= 10) lookupLoyalty({ variables: { phone: next } });
              }}
              onBlur={() => {
                if (loyaltyPhone.replace(/\D/g, "").length >= 7) {
                  lookupLoyalty({ variables: { phone: loyaltyPhone } });
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && loyaltyPhone.replace(/\D/g, "").length >= 7) {
                  event.preventDefault();
                  lookupLoyalty({ variables: { phone: loyaltyPhone } });
                }
              }}
            />
            <span>Points</span>
            <span>
              {loyalty?.found
                ? `${pointText(loyalty.points)}${loyalty.name ? ` · ${loyalty.name}` : ""} · ${money(Number(loyalty.value))}`
                : loyalty
                  ? "No card for this phone"
                  : "0"}
            </span>
            <label>Redeem points</label>
            <input value={redeemPoints} onChange={(event) => setRedeemPoints(event.target.value)} />
            {redeemMoney > 0 ? (
              <>
                <span>Points discount</span>
                <span>{money(redeemMoney)}</span>
              </>
            ) : null}
            <span>Tax{taxInfo?.label ? ` (${taxInfo.label})` : ""}</span>
            <span>{money(tax)}</span>
            <span>Due</span><span className="due">{money(due)}</span>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <label>Cash<input value={cash} onChange={(event) => setCash(event.target.value)} /></label>
            <label>Card<input value={card} onChange={(event) => setCard(event.target.value)} /></label>
            <label>Transfer<input value={transfer} onChange={(event) => setTransfer(event.target.value)} /></label>
          </div>
          <p>Tendered {money(tendered)} · Change {money(change)}</p>
          <div className="actions">
            <button className="primary" type="button" disabled={!cart.length || working !== null} onClick={pay}>
              {working === "pay" ? "Taking payment…" : "Take payment"}
            </button>
            <button className="ghost" type="button" disabled={!cart.length || working !== null} onClick={hold}>
              {working === "hold" ? "Holding…" : "Hold"}
            </button>
          </div>
          <p className="error">{error}</p>
          <p className="ok">{notice}</p>
          <h3>Held tickets</h3>
          <div className="holds">
            {(heldQuery.data?.listHeldMartTickets || []).slice(0, 12).map((sale: Sale) => (
              <button className="hit" type="button" key={sale.id} onClick={() => recall(sale)}>
                <span>{sale.receiptNumber}</span>
                <span>{money(Number(sale.total))}</span>
              </button>
            ))}
          </div>
        </section>
      </main>
      {shiftOpen ? (
        <div className="modal-back" role="presentation">
          <form
            className="modal"
            onSubmit={async (event) => {
              event.preventDefault();
              setShiftError("");
              try {
                await closeDrawer({ variables: { closingCash: countedCash || "0" } });
                setShiftOpen(false);
                setNotice("Shift ended");
                drawerQuery.refetch();
                heldQuery.refetch();
              } catch (err) {
                setShiftError(errorText(err));
              }
            }}
          >
            <h2>Counted cash in the drawer</h2>
            <p>Enter the cash you counted before the shift closes.</p>
            <label>
              Counted cash
              <input
                value={countedCash}
                onChange={(event) => setCountedCash(event.target.value)}
                inputMode="decimal"
                autoFocus
              />
            </label>
            <p className="error">{shiftError}</p>
            <div className="actions">
              <button className="ghost" type="button" onClick={() => setShiftOpen(false)} disabled={closing}>
                Cancel
              </button>
              <button className="primary" type="submit" disabled={closing}>
                {closing ? "Ending shift…" : "End shift"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {locked ? (
        <div className="lock">
          <div className="lock-card">
            <div className="lock-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </div>
            <h2>Screen locked</h2>
            <p>Enter your 4-digit PIN to unlock and continue.</p>
            <p className="lock-name">{displayName}</p>
            {pinError ? <p className="error">{pinError}</p> : null}
            <PinDigits
              disabled={unlocking}
              hasError={Boolean(pinError)}
              resetKey={pinReset}
              onEdit={() => setPinError("")}
              onComplete={async (value) => {
                try {
                  const result = await unlockTill({ variables: { userPin: value } });
                  const payload = result.data?.unlockMartTill;
                  if (payload?.success) {
                    sessionStorage.removeItem(LOCK_KEY);
                    setLocked(false);
                    setPinError("");
                    return;
                  }
                  setPinError(payload?.message || "Invalid PIN. Please try again.");
                  setPinReset((current) => current + 1);
                } catch (err) {
                  setPinError(errorText(err));
                  setPinReset((current) => current + 1);
                }
              }}
            />
            {unlocking ? <p>Validating PIN...</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
