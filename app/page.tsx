"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { ensureBase, getBrowserProvider } from "@/lib/provider";
import { IEOK_ADDRESS, CBBTC_ADDRESS } from "@/lib/contracts";

const IEOK_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function dividendsOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function buy(uint256 cbbtcAmount, uint256 minTokens) external",
  "function sell(uint256 tokens, uint256 minCbbtc) external",
  "function transfer(address to, uint256 tokens) external returns (bool)",
  "function withdraw() external",
  "function inscribe(address vault, bytes32 assetId, uint256 amount, uint256 ordinalNumber) external",
  "function reportOrdinalMoved(uint256 ordinalNumber) external",
  "function vaultStatus(address vault) view returns (bool registered, bool swept, uint256 balance, bytes32 assetId, uint256 ordinalNumber, bool ordinalMoved, uint256 ordinalMovedAt)",
];

const CBBTC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

type TxState = "idle" | "pending" | "success" | "failed";
type Tab = "trade" | "transfer" | "vault" | "learn" | "inscribe";
type VaultResult = {
  registered: boolean;
  swept: boolean;
  balance: string;
  dividends: string;
  assetId: string;
  ordinalNumber: string;
  ordinalMoved: boolean;
  ordinalMovedAt: string;
} | null;

const C = {
  bg:        "#000000",
  panel:     "#0D0D0D",
  card:      "#111111",
  input:     "#0A0A0A",
  border:    "#333333",
  gold:      "#C9A84C",
  goldDim:   "#8A6E2A",
  goldBg:    "rgba(201,168,76,0.15)",
  text:      "#F0EDE6",
  textDim:   "#C8C4BC",
  textMuted: "#909090",
  green:     "#4CAF7A",
  red:       "#CF6679",
  orange:    "#E8913A",
  greenBg:   "rgba(76,175,122,0.15)",
  redBg:     "rgba(207,102,121,0.15)",
  orangeBg:  "rgba(232,145,58,0.15)",
};

// ─── VAULT REGISTRAR ──────────────────────────────────────────────────────────
// INSCRIBE tab is ONLY shown when this exact wallet is connected.
const VAULT_REGISTRAR = "0x10DB4bf0C9e7c14f320C4e831CC85fFD8D15BE6D";

// ─── NETWORK ──────────────────────────────────────────────────────────────────
// Change to "8453" / "BASE" / "https://basescan.org" for mainnet
const CHAIN_ID       = "84532";
const CHAIN_LABEL    = "BASE SEPOLIA";
const BLOCK_EXPLORER = "https://sepolia.basescan.org";

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const satsToBtc = (s: number) => s / 1e8;
const satsToUsd = (s: number, p: number) => satsToBtc(s) * p;
const fmtUsd    = (n: number) => "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtSats   = (v: string) => Number(v).toLocaleString() + " sats";
const fmtAddr   = (v: string) => v ? v.slice(0, 6) + "..." + v.slice(-4) : "—";
const fmtCbbtc  = (v: string) => (Number(v) / 1e8).toFixed(6) + " cbBTC";
const fmtTs     = (ts: string) => {
  const n = Number(ts);
  if (!n) return "—";
  return new Date(n * 1000).toLocaleString();
};

function buyPreview(sats: string) {
  const n = Number(sats);
  if (!n) return null;
  const fee    = Math.floor(n * 7 / 100);
  const tokens = n - fee;
  return { fee, tokens };
}

function sellPreview(tokens: string) {
  const n = Number(tokens);
  if (!n) return null;
  const fee = Math.floor(n * 7 / 100);
  const out  = n - fee;
  return { fee, out };
}

function b32(str: string) {
  return ethers.encodeBytes32String(str.slice(0, 31));
}

const useIsMobile = () => {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
};

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
function Status({ state, msg }: { state: TxState; msg: string }) {
  if (state === "idle" || !msg) return null;
  const cfg = {
    pending: { bg: C.goldBg,  border: C.goldDim, color: C.gold,  icon: "⏳" },
    success: { bg: C.greenBg, border: "#2d6a4f", color: C.green, icon: "✓"  },
    failed:  { bg: C.redBg,   border: "#7a2d3a", color: C.red,   icon: "✗"  },
    idle:    { bg: "",         border: "",         color: "",       icon: ""   },
  }[state];
  return (
    <div style={{ marginTop: 12, padding: "14px 18px", background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      <span style={{ color: cfg.color, fontFamily: "Arial, sans-serif", fontSize: 16 }}>
        {cfg.icon} {msg}
      </span>
    </div>
  );
}

function FeeBadge({ mobile }: { mobile: boolean }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      background: C.goldBg,
      border: `1px solid ${C.goldDim}`,
      padding: mobile ? "10px 14px" : "12px 20px",
      marginBottom: 24,
    }}>
      <span style={{ fontFamily: "Arial, sans-serif", fontSize: 20, color: C.gold }}>◈</span>
      <span style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 14 : 15, color: C.gold, fontWeight: 700, letterSpacing: "0.05em" }}>
        7% fee on every buy and sell — distributed instantly to all IEOK holders as cbBTC dividends
      </span>
    </div>
  );
}

