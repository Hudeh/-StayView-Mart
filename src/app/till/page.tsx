"use client";

import { gql, useLazyQuery, useMutation, useQuery } from "@apollo/client";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { NightToggle } from "@/components/NightToggle";
import { PinDigits } from "@/components/PinDigits";
import { StayViewMartMark } from "@/components/StayViewMark";
import { propertyPath, getPropertyCode } from "@/lib/property";
import { buildMartReceipt, printMartReceipt, receiptBranch, receiptSettings } from "@/lib/receipt";
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

const CATEGORIES = gql`
  query martCategories {
    martCategories { id name }
  }
`;

const CATEGORY_PRODUCTS = gql`
  query martCategoryProducts($categoryId: ID!) {
    martCategoryProducts(categoryId: $categoryId) {
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
    martReceiptSettings { footer maxPrints }
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
        payments { method amount bankName }
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

const BANKS = gql`
  query martBanks($activeOnly: Boolean) {
    martBanks(activeOnly: $activeOnly) { id name accountNumber }
  }
`;

const SHIFT_SALES = gql`
  query martDrawerSales {
    martDrawerSales {
      id receiptNumber total status
    }
  }
`;

const RECALL = gql`
  query recallMartSale($saleId: ID!) {
    recallMartSale(saleId: $saleId) {
      id receiptNumber status subtotal discountAmount taxAmount total changeAmount
      lines { productId variantId name barcode quantity unitPrice lineTotal }
      payments { method amount bankName }
    }
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
  payments?: { method: string; amount: string; bankName?: string | null }[];
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

function HeaderIcon({ name }: { name: "drawer" | "end" | "lock" | "out" }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    "aria-hidden": true,
  } as const;
  if (name === "drawer") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <path d="M3 10h18M9 14h6" />
      </svg>
    );
  }
  if (name === "end") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5l3 2" />
      </svg>
    );
  }
  if (name === "lock") {
    return (
      <svg {...common}>
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2" />
      <path d="M15 12H3m0 0 3-3m-3 3 3 3" />
    </svg>
  );
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
  const [transferBank, setTransferBank] = useState("");
  const [bankOpen, setBankOpen] = useState(false);
  const [bankPick, setBankPick] = useState("");
  const [bankAmount, setBankAmount] = useState("");
  const [loyaltyPhone, setLoyaltyPhone] = useState("");
  const [redeemPoints, setRedeemPoints] = useState("");
  const [floatAmount, setFloatAmount] = useState("0");
  const [heldId, setHeldId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [printsUsed, setPrintsUsed] = useState(0);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidError, setVoidError] = useState("");
  const [voidPinReset, setVoidPinReset] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState<"pay" | "hold" | null>(null);
  const [cashierMenu, setCashierMenu] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const cashierMenuRef = useRef<HTMLDivElement>(null);

  const drawerQuery = useQuery(DRAWER, { skip: !getToken() });
  const cashierQuery = useQuery(CASHIER, { skip: !getToken() });
  const taxQuery = useQuery(TILL_TAX, { skip: !getToken() });
  const headerQuery = useQuery(HEADER, {
    variables: { branchAlias: getPropertyCode() },
    skip: !getToken() || !getPropertyCode(),
  });
  const heldQuery = useQuery(HELD, { skip: !getToken(), pollInterval: 60000 });
  const banksQuery = useQuery(BANKS, { variables: { activeOnly: true }, skip: !getToken() });
  const shiftSalesQuery = useQuery(SHIFT_SALES, { skip: !getToken() });
  const [recallSale] = useLazyQuery(RECALL);
  const [lookup] = useLazyQuery(LOOKUP);
  const [lookupLoyalty, { data: loyaltyData }] = useLazyQuery(LOYALTY);
  const [search] = useLazyQuery(SEARCH);
  const categoriesQuery = useQuery(CATEGORIES, { skip: !getToken() });
  const [loadCategoryProducts, categoryProductsQuery] = useLazyQuery(CATEGORY_PRODUCTS);
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

  useEffect(() => {
    if (!cashierMenu) return;
    const close = (event: MouseEvent) => {
      if (!cashierMenuRef.current?.contains(event.target as Node)) setCashierMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [cashierMenu]);

  const drawer = drawerQuery.data?.currentMartDrawer;
  const cashier = cashierQuery.data?.currentMartCashier;
  const displayName = cashier?.fullName || cashierName();
  const slipSettings = receiptSettings(headerQuery.data);
  const printLimitReached = printsUsed >= slipSettings.maxPrints;

  function slipFor(sale: Sale, footer = slipSettings.footer) {
    return buildMartReceipt(
      sale,
      displayName,
      receiptBranch(headerQuery.data) || { branchAlias: getPropertyCode() },
      footer,
    );
  }

  function closeReceipt() {
    setReceipt(null);
    setPrintsUsed(0);
    setVoidOpen(false);
  }
  const photoUrl = cashier?.photoUrl || "";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase() || "")
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
  const salePoints =
    loyalty?.active === false
      ? 0
      : (Math.max(0, subtotal - discountValue) / 100) * (Number(loyalty?.pointsPer100) || 0);
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
      { method: "card", amount: card || "0", bankName: "" },
      { method: "transfer", amount: transfer || "0", bankName: transferBank },
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
    if (working || itemCount < 1) return;
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
          loyaltyPhone: loyaltyPhone.replace(/\D/g, "").length >= 7 ? loyalty?.phone || loyaltyPhone : "",
          redeemPoints: loyalty?.found ? redeemPoints || "0" : "0",
        },
      });
      const sale = (result.data?.completeMartSale?.sale ?? result.data?.data?.completeMartSale?.sale) as Sale;
      if (!sale?.receiptNumber) {
        setError("Payment did not complete.");
        return;
      }
      setReceipt(sale);
      setPrintsUsed(0);
      const fresh = await headerQuery.refetch();
      const latest = receiptSettings(fresh.data);
      const printed = await printMartReceipt(slipFor(sale, latest.footer));
      if (printed) setPrintsUsed(1);
      setCart([]);
      setHeldId(null);
      setCash("");
      setCard("");
      setTransfer("");
      setTransferBank("");
      shiftSalesQuery.refetch();
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
    if (working || itemCount < 1) return;
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

  async function recall(saleId: string) {
    setCashierMenu(false);
    setError("");
    try {
      const result = await recallSale({ variables: { saleId }, fetchPolicy: "network-only" });
      const sale = (result.data?.recallMartSale ?? result.data?.data?.recallMartSale) as Sale | undefined;
      if (!sale?.receiptNumber) {
        setError("This sale cannot be recalled.");
        return;
      }
      if (sale.status === "held") {
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
        return;
      }
      setReceipt(sale);
      setPrintsUsed(0);
      setNotice(`Recalled ${sale.receiptNumber}`);
    } catch (err) {
      setError(errorText(err));
    }
  }

  function confirmTransfer() {
    const amount = Number(bankAmount);
    if (!bankPick) {
      setError("Select a bank.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter the transfer amount.");
      return;
    }
    setTransferBank(bankPick);
    setTransfer(amount.toFixed(2));
    setBankOpen(false);
    setError("");
  }

  function openVoid() {
    if (!receipt?.id || voiding) return;
    setVoidError("");
    setVoidPinReset((current) => current + 1);
    setVoidOpen(true);
  }

  async function submitVoid(pin: string) {
    if (!receipt?.id || voiding) return;
    setVoidError("");
    try {
      await voidTicket({
        variables: { saleId: receipt.id, managerPin: pin, reason: "Voided at the till" },
      });
      setNotice(`${receipt.receiptNumber} voided`);
      closeReceipt();
    } catch (err) {
      setVoidError(errorText(err));
      setVoidPinReset((current) => current + 1);
    }
  }

  return (
    <div className="shell">
      <header className="top">
        <strong>StayView Mart</strong>
        <div className="row no-print">
          {!drawer ? (
            <>
              <input value={floatAmount} onChange={(event) => setFloatAmount(event.target.value)} placeholder="Opening float" />
              <button
                className="icon-btn"
                type="button"
                aria-label="Open drawer"
                title="Open drawer"
                onClick={async () => {
                  await openDrawer({ variables: { openingFloat: floatAmount || "0" } });
                  drawerQuery.refetch();
                }}
                disabled={opening}
              >
                <HeaderIcon name="drawer" />
              </button>
            </>
          ) : (
            <button
              className="icon-btn"
              type="button"
              aria-label="End shift"
              title="End shift"
              onClick={() => {
                setCountedCash("0");
                setShiftError("");
                setShiftOpen(true);
              }}
              disabled={closing}
            >
              <HeaderIcon name="end" />
            </button>
          )}
          <button
            className="icon-btn"
            type="button"
            aria-label="Lock"
            title="Lock"
            onClick={() => {
              sessionStorage.setItem(LOCK_KEY, "1");
              setPinError("");
              setPinReset((value) => value + 1);
              setLocked(true);
            }}
          >
            <HeaderIcon name="lock" />
          </button>
          <button
            className="icon-btn"
            type="button"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => {
              sessionStorage.removeItem(LOCK_KEY);
              clearSession();
              router.replace(propertyPath("/login"));
            }}
          >
            <HeaderIcon name="out" />
          </button>
          <NightToggle />
        </div>
        <div className="who-menu" ref={cashierMenuRef}>
          <button
            className="who"
            type="button"
            aria-haspopup="menu"
            aria-expanded={cashierMenu}
            onClick={() => setCashierMenu((open) => !open)}
          >
            {photoUrl ? (
              <img className="avatar" src={photoUrl} alt="" />
            ) : (
              <span className="avatar" aria-hidden="true">{initials || "M"}</span>
            )}
            <span className="who-name">{displayName}</span>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          {cashierMenu ? (
            <div className="who-drop" role="menu">
              <p className="who-drop-label">Held tickets</p>
              {(heldQuery.data?.listHeldMartTickets || []).length === 0 ? (
                <p className="who-drop-empty">No held tickets</p>
              ) : (
                (heldQuery.data?.listHeldMartTickets || []).slice(0, 12).map((sale: Sale) => (
                  <button type="button" key={sale.id} onClick={() => void recall(sale.id)}>
                    <span>{sale.receiptNumber}</span>
                    <span>{money(Number(sale.total))}</span>
                  </button>
                ))
              )}
              <p className="who-drop-label">This shift</p>
              {(shiftSalesQuery.data?.martDrawerSales || shiftSalesQuery.data?.data?.martDrawerSales || []).length === 0 ? (
                <p className="who-drop-empty">No sales this shift</p>
              ) : (
                (shiftSalesQuery.data?.martDrawerSales || shiftSalesQuery.data?.data?.martDrawerSales || []).map(
                  (sale: Sale) => (
                    <button type="button" key={sale.id} onClick={() => void recall(sale.id)}>
                      <span>{sale.receiptNumber}</span>
                      <span>{money(Number(sale.total))}</span>
                    </button>
                  ),
                )
              )}
            </div>
          ) : null}
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
              <div className="receipt-bar no-print">
                <strong>Receipt</strong>
                <button className="receipt-close" type="button" aria-label="Close receipt" onClick={closeReceipt}>
                  ×
                </button>
              </div>
              <pre className="receipt-slip">{slipFor(receipt)}</pre>
              <div className="receipt-actions no-print">
                <button
                  className="ghost"
                  type="button"
                  disabled={printLimitReached}
                  onClick={() => {
                    if (printLimitReached) return;
                    void printMartReceipt(slipFor(receipt)).then((printed) => {
                      if (printed) setPrintsUsed((used) => used + 1);
                    });
                  }}
                >
                  Print receipt
                </button>
                <button className="danger" type="button" onClick={openVoid} disabled={voiding}>
                  Void with manager PIN
                </button>
              </div>
            </div>
          ) : null}
          {categoryId ? (
            <>
              <div className="category-bar">
                <button className="ghost" type="button" onClick={() => { setCategoryId(""); setCategoryName(""); }}>
                  Categories
                </button>
                <h3>{categoryName}</h3>
              </div>
              <div className="hits">
                {categoryProductsQuery.loading ? <p>Loading products…</p> : null}
                {(categoryProductsQuery.data?.martCategoryProducts || categoryProductsQuery.data?.data?.martCategoryProducts || []).map((item: Item) => (
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
                {!categoryProductsQuery.loading &&
                (categoryProductsQuery.data?.martCategoryProducts || categoryProductsQuery.data?.data?.martCategoryProducts || []).length === 0 ? (
                  <p>No products in this category.</p>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <h3>Categories</h3>
              <div className="holds">
                {(categoriesQuery.data?.martCategories || categoriesQuery.data?.data?.martCategories || []).map(
                  (category: { id: string; name: string }) => (
                    <button
                      className="hit"
                      type="button"
                      key={category.id}
                      onClick={() => {
                        setCategoryId(category.id);
                        setCategoryName(category.name);
                        void loadCategoryProducts({ variables: { categoryId: category.id } });
                      }}
                    >
                      <span>{category.name}</span>
                    </button>
                  ),
                )}
              </div>
              {!(categoriesQuery.data?.martCategories || categoriesQuery.data?.data?.martCategories || []).length && !categoriesQuery.loading ? (
                <p>No categories yet.</p>
              ) : null}
            </>
          )}
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
                ? `${pointText(loyalty.points)}${loyalty.name ? ` · ${loyalty.name}` : ""}${
                    salePoints > 0 ? ` · +${pointText(String(salePoints))} this sale` : ""
                  }`
                : loyalty?.active === false
                  ? "Loyalty is off"
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
            <label>Cash<input value={cash} onChange={(event) => setCash(event.target.value)} disabled={itemCount < 1} /></label>
            <label>Card<input value={card} onChange={(event) => setCard(event.target.value)} disabled={itemCount < 1} /></label>
            <label>
              Transfer
              <button
                className="field-btn"
                type="button"
                disabled={itemCount < 1}
                onClick={() => {
                  if (itemCount < 1) return;
                  setBankPick(transferBank);
                  setBankAmount(transfer);
                  setBankOpen(true);
                }}
              >
                {transferBank && Number(transfer) > 0 ? transferBank : "Select bank"}
              </button>
            </label>
          </div>
          {transferBank && Number(transfer) > 0 ? (
            <p>
              {transferBank} · {money(Number(transfer))}
              <button
                className="ghost"
                type="button"
                disabled={itemCount < 1}
                onClick={() => {
                  setTransfer("");
                  setTransferBank("");
                }}
              >
                Remove
              </button>
            </p>
          ) : null}
          <p>Tendered {money(tendered)} · Change {money(change)}</p>
          <div className="actions">
            <button className="primary" type="button" disabled={itemCount < 1 || working !== null} onClick={pay}>
              {working === "pay" ? "Taking payment…" : "Take payment"}
            </button>
            <button className="ghost" type="button" disabled={itemCount < 1 || working !== null} onClick={hold}>
              {working === "hold" ? "Holding…" : "Hold"}
            </button>
          </div>
          <p className="error">{error}</p>
          <p className="ok">{notice}</p>
        </section>
      </main>
      {bankOpen ? (
        <div className="modal-back" role="presentation">
          <div className="modal bank-modal" role="dialog" aria-labelledby="bank-title">
            <h2 id="bank-title">Transfer</h2>
            <p>Select the bank and enter the amount.</p>
            <div className="bank-grid">
              {(banksQuery.data?.martBanks || banksQuery.data?.data?.martBanks || []).map(
                (bank: { id: string; name: string; accountNumber?: string | null }) => (
                  <button
                    className={bankPick === bank.name ? "bank-card on" : "bank-card"}
                    type="button"
                    key={bank.id}
                    onClick={() => setBankPick(bank.name)}
                  >
                    <strong>{bank.name}</strong>
                    {bank.accountNumber ? <small>{bank.accountNumber}</small> : null}
                  </button>
                ),
              )}
            </div>
            {(banksQuery.data?.martBanks || banksQuery.data?.data?.martBanks || []).length === 0 ? (
              <p>Add transfer banks in Mart setup.</p>
            ) : null}
            <label>
              Amount
              <input
                value={bankAmount}
                onChange={(event) => setBankAmount(event.target.value)}
                inputMode="decimal"
                autoFocus
              />
            </label>
            <div className="actions">
              <button className="ghost" type="button" onClick={() => setBankOpen(false)}>
                Cancel
              </button>
              <button className="primary" type="button" onClick={confirmTransfer}>
                Use this bank
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {voidOpen && receipt ? (
        <div className="modal-back" role="presentation">
          <div className="modal void-modal" role="dialog" aria-labelledby="void-title">
            <h2 id="void-title">Void sale</h2>
            <p>{receipt.receiptNumber}</p>
            <p>Amount to void</p>
            <p className="due">{money(Number(receipt.total))}</p>
            <p>Enter the manager 4-digit PIN.</p>
            {voidError ? <p className="error">{voidError}</p> : null}
            <PinDigits
              disabled={voiding}
              hasError={Boolean(voidError)}
              resetKey={voidPinReset}
              onEdit={() => setVoidError("")}
              onComplete={(value) => {
                void submitVoid(value);
              }}
            />
            {voiding ? <p>Voiding…</p> : null}
            <div className="actions">
              <button className="ghost" type="button" onClick={() => setVoidOpen(false)} disabled={voiding}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
                shiftSalesQuery.refetch();
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