function Card({ label, value, sub, sub2, accent }: {
  label: string; value: string; sub?: string; sub2?: string; accent?: boolean;
}) {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${accent ? C.gold : C.border}`,
      borderTop: `3px solid ${accent ? C.gold : C.border}`,
      padding: "20px",
      flex: 1,
      minWidth: 0,
    }}>
      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, letterSpacing: "0.2em", color: C.textMuted, textTransform: "uppercase" as const, marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 20, fontWeight: 700, color: accent ? C.gold : C.text, lineHeight: 1, wordBreak: "break-all" as const }}>
        {value}
      </div>
      {sub  && <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.textMuted, marginTop: 6 }}>{sub}</div>}
      {sub2 && <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.green,     marginTop: 3 }}>{sub2}</div>}
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = "text", hint, tag }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; hint?: string; tag?: string;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, letterSpacing: "0.2em", color: C.textDim, textTransform: "uppercase" as const, marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ position: "relative" as const }}>
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: "100%",
            background: C.input,
            border: `1px solid ${C.border}`,
            borderBottom: `2px solid ${C.gold}`,
            color: C.text,
            fontFamily: "Arial, sans-serif",
            fontSize: 18,
            padding: tag ? "16px 80px 16px 18px" : "16px 18px",
            outline: "none",
            boxSizing: "border-box" as const,
            WebkitAppearance: "none" as const,
          }}
        />
        {tag && (
          <div style={{ position: "absolute" as const, right: 18, top: "50%", transform: "translateY(-50%)", fontFamily: "Arial, sans-serif", fontSize: 13, color: C.gold }}>
            {tag}
          </div>
        )}
      </div>
      {hint && <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.textMuted, marginTop: 8 }}>{hint}</div>}
    </div>
  );
}

function Preview({ rows }: { rows: { label: string; value: string; gold?: boolean }[] }) {
  return (
    <div style={{ background: C.input, border: `1px solid ${C.border}`, padding: "16px 20px", marginBottom: 24 }}>
      {rows.map((r, i) => (
        <div key={i}>
          {i > 0 && i === rows.length - 1 && <div style={{ height: 1, background: C.border, margin: "10px 0" }} />}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", gap: 12 }}>
            <span style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: C.textMuted }}>{r.label}</span>
            <span style={{ fontFamily: "Arial, sans-serif", fontSize: 16, color: r.gold ? C.gold : C.textDim, fontWeight: r.gold ? 700 : 400, flexShrink: 0 }}>{r.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function BigBtn({ onClick, children, variant = "gold", disabled = false }: {
  onClick: () => void; children: React.ReactNode;
  variant?: "gold" | "outline"; disabled?: boolean;
}) {
  const v = {
    gold:    { bg: C.gold,        color: "#000000", border: "none" },
    outline: { bg: "transparent", color: C.gold,    border: `2px solid ${C.goldDim}` },
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        background: v.bg,
        color: v.color,
        border: v.border,
        padding: "20px",
        fontFamily: "Arial, sans-serif",
        fontSize: 16,
        letterSpacing: "0.2em",
        textTransform: "uppercase" as const,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : 1,
        marginBottom: 4,
        fontWeight: 700,
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {children}
    </button>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderTop: `3px solid ${C.gold}`, padding: "28px 24px", marginBottom: 16 }}>
      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, letterSpacing: "0.3em", color: C.gold, marginBottom: 24, textTransform: "uppercase" as const, fontWeight: 700 }}>
        ◆ {title}
      </div>
      {children}
    </div>
  );
}

const VIDEOS = [
  { title: "What is IEOK — Immutable Editions Origin Key",  desc: "Introduction to the IEOK token and how it works with physical art pieces.",     url: "https://youtube.com", tag: "START HERE", tc: "#4CAF7A" },
  { title: "What is Analog Bitcoin",                        desc: "The concept behind physical Bitcoin — destroy to redeem.",                        url: "https://youtube.com", tag: "CONCEPT",    tc: "#C9A84C" },
  { title: "How to get cbBTC on Base",                      desc: "Step by step — buying Coinbase Wrapped Bitcoin and getting it into your wallet.", url: "https://youtube.com", tag: "BEGINNERS",  tc: "#C9A84C" },
  { title: "How to buy IEOK tokens",                        desc: "Buying IEOK using the exchange on Base.",                                          url: "https://youtube.com", tag: "TRADING",    tc: "#C9A84C" },
  { title: "How cbBTC dividends work",                      desc: "How fees are distributed to all IEOK holders and how to withdraw.",               url: "https://youtube.com", tag: "DIVIDENDS",  tc: "#C9A84C" },
  { title: "How to verify a vault — NFC tap guide",         desc: "Tap an Analog Bitcoin NFC tag and verify vault status on chain.",                 url: "https://youtube.com", tag: "COLLECTORS", tc: "#4CAF7A" },
  { title: "What is an Ordinal inscription",                desc: "Understanding Bitcoin Ordinals and how they connect to physical art.",             url: "https://youtube.com", tag: "ORDINALS",   tc: "#909090" },
  { title: "How to redeem an Analog Bitcoin art piece",     desc: "What happens when you destroy the art and sweep the tokens.",                     url: "https://youtube.com", tag: "REDEMPTION", tc: "#CF6679" },
];

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const mobile = useIsMobile();

  const [account, setAccount]   = useState("");
  const [chainId, setChainId]   = useState("");
  const [cbbtcBal, setCbbtcBal] = useState("0");
  const [ieokBal, setIeokBal]   = useState("0");
  const [divs, setDivs]         = useState("0");
  const [supply, setSupply]     = useState("0");
  const [btcPrice, setBtcPrice] = useState(0);
  const [tab, setTab]           = useState<Tab>("trade");
  const [mode, setMode]         = useState<"buy" | "sell">("buy");

  const [buyAmt, setBuyAmt]     = useState("");
  const [buyS, setBuyS]         = useState<TxState>("idle");
  const [buyM, setBuyM]         = useState("");

  const [sellAmt, setSellAmt]   = useState("");
  const [sellS, setSellS]       = useState<TxState>("idle");
  const [sellM, setSellM]       = useState("");

  const [txTo, setTxTo]         = useState("");
  const [txAmt, setTxAmt]       = useState("");
  const [txS, setTxS]           = useState<TxState>("idle");
  const [txM, setTxM]           = useState("");

  const [wdS, setWdS]           = useState<TxState>("idle");
  const [wdM, setWdM]           = useState("");

  const [insVault, setInsVault] = useState("");
  const [insAsset, setInsAsset] = useState("");
  const [insAmt, setInsAmt]     = useState("");
  const [insOrd, setInsOrd]     = useState("");
  const [insS, setInsS]         = useState<TxState>("idle");
  const [insM, setInsM]         = useState("");

  const [repOrd, setRepOrd]     = useState("");
  const [repS, setRepS]         = useState<TxState>("idle");
  const [repM, setRepM]         = useState("");

  const [vAddr, setVAddr]       = useState("");
  const [vResult, setVResult]   = useState<VaultResult>(null);
  const [vS, setVS]             = useState<TxState>("idle");
  const [vM, setVM]             = useState("");

  const isRegistrar = account.toLowerCase() === VAULT_REGISTRAR.toLowerCase();

  // ─── BTC PRICE ──────────────────────────────────────────────────────────────
  async function fetchBtcPrice() {
    try {
      const res  = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
      const data = await res.json();
      setBtcPrice(data.bitcoin.usd);
    } catch (e) { console.error("BTC price fetch failed", e); }
  }

  // ─── CONNECT ────────────────────────────────────────────────────────────────
  async function connect() {
    if (!window.ethereum) { alert("MetaMask not found"); return; }
    await ensureBase();
    const p = getBrowserProvider();
    const [user] = await p.send("eth_requestAccounts", []);
    setAccount(user);
    const net = await p.getNetwork();
    setChainId(net.chainId.toString());
    await load(p, user);
  }

  // ─── LOAD DATA ──────────────────────────────────────────────────────────────
  async function load(p: ethers.BrowserProvider, user: string) {
    try {
      const cbbtc = new ethers.Contract(CBBTC_ADDRESS, CBBTC_ABI, p);
      const ieok  = new ethers.Contract(IEOK_ADDRESS,  IEOK_ABI,  p);
      const [cb, ib, dv, ts] = await Promise.all([
        cbbtc.balanceOf(user),
        ieok.balanceOf(user),
        ieok.dividendsOf(user),
        ieok.totalSupply(),
      ]);
      setCbbtcBal(cb.toString());
      setIeokBal(ib.toString());
      setDivs(dv.toString());
      setSupply(ts.toString());
    } catch (e) { console.error(e); }
  }

  // ─── BUY ────────────────────────────────────────────────────────────────────
  async function buy() {
    if (!account) { alert("Connect wallet first"); return; }
    if (!buyAmt)  { alert("Enter cbBTC amount");   return; }
    const p     = getBrowserProvider();
    const s     = await p.getSigner();
    const cbbtc = new ethers.Contract(CBBTC_ADDRESS, CBBTC_ABI, s);
    const ieok  = new ethers.Contract(IEOK_ADDRESS,  IEOK_ABI,  s);
    setBuyS("pending"); setBuyM("Checking allowance...");
    try {
      const allowance = await cbbtc.allowance(account, IEOK_ADDRESS);
      if (allowance < BigInt(buyAmt)) {
        setBuyM("Approval needed — confirm in MetaMask...");
        const approveTx = await cbbtc.approve(IEOK_ADDRESS, BigInt("999999999999999999"));
        setBuyM("Approving cbBTC — confirming on chain...");
        await approveTx.wait();
        setBuyM("Approved — now buying IEOK...");
      }
      setBuyM("Confirm purchase in MetaMask...");
      const tx = await ieok.buy(BigInt(buyAmt), BigInt(0));
      setBuyM("Confirming on chain...");
      await tx.wait();
      setBuyS("success"); setBuyM("Purchase confirmed — IEOK tokens received");
      await load(p, account);
    } catch (e: any) { setBuyS("failed"); setBuyM(e.reason || e.message || "Buy failed"); }
  }

  // ─── SELL ───────────────────────────────────────────────────────────────────
  async function sell() {
    if (!account) { alert("Connect wallet first"); return; }
    if (!sellAmt) { alert("Enter IEOK amount");    return; }
    const p    = getBrowserProvider();
    const s    = await p.getSigner();
    const ieok = new ethers.Contract(IEOK_ADDRESS, IEOK_ABI, s);
    setSellS("pending"); setSellM("Awaiting MetaMask...");
    try {
      const tx = await ieok.sell(BigInt(sellAmt), BigInt(0));
      setSellM("Confirming...");
      await tx.wait();
      setSellS("success"); setSellM("Sell confirmed — cbBTC received");
      await load(p, account);
    } catch (e: any) { setSellS("failed"); setSellM(e.reason || e.message || "Sell failed"); }
  }

  // ─── WITHDRAW ───────────────────────────────────────────────────────────────
  async function withdraw() {
    if (!account) { alert("Connect wallet first"); return; }
    const p    = getBrowserProvider();
    const s    = await p.getSigner();
    const ieok = new ethers.Contract(IEOK_ADDRESS, IEOK_ABI, s);
    setWdS("pending"); setWdM("Awaiting MetaMask...");
    try {
      const tx = await ieok.withdraw();
      setWdM("Confirming...");
      await tx.wait();
      setWdS("success"); setWdM("cbBTC dividends sent to your wallet");
      await load(p, account);
    } catch (e: any) { setWdS("failed"); setWdM(e.reason || e.message || "Failed"); }
  }

  // ─── TRANSFER ───────────────────────────────────────────────────────────────
  async function transfer() {
    if (!account)        { alert("Connect wallet first"); return; }
    if (!txTo || !txAmt) { alert("Fill in all fields");   return; }
    const p    = getBrowserProvider();
    const s    = await p.getSigner();
    const ieok = new ethers.Contract(IEOK_ADDRESS, IEOK_ABI, s);
    setTxS("pending"); setTxM("Awaiting MetaMask...");
    try {
      const tx = await ieok.transfer(txTo, BigInt(txAmt));
      setTxM("Confirming...");
      await tx.wait();
      setTxS("success"); setTxM("Transfer complete — zero fee");
      await load(p, account);
    } catch (e: any) { setTxS("failed"); setTxM(e.reason || e.message || "Failed"); }
  }

  // ─── INSCRIBE ───────────────────────────────────────────────────────────────
  async function inscribe() {
    if (!account) { alert("Connect wallet first"); return; }
    if (!insVault || !insAsset || !insAmt || !insOrd) {
      alert("All four fields are required"); return;
    }
    const p    = getBrowserProvider();
    const s    = await p.getSigner();
    const ieok = new ethers.Contract(IEOK_ADDRESS, IEOK_ABI, s);
    setInsS("pending"); setInsM("Awaiting MetaMask...");
    try {
      const tx = await ieok.inscribe(insVault, b32(insAsset), BigInt(insAmt), BigInt(insOrd));
      setInsM("Confirming...");
      await tx.wait();
      setInsS("success"); setInsM(`Vault inscribed — ${insAsset} registered on chain`);
      await load(p, account);
    } catch (e: any) { setInsS("failed"); setInsM(e.reason || e.message || "Inscribe failed"); }
  }

  // ─── REPORT ORDINAL MOVED ───────────────────────────────────────────────────
  async function reportOrdinalMoved() {
    if (!account) { alert("Connect wallet first"); return; }
    if (!repOrd)  { alert("Enter ordinal number"); return; }
    const p    = getBrowserProvider();
    const s    = await p.getSigner();
    const ieok = new ethers.Contract(IEOK_ADDRESS, IEOK_ABI, s);
    setRepS("pending"); setRepM("Awaiting MetaMask...");
    try {
      const tx = await ieok.reportOrdinalMoved(BigInt(repOrd));
      setRepM("Confirming...");
      await tx.wait();
      setRepS("success"); setRepM(`Ordinal #${repOrd} marked as moved — permanent on chain`);
    } catch (e: any) { setRepS("failed"); setRepM(e.reason || e.message || "Report failed"); }
  }

  // ─── CHECK VAULT ────────────────────────────────────────────────────────────
  async function checkVault() {
    if (!vAddr) { alert("Enter a vault address"); return; }
    setVS("pending"); setVM("Querying vault registry...");
    try {
      const p    = getBrowserProvider();
      const ieok = new ethers.Contract(IEOK_ADDRESS, IEOK_ABI, p);

      // Fetch vault status AND dividends in parallel
      const [status, divAmount] = await Promise.all([
        ieok.vaultStatus(vAddr),
        ieok.dividendsOf(vAddr),
      ]);

      const [registered, swept, balance, assetId, ordinalNumber, ordinalMoved, ordinalMovedAt] = status;

      setVResult({
        registered, swept,
        balance:        balance.toString(),
        dividends:      divAmount.toString(),
        assetId:        assetId.toString(),
        ordinalNumber:  ordinalNumber.toString(),
        ordinalMoved,
        ordinalMovedAt: ordinalMovedAt.toString(),
      });
      setVS("idle"); setVM("");
    } catch (e: any) {
      setVS("failed"); setVM("Could not query — check address");
      setVResult(null);
    }
  }

  // ─── EFFECTS ────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchBtcPrice();
    const iv = setInterval(fetchBtcPrice, 60000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!account) return;
    const iv = setInterval(() => load(getBrowserProvider(), account), 10000);
    return () => clearInterval(iv);
  }, [account]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("vault");
    if (v) { setVAddr(v); setTab("vault"); }
  }, []);

  // ─── COMPUTED ───────────────────────────────────────────────────────────────
  const connected    = !!account;
  const correctChain = chainId === CHAIN_ID;
  const bPrev        = buyPreview(buyAmt);
  const sPrev        = sellPreview(sellAmt);
  const cbbtcNum     = Number(cbbtcBal);
  const ieokNum      = Number(ieokBal);
  const divsNum      = Number(divs);
  const supplyNum    = Number(supply);
  const cbbtcUsd     = btcPrice > 0 ? fmtUsd(satsToUsd(cbbtcNum, btcPrice)) : "";
  const ieokUsd      = btcPrice > 0 ? fmtUsd(satsToUsd(ieokNum,  btcPrice)) : "";
  const divsUsd      = btcPrice > 0 ? fmtUsd(satsToUsd(divsNum,  btcPrice)) : "";

  const tabs: { id: Tab; label: string; short: string }[] = [
    { id: "trade",    label: "BUY / SELL",  short: "TRADE"    },
    { id: "transfer", label: "TRANSFER",    short: "SEND"     },
    { id: "vault",    label: "VAULT CHECK", short: "VAULT"    },
    { id: "learn",    label: "LEARN",       short: "LEARN"    },
    ...(isRegistrar ? [{ id: "inscribe" as Tab, label: "INSCRIBE", short: "INSCRIBE" }] : []),
  ];

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <main style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "Arial, sans-serif" }}>

      {/* HEADER */}
      <div style={{
        background: C.panel,
        borderBottom: `1px solid ${C.border}`,
        padding: mobile ? "0 16px" : "0 40px",
        height: mobile ? 60 : 72,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky" as const,
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 18 : 22, letterSpacing: "0.3em", color: C.gold, fontWeight: 700 }}>
            IEOK
          </span>
          {!mobile && (
            <span style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted, letterSpacing: "0.15em" }}>
              IMMUTABLE EDITIONS ORIGIN KEY
            </span>
          )}
          {btcPrice > 0 && (
            <span style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted }}>
              BTC {fmtUsd(btcPrice)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {connected && !mobile && (
            <span style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: correctChain ? C.green : C.red }}>
              {correctChain ? `✓ ${CHAIN_LABEL}` : "⚠ WRONG NETWORK"}
            </span>
          )}
          <button
            onClick={connect}
            style={{
              background: connected ? "transparent" : C.gold,
              color: connected ? C.green : "#000000",
              border: connected ? `1px solid ${C.green}` : "none",
              padding: mobile ? "8px 14px" : "10px 24px",
              fontFamily: "Arial, sans-serif",
              fontSize: mobile ? 11 : 13,
              letterSpacing: "0.15em",
              cursor: "pointer",
              textTransform: "uppercase" as const,
              fontWeight: 700,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {connected ? fmtAddr(account) : "CONNECT"}
          </button>
        </div>
      </div>

      {/* WRONG NETWORK */}
      {connected && !correctChain && (
        <div style={{ background: C.redBg, borderBottom: `1px solid #7a2d3a`, padding: "12px 20px", textAlign: "center" as const }}>
          <span style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: C.red, fontWeight: 700 }}>
            ⚠ Switch MetaMask to {CHAIN_LABEL}
          </span>
        </div>
      )}

      {/* PORTFOLIO CARDS */}
      {connected ? (
        <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 1, background: C.border }}>
            <Card label="cbBTC Balance" value={fmtCbbtc(cbbtcBal)} sub={fmtSats(cbbtcBal)} sub2={cbbtcUsd} />
            <Card label="IEOK Balance"  value={ieokNum.toLocaleString() + " IEOK"} sub={ieokNum.toLocaleString() + " sats"} sub2={ieokUsd} />
            <Card label="Dividends"     value={fmtCbbtc(divs)} sub={divsNum.toLocaleString() + " sats"} sub2={divsUsd} accent />
            <Card label="Total Supply"  value={supplyNum.toLocaleString() + " IEOK"} />
          </div>
        </div>
      ) : (
        <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "28px", textAlign: "center" as const }}>
          <span style={{ fontFamily: "Arial, sans-serif", fontSize: 16, color: C.textMuted, letterSpacing: "0.2em" }}>
            CONNECT WALLET TO SEE YOUR BALANCES
          </span>
        </div>
      )}

      {/* DIVIDENDS BANNER */}
      {connected && divsNum > 0 && (
        <div style={{
          background: C.goldBg,
          borderBottom: `1px solid ${C.goldDim}`,
          padding: mobile ? "14px 16px" : "14px 40px",
          display: "flex",
          flexDirection: mobile ? "column" : "row" as const,
          alignItems: mobile ? "stretch" : "center",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <div>
            <span style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 15 : 17, color: C.gold, fontWeight: 700 }}>
              🪙 {fmtCbbtc(divs)} cbBTC dividends available
            </span>
            {divsUsd && (
              <span style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: C.textMuted, marginLeft: 12 }}>
                {divsUsd}
              </span>
            )}
          </div>
          <div>
            <button
              onClick={withdraw}
              style={{
                width: mobile ? "100%" : "auto",
                background: C.gold,
                color: "#000000",
                border: "none",
                padding: "12px 24px",
                fontFamily: "Arial, sans-serif",
                fontSize: 14,
                letterSpacing: "0.2em",
                cursor: "pointer",
                textTransform: "uppercase" as const,
                fontWeight: 700,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              WITHDRAW NOW
            </button>
            <Status state={wdS} msg={wdM} />
          </div>
        </div>
      )}

      {/* WALLET ADDRESS */}
      {connected && (
        <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: mobile ? "8px 16px" : "8px 40px" }}>
          <span style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: C.textMuted }}>
            {mobile ? fmtAddr(account) : account}
          </span>
        </div>
      )}

      {/* MAIN */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: mobile ? "20px 12px" : "32px 24px" }}>

        {/* TABS */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          borderBottom: `1px solid ${C.border}`,
          marginBottom: 24,
          overflowX: "auto" as const,
          WebkitOverflowScrolling: "touch" as const,
          scrollbarWidth: "none" as const,
        }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flexShrink: 0,
                padding: mobile ? "14px 16px" : "16px 28px",
                fontFamily: "Arial, sans-serif",
                fontSize: mobile ? 12 : 13,
                letterSpacing: "0.15em",
                background: tab === t.id ? C.card : "transparent",
                color: tab === t.id ? C.gold : C.textMuted,
                border: "none",
                borderBottom: tab === t.id ? `2px solid ${C.gold}` : "2px solid transparent",
                cursor: "pointer",
                fontWeight: tab === t.id ? 700 : 400,
                WebkitTapHighlightColor: "transparent",
                whiteSpace: "nowrap" as const,
              }}
            >
              {mobile ? t.short : t.label}
            </button>
          ))}
        </div>

        {/* ── TRADE ── */}
        {tab === "trade" && (
          <div>
            <div style={{ display: "flex", gap: 1, marginBottom: 24, background: C.border, padding: 4 }}>
              {(["buy", "sell"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1,
                    padding: mobile ? "14px" : "16px",
                    fontFamily: "Arial, sans-serif",
                    fontSize: mobile ? 16 : 18,
                    letterSpacing: "0.2em",
                    background: mode === m ? (m === "buy" ? C.gold : C.card) : "transparent",
                    color: mode === m ? (m === "buy" ? "#000000" : C.gold) : C.textMuted,
                    border: mode === m && m === "sell" ? `1px solid ${C.goldDim}` : "none",
                    cursor: "pointer",
                    textTransform: "uppercase" as const,
                    fontWeight: 700,
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  {m === "buy" ? "▲ BUY" : "▼ SELL"}
                </button>
              ))}
            </div>

            {mode === "buy" && (
              <Panel title="Buy IEOK — Fixed Price 1 Sat = 1 IEOK">
                <FeeBadge mobile={mobile} />
                <p style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 15 : 16, color: C.textDim, lineHeight: 1.7, marginBottom: 20 }}>
                  Enter your cbBTC amount and hit Buy. First time buyers will see MetaMask pop up twice — once to approve cbBTC, once to buy. Future purchases are single click.
                </p>
                <Input
                  label="cbBTC amount in satoshis"
                  value={buyAmt}
                  onChange={setBuyAmt}
                  placeholder="10000"
                  type="number"
                  tag="SATS"
                  hint={btcPrice > 0 && buyAmt ? `≈ ${fmtUsd(satsToUsd(Number(buyAmt), btcPrice))} USD` : "10,000 sats = 10,000 IEOK before 7% fee"}
                />
                {bPrev && (
                  <Preview rows={[
                    { label: "7% fee — paid to all IEOK holders", value: bPrev.fee.toLocaleString() + " sats" },
                    { label: "IEOK you receive (1 sat = 1 IEOK)",  value: bPrev.tokens.toLocaleString() + " IEOK" + (btcPrice > 0 ? "  ·  " + fmtUsd(satsToUsd(bPrev.tokens, btcPrice)) : ""), gold: true },
                  ]} />
                )}
                <BigBtn onClick={buy} disabled={!connected}>Buy IEOK</BigBtn>
                <Status state={buyS} msg={buyM} />
              </Panel>
            )}

            {mode === "sell" && (
              <Panel title="Sell IEOK — Fixed Price 1 IEOK = 1 Sat">
                <FeeBadge mobile={mobile} />
                <Input
                  label="IEOK amount to sell"
                  value={sellAmt}
                  onChange={setSellAmt}
                  placeholder="9300"
                  type="number"
                  tag="IEOK"
                  hint={`Your balance: ${ieokNum.toLocaleString()} IEOK`}
                />
                {sPrev && (
                  <Preview rows={[
                    { label: "7% fee — paid to all IEOK holders", value: sPrev.fee.toLocaleString() + " sats" },
                    { label: "cbBTC you receive (1 IEOK = 1 sat)", value: sPrev.out.toLocaleString() + " sats" + (btcPrice > 0 ? "  ·  " + fmtUsd(satsToUsd(sPrev.out, btcPrice)) : ""), gold: true },
                  ]} />
                )}
                <BigBtn onClick={sell} variant="outline" disabled={!connected}>Sell IEOK for cbBTC</BigBtn>
                <Status state={sellS} msg={sellM} />
              </Panel>
            )}
          </div>
        )}

        {/* ── TRANSFER ── */}
        {tab === "transfer" && (
          <Panel title="Transfer IEOK — Zero Fee">
            <p style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 15 : 16, color: C.textDim, lineHeight: 1.7, marginBottom: 24 }}>
              Send IEOK to any wallet with no fee. Dividend yield moves proportionally with the tokens — the receiver earns future yield on what they receive.
            </p>
            <Input label="Recipient wallet address" value={txTo} onChange={setTxTo} placeholder="0x..." hint="Full wallet address of the recipient" />
            <Input label="IEOK amount" value={txAmt} onChange={setTxAmt} placeholder="9300" type="number" tag="IEOK" hint={`Your balance: ${ieokNum.toLocaleString()} IEOK — 1 IEOK = 1 satoshi`} />
            <BigBtn onClick={transfer} disabled={!connected}>Transfer IEOK — Free</BigBtn>
            <Status state={txS} msg={txM} />
          </Panel>
        )}

        {/* ── INSCRIBE — registrar only ── */}
        {tab === "inscribe" && isRegistrar && (
          <div>
            <Panel title="Inscribe Vault — Analog Bitcoin Art Piece">
              <p style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 15 : 16, color: C.textDim, lineHeight: 1.7, marginBottom: 16 }}>
                Register a vault wallet and load it with IEOK in one transaction.
              </p>
              <div style={{ background: C.input, border: `1px solid ${C.border}`, padding: "16px 20px", marginBottom: 24 }}>
                <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: C.textMuted, marginBottom: 12, letterSpacing: "0.2em", fontWeight: 700 }}>
                  HOW IT WORKS
                </div>
                {[
                  "Generate a fresh wallet in MetaMask — click Add Account",
                  "Copy that wallet address into the Vault field below",
                  "Get your Ordinal inscription number from ordinals.com",
                  "Set the IEOK amount — 1 IEOK = 1 satoshi at fixed price",
                  "Hit Inscribe — one transaction registers and loads tokens",
                  "Print the private key and seal it inside the physical art",
                ].map((s, i) => (
                  <div key={i} style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: C.textDim, padding: "5px 0", display: "flex", gap: 12 }}>
                    <span style={{ color: C.gold, flexShrink: 0, fontWeight: 700 }}>{i + 1}.</span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
              <Input label="Vault wallet address (sealed inside the art)" value={insVault} onChange={setInsVault} placeholder="0x..." hint="Generate a fresh wallet in MetaMask — copy the address here" />
              <Input label="Asset ID (max 31 characters)" value={insAsset} onChange={setInsAsset} placeholder="RWI-001" hint="e.g. RWI-001, IE-GENESIS-001, AB-001 — auto converts to bytes32" />
              <Input label="Ordinal inscription number" value={insOrd} onChange={setInsOrd} placeholder="68743291" type="number" hint="The inscription number from ordinals.com — required" />
              <Input
                label="IEOK amount to embed (= satoshis at 1:1)"
                value={insAmt}
                onChange={setInsAmt}
                placeholder="9300"
                type="number"
                tag="IEOK"
                hint={`10,000 sats buy = 9,300 IEOK after fee${btcPrice > 0 && insAmt ? "  ·  " + fmtUsd(satsToUsd(Number(insAmt), btcPrice)) : ""}`}
              />
              <BigBtn onClick={inscribe} disabled={!connected}>Inscribe Vault</BigBtn>
              <Status state={insS} msg={insM} />
            </Panel>

            <Panel title="Report Ordinal Moved — Bitcoin Alert">
              <p style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 15 : 16, color: C.textDim, lineHeight: 1.7, marginBottom: 24 }}>
                When you see a linked Bitcoin Ordinal has moved on ordinals.com — enter its inscription number here to record the alert permanently on Base.
              </p>
              <Input
                label="Ordinal inscription number"
                value={repOrd}
                onChange={setRepOrd}
                placeholder="68743291"
                type="number"
                hint="Verify on ordinals.com before reporting — this is permanent and cannot be undone"
              />
              <BigBtn onClick={reportOrdinalMoved} variant="outline" disabled={!connected}>Report Ordinal Moved</BigBtn>
              <Status state={repS} msg={repM} />
            </Panel>
          </div>
        )}

        {/* ── VAULT ── */}
        {tab === "vault" && (
          <Panel title="Vault Registry — On-Chain Tamper Seal">
            <p style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 15 : 16, color: C.textDim, lineHeight: 1.7, marginBottom: 24 }}>
              Tap an NFC tag on a physical Analog Bitcoin art piece and paste the wallet address below to verify the piece is intact and uncompromised.
            </p>
            <Input label="Vault wallet address" value={vAddr} onChange={setVAddr} placeholder="0x..." />
            <BigBtn onClick={checkVault} variant="outline">Verify Vault Status</BigBtn>
            <Status state={vS} msg={vM} />

            {vResult && (
              <div style={{
                marginTop: 20,
                padding: mobile ? 20 : 28,
                border: `2px solid ${!vResult.registered ? C.border : (vResult.swept || vResult.ordinalMoved) ? "#7a2d3a" : "#2d6a4f"}`,
                background: !vResult.registered ? C.input : (vResult.swept || vResult.ordinalMoved) ? C.redBg : C.greenBg,
              }}>

                {/* PRIMARY STATUS */}
                <div style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 18 : 22, fontWeight: 700, marginBottom: 16, lineHeight: 1.3 }}>
                  {!vResult.registered && <span style={{ color: C.textMuted }}>⚪ NOT A REGISTERED VAULT</span>}
                  {vResult.registered && !vResult.swept && !vResult.ordinalMoved && <span style={{ color: C.green }}>🟢 VAULT INTACT — NEVER ACCESSED</span>}
                  {vResult.registered && vResult.swept && <span style={{ color: C.red }}>🔴 VAULT SWEPT — IEOK HAS MOVED</span>}
                </div>

                {/* ORDINAL ALERT */}
                {vResult.registered && vResult.ordinalMoved && (
                  <div style={{ marginBottom: 20, padding: "14px 18px", background: C.orangeBg, border: `1px solid ${C.orange}` }}>
                    <div style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 16 : 18, fontWeight: 700, color: C.orange, marginBottom: 6 }}>
                      ⚠️ BITCOIN ORDINAL HAS MOVED
                    </div>
                    <div style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: C.textDim, lineHeight: 1.7 }}>
                      The Bitcoin Ordinal inscription linked to this art piece has been reported as transferred on the Bitcoin blockchain.
                      {vResult.ordinalMovedAt !== "0" && (
                        <span> Reported at: <strong style={{ color: C.orange }}>{fmtTs(vResult.ordinalMovedAt)}</strong></span>
                      )}
                    </div>
                    {Number(vResult.ordinalNumber) > 0 && (
                      <a
                        href={`https://ordinals.com/inscription/${vResult.ordinalNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.orange, display: "block", marginTop: 8, fontWeight: 700 }}
                      >
                        VERIFY ON ORDINALS.COM ↗
                      </a>
                    )}
                  </div>
                )}

                {vResult.registered && (
                  <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 20 }}>

                    <div>
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted, letterSpacing: "0.2em", marginBottom: 6, textTransform: "uppercase" as const }}>Vault Address</div>
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.textDim, wordBreak: "break-all" as const }}>{vAddr}</div>
                    </div>

                    {/* IEOK BALANCE + USD */}
                    <div>
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted, letterSpacing: "0.2em", marginBottom: 6, textTransform: "uppercase" as const }}>IEOK Balance</div>
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 20 : 24, color: C.text, fontWeight: 700 }}>
                        {Number(vResult.balance).toLocaleString()} IEOK
                      </div>
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.textMuted, marginTop: 4 }}>
                        = {Number(vResult.balance).toLocaleString()} satoshis
                      </div>
                      {btcPrice > 0 && (
                        <div style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: C.green, marginTop: 4, fontWeight: 700 }}>
                          ≈ {fmtUsd(satsToUsd(Number(vResult.balance), btcPrice))} USD
                        </div>
                      )}
                    </div>

                    {/* DIVIDENDS + USD */}
                    {Number(vResult.dividends) > 0 && (
                      <div style={{ gridColumn: mobile ? "1" : "1 / -1" }}>
                        <div style={{ background: C.goldBg, border: `1px solid ${C.goldDim}`, padding: "16px 20px" }}>
                          <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted, letterSpacing: "0.2em", marginBottom: 8, textTransform: "uppercase" as const }}>
                            cbBTC Yield Accumulated
                          </div>
                          <div style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 18 : 22, color: C.gold, fontWeight: 700 }}>
                            🪙 {fmtCbbtc(vResult.dividends)}
                          </div>
                          <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.textMuted, marginTop: 4 }}>
                            = {Number(vResult.dividends).toLocaleString()} satoshis
                            {btcPrice > 0 && (
                              <span style={{ color: C.green, marginLeft: 8, fontWeight: 700 }}>
                                ≈ {fmtUsd(satsToUsd(Number(vResult.dividends), btcPrice))} USD
                              </span>
                            )}
                          </div>
                          {btcPrice > 0 && (
                            <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.textMuted, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.goldDim}` }}>
                              Total redeemable value:{" "}
                              <strong style={{ color: C.gold }}>
                                {fmtUsd(satsToUsd(Number(vResult.balance) + Number(vResult.dividends), btcPrice))} USD
                              </strong>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div>
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted, letterSpacing: "0.2em", marginBottom: 6, textTransform: "uppercase" as const }}>Asset ID</div>
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 16, color: C.gold, wordBreak: "break-all" as const, fontWeight: 700 }}>{vResult.assetId}</div>
                    </div>

                    {Number(vResult.ordinalNumber) > 0 && (
                      <div>
                        <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted, letterSpacing: "0.2em", marginBottom: 8, textTransform: "uppercase" as const }}>Bitcoin Ordinal</div>
                        <a
                          href={`https://ordinals.com/inscription/${vResult.ordinalNumber}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: "block", background: C.goldBg, border: `1px solid ${C.goldDim}`, padding: "14px 18px", fontFamily: "Arial, sans-serif", fontSize: 15, color: C.gold, textDecoration: "none", textAlign: "center" as const, letterSpacing: "0.1em", fontWeight: 700 }}
                        >
                          VIEW ORDINAL #{vResult.ordinalNumber} ON ORDINALS.COM ↗
                        </a>
                      </div>
                    )}

                    {vResult.swept && (
                      <div style={{ gridColumn: "1 / -1", padding: "14px 18px", background: C.redBg, border: `1px solid #7a2d3a` }}>
                        <div style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: C.red, lineHeight: 1.7 }}>
                          ⚠ Check the VaultSwept event on Basescan for the exact timestamp. Compare against the sale or shipping date to determine if this was legitimate redemption or the piece was compromised in transit.
                        </div>
                        <a
                          href={`${BLOCK_EXPLORER}/address/${IEOK_ADDRESS}#events`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.red, display: "block", marginTop: 8, fontWeight: 700 }}
                        >
                          VIEW VAULTSWEPT EVENTS ON BASESCAN ↗
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {!vResult.registered && (
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 15, color: C.textMuted }}>
                    This address is not registered in the Analog Bitcoin vault registry. It is not an authenticated art piece.
                  </div>
                )}

                <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted, letterSpacing: "0.2em", marginBottom: 12, textTransform: "uppercase" as const }}>
                    Related Links
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                    {[
                      { label: "AnalogBitcoin.com — About this project",           url: "https://analogbitcoin.com"                 },
                      { label: "ImmutableEditions.com — Art collection",           url: "https://immutableeditions.com"             },
                      { label: "RealWorldInscriptions.com — Inscription registry", url: "https://realworldinscriptions.com"         },
                      { label: "Ordinals.com — Bitcoin Ordinal inscriptions",      url: "https://ordinals.com"                      },
                      { label: "View contract and events on Basescan",             url: `${BLOCK_EXPLORER}/address/${IEOK_ADDRESS}` },
                    ].map(link => (
                      <a
                        key={link.url}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: C.gold, textDecoration: "none", padding: "10px 14px", background: C.card, border: `1px solid ${C.border}`, display: "block", fontWeight: 700 }}
                      >
                        {link.label} ↗
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Panel>
        )}

        {/* ── LEARN ── */}
        {tab === "learn" && (
          <Panel title="Learn — Video Guides">
            <p style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 15 : 16, color: C.textDim, lineHeight: 1.7, marginBottom: 24 }}>
              Everything you need to understand IEOK, Analog Bitcoin, and how to participate. Replace the URLs with your actual YouTube video links when ready.
            </p>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
              {VIDEOS.map((v, i) => (
                <a
                  key={i}
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "flex", gap: 16, padding: "18px 20px", background: C.card, border: `1px solid ${C.border}`, textDecoration: "none", alignItems: "flex-start" }}
                >
                  <div style={{ width: 44, height: 44, background: "#FF0000", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18, color: "#FFFFFF" }}>▶</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", flexWrap: "wrap" as const, alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 14 : 16, color: C.text, fontWeight: 700, lineHeight: 1.3 }}>{v.title}</div>
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 10, color: v.tc, border: `1px solid ${v.tc}`, padding: "2px 8px", flexShrink: 0, letterSpacing: "0.15em" }}>{v.tag}</div>
                    </div>
                    <div style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 13 : 14, color: C.textMuted, lineHeight: 1.6 }}>{v.desc}</div>
                  </div>
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 18, color: C.textMuted, flexShrink: 0 }}>↗</div>
                </a>
              ))}
            </div>
          </Panel>
        )}

        {/* CONTRACT ADDRESSES */}
        <div style={{ marginTop: 24, background: C.panel, border: `1px solid ${C.border}`, padding: "16px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            {[
              { label: "IEOK Contract",  value: IEOK_ADDRESS,  color: C.gold      },
              { label: "cbBTC Contract", value: CBBTC_ADDRESS, color: C.textMuted },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontFamily: "Arial, sans-serif", fontSize: 10, color: C.textMuted, letterSpacing: "0.2em", textTransform: "uppercase" as const, marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: item.color, wordBreak: "break-all" as const }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ textAlign: "center" as const, padding: "32px 0 16px", fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted, letterSpacing: "0.2em", lineHeight: 2 }}>
          NO ADMIN — NO GOVERNANCE — IMMUTABLE<br />
          ANALOGBITCOIN.COM — IMMUTABLEEDITIONS.COM — REALWORLDINSCRIPTIONS.COM
        </div>

      </div>
    </main>
  );
}
