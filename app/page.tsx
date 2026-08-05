"use client";
// @ts-ignore
import Head from "next/head";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { WK_ADDRESS, CBBTC_ADDRESS } from "@/lib/contracts";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";

const WK_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function recirculationOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function buy(uint256 cbbtcAmount, uint256 minTokens) external",
  "function recirculate() external",
  "function sell(uint256 tokens, uint256 minCbbtc) external",
  "function transfer(address to, uint256 tokens) external returns (bool)",
  "function claim() external",
  "function inscribe(address vault, bytes32 assetId, uint256 cbbtcAmount, uint256 ordinalNumber, string inscriptionId) external",
  "function reportOrdinalMoved(uint256 ordinalNumber) external",
  "function vaultStatus(address vault) view returns (bool registered, bool swept, uint256 balance, bytes32 assetId)",
  "function vaultOrdinalStatus(address vault) view returns (uint256 ordinalNumber, bool hasOrdinal, bool ordinalMoved, uint256 ordinalMovedAt, string inscriptionId)",
];

const CBBTC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const PUBLIC_RPC = "https://sepolia.base.org";

type TxState = "idle" | "pending" | "success" | "failed";
type Tab = "home" | "gallery" | "vault" | "keychain" | "conduct" | "inscribe";
type VaultResult = {
  registered: boolean;
  swept: boolean;
  balance: string;
  recirculation: string;
  assetId: string;
  ordinalNumber: string;
  hasOrdinal: boolean;
  ordinalMoved: boolean;
  ordinalMovedAt: string;
  inscriptionId: string;
} | null;

// ─── Vault ledger palette — steel blue on ink ────────────────────────────────
const LIGHT = {
  bg:       "#FAF9F6",
  panel:    "#F1EFEA",
  card:     "#FFFFFF",
  input:    "#F1EFEA",
  border:   "#DAD5CB",
  blue:     "#2E6B94",
  text:     "#14171C",
  textDim:  "#3C424B",
  textMuted:"#6E7681",
  green:    "#1F7A5C",
  red:      "#9E2B2B",
  orange:   "#B5701F",
  greenBg:  "rgba(31,122,92,0.10)",
  redBg:    "rgba(158,43,43,0.10)",
  orangeBg: "rgba(181,112,31,0.10)",
  blueBg:   "rgba(46,107,148,0.10)",
  shadow:   "0 1px 2px rgba(20,23,28,0.06)",
};

const DARK = {
  bg:       "#14171C",
  panel:    "#1C2027",
  card:     "#1C2027",
  input:    "#171A20",
  border:   "#2B313B",
  blue:     "#4A90C2",
  text:     "#E8E4DC",
  textDim:  "#B4AFA5",
  textMuted:"#6E7681",
  green:    "#4FA88A",
  red:      "#C44444",
  orange:   "#D9944A",
  greenBg:  "rgba(79,168,138,0.14)",
  redBg:    "rgba(196,68,68,0.14)",
  orangeBg: "rgba(217,148,74,0.14)",
  blueBg:   "rgba(74,144,194,0.14)",
  shadow:   "0 1px 3px rgba(0,0,0,0.5)",
};

const VAULT_REGISTRAR = "0x10DB4bf0C9e7c14f320C4e831CC85fFD8D15BE6D";
const CHAIN_ID        = "84532";
const CHAIN_LABEL     = "BASE SEPOLIA";
const BLOCK_EXPLORER  = "https://sepolia.basescan.org";

const SatoshisToBtc = (s: number) => s / 1e8;
const SatoshisToUsd = (s: number, p: number) => SatoshisToBtc(s) * p;
const fmtUsd    = (n: number) => "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtAddr   = (v: string) => v ? v.slice(0, 6) + "..." + v.slice(-4) : "—";
const fmtCbbtc  = (v: string) => (Number(v) / 1e8).toFixed(6) + " cbBTC";
const fmtSats   = (v: string) => Number(v).toLocaleString() + " Satoshis";
const fmtOK    = (v: string) => Number(v).toLocaleString() + " WK";
const fmtOnlyNum = (v: string) => Number(v).toLocaleString();
const fmtTs     = (ts: string) => { const n = Number(ts); if (!n) return "—"; return new Date(n * 1000).toLocaleString(); };

function preview7(Satoshis: string) {
  const n = Number(Satoshis);
  if (!n) return null;
  const fee = Math.floor(n * 7 / 100);
  return { fee, out: n - fee };
}
function b32(str: string) { return ethers.encodeBytes32String(str.slice(0, 31)); }
function decodeAssetId(raw: string) {
  if (!raw) return "";
  try {
    // Stored on-chain as bytes32. If it's a hex string, decode it back to text.
    if (raw.startsWith("0x")) {
      if (/^0x0*$/.test(raw)) return "";
      return ethers.decodeBytes32String(raw);
    }
    return raw;
  } catch {
    return "";
  }
}

const useIsMobile = () => {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    // Inject Oswald font
  if (typeof document !== "undefined" && !document.getElementById("vault-fonts")) {
    const link = document.createElement("link");
    link.id = "vault-fonts";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }

  return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
};

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2"/>
      <line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function OrdinalPreview({ ordinalNumber, inscriptionId, mobile, borderColor }: { ordinalNumber: string; inscriptionId: string; mobile: boolean; borderColor: string }) {
  if (!inscriptionId) return null;

  return (
    <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}>
      <a href={`https://ordinals.com/inscription/${inscriptionId}`} target="_blank" rel="noopener noreferrer">
        <img
          src={`https://ordinals.com/content/${inscriptionId}`}
          alt={`Origin Key #${ordinalNumber}`}
          style={{ maxWidth: mobile ? 280 : 360, width: "100%", height: "auto", borderRadius: 8, border: `1px solid ${borderColor}`, objectFit: "contain" }}
          onError={(e: any) => { 
            e.target.onerror = null;
            e.target.style.display = "none";
          }}
        />
      </a>
    </div>
  );
}

function Keyhole({ size = 36, dark = false }: { size?: number; dark?: boolean }) {
  const ratio = 527 / 341;   // native aspect of keyhole.png
  const h = size * 1.22;     // matches SkeletonKey's optical height
  const w = h / ratio;
  return (
    <img
      src="/keyhole.png"
      width={w}
      height={h}
      alt="The Glass Vault"
      style={{ display: "block", objectFit: "contain", opacity: 0.9, filter: dark ? "invert(1)" : "none" }}
    />
  );
}

function SkeletonKey({ size = 28, dark = false }: { size?: number; dark?: boolean }) {
  const ratio = 190 / 86;
  const w = size * 0.55;
  const h = w * ratio;
  return (
    <img
      src="/okp-logo.png"
      width={w}
      height={h}
      alt="Witness Key"
      style={{ display: "block", objectFit: "contain", opacity: 0.85, filter: dark ? "invert(1)" : "none" }}
    />
  );
}

function CbbtcLogo({ size = 20 }: { size?: number }) {
  return (
    <img
      src="/coinbase-wrapped-btc.png"
      width={size}
      height={size}
      alt="cbBTC"
      style={{ display: "block", flexShrink: 0 }}
    />
  );
}

function Status({ state, msg, theme }: { state: TxState; msg: string; theme?: typeof LIGHT }) {
  if (state === "idle" || !msg) return null;
  const T = theme || LIGHT;
  const cfg = {
    pending: { bg: T.blueBg,  border: T.blue,  color: T.blue,  icon: "⏳" },
    success: { bg: T.greenBg, border: T.green,  color: T.green, icon: "✓"  },
    failed:  { bg: T.redBg,   border: T.red,    color: T.red,   icon: "✗"  },
    idle:    { bg: "",         border: "",        color: "",       icon: ""   },
  }[state];
  return (
    <div style={{ marginTop: 12, padding: "14px 18px", background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8 }}>
      <span style={{ color: cfg.color, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 15 }}>{cfg.icon} {msg}</span>
    </div>
  );
}

function FeeBadge({ mobile, theme }: { mobile: boolean; theme?: typeof LIGHT }) {
  const T = theme || LIGHT;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.blueBg, border: `1px solid ${T.blue}`, borderRadius: 8, padding: mobile ? "10px 14px" : "12px 18px", marginBottom: 24 }}>
      <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 18, color: T.blue }}>◈</span>
      <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: mobile ? 13 : 14, color: T.blue, fontWeight: 600 }}>
        7% fee on every buy and sell — recirculated instantly to all Witness Key holders as cbBTC
      </span>
    </div>
  );
}

function Card({ label, value, sub, sub2, accent, theme }: { label: string; value: string; sub?: string; sub2?: string; accent?: boolean; theme?: typeof LIGHT }) {
  const T = theme || LIGHT;
  return (
    <div style={{ background: T.card, border: `1px solid ${T.blue}`, borderTop: `3px solid ${T.blue}`, borderRadius: "0 0 8px 8px", padding: "12px 16px", flex: 1, minWidth: 0, boxShadow: T.shadow }}>
      <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, letterSpacing: "0.1em", color: T.textMuted, textTransform: "uppercase" as const, marginBottom: 10, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 22, fontWeight: 700, color: accent ? T.blue : T.text, lineHeight: 1, wordBreak: "break-all" as const }}>{value}</div>
      {sub  && <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, color: T.textMuted, marginTop: 6 }}>{sub}</div>}
      {sub2 && <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, color: T.green, marginTop: 3, fontWeight: 600 }}>{sub2}</div>}
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = "text", hint, tag, theme }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; hint?: string; tag?: string; theme?: typeof LIGHT;
}) {
  const T = theme || LIGHT;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, color: T.textDim, marginBottom: 8, fontWeight: 600 }}>{label}</div>
      <div style={{ position: "relative" as const }}>
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{ width: "100%", background: T.input, border: `2px solid ${T.text}`, borderRadius: 8, color: T.text, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 14, padding: tag ? "8px 65px 8px 10px" : "8px 10px", outline: "none", boxSizing: "border-box" as const, WebkitAppearance: "none" as const }}
          onFocus={e => e.target.style.borderColor = T.blue}
          onBlur={e => e.target.style.borderColor = T.text}
        />
        {tag && <div style={{ position: "absolute" as const, right: 16, top: "50%", transform: "translateY(-50%)", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, color: T.blue, fontWeight: 700 }}>{tag}</div>}
      </div>
      {hint && <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: T.textMuted, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

function Preview({ rows, theme }: { rows: { label: string; value: string; blue?: boolean }[]; theme?: typeof LIGHT }) {
  const T = theme || LIGHT;
  return (
    <div style={{ background: T.blueBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "14px 18px", marginBottom: 12 }}>
      {rows.map((r, i) => (
        <div key={i}>
          {i > 0 && i === rows.length - 1 && <div style={{ height: 1, background: T.border, margin: "10px 0" }} />}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", gap: 12 }}>
            <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 14, color: T.textMuted }}>{r.label}</span>
            <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 15, color: r.blue ? T.blue : T.textDim, fontWeight: r.blue ? 700 : 400, flexShrink: 0 }}>{r.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function BigBtn({ onClick, children, variant = "blue", disabled = false, theme }: {
  onClick: () => void; children: React.ReactNode; variant?: "blue" | "outline"; disabled?: boolean; theme?: typeof LIGHT;
}) {
  const T = theme || LIGHT;
  const v = { blue: { bg: T.blue, color: "#FFFFFF", border: "none" }, outline: { bg: "transparent", color: T.blue, border: `2px solid ${T.blue}` } }[variant];
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: "100%", background: v.bg, color: v.color, border: v.border, borderRadius: 8, padding: "10px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, letterSpacing: "0.05em", textTransform: "uppercase" as const, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, marginBottom: 4, fontWeight: 700, WebkitTapHighlightColor: "transparent", boxShadow: disabled ? "none" : T.shadow }}>
      {children}
    </button>
  );
}

function Panel({ title, children, theme }: { title: string; children: React.ReactNode; theme?: typeof LIGHT }) {
  const T = theme || LIGHT;
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px", marginBottom: 8, boxShadow: T.shadow }}>
      <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 16, color: T.blue, marginBottom: 20, fontWeight: 700 }}>{title}</div>
      {children}
    </div>
  );
}


// ─── APPROVE HELPER — fully awaits confirmation + 1s delay for wallet sync ───
async function ensureAllowance(
  cbbtc: ethers.Contract,
  owner: string,
  spender: string,
  amount: bigint,
  setMsg: (m: string) => void
) {
  const allowance = await cbbtc.allowance(owner, spender);
  if (allowance >= amount) return;
  setMsg("Approval needed — confirm in your wallet...");
  const tx = await cbbtc.approve(spender, BigInt("100000000")); // 1 BTC max approval
  setMsg("Approving cbBTC — waiting for confirmation...");
  await tx.wait();
  // Small delay — gives Coinbase Wallet and Phantom time to sync approval state
  await new Promise(resolve => setTimeout(resolve, 1000));
  setMsg("Approved ✓");
}

export default function Home() {
  const mobile = useIsMobile();
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("wk-theme");
      if (saved === "light") return false;
      return true; // default dark
    }
    return true;
  });
  const C = darkMode ? DARK : LIGHT;

  useEffect(() => {
    localStorage.setItem("wk-theme", darkMode ? "dark" : "light");
    document.body.style.background = darkMode ? "#1A1D24" : "#FFFFFF";
    document.documentElement.style.overflowY = "scroll";
  }, [darkMode]);

  // ─── Wagmi hooks replace manual connect ────────────────────────────────────
  const { address: account, isConnected: connected, chain } = useAccount();
  const { data: walletClient }  = useWalletClient();
  const publicClient            = usePublicClient();

  const [cbbtcBal, setCbbtcBal] = useState("0");
  const [oktBal, setOktBal]     = useState("0");
  const [divs, setDivs]         = useState("0");
  const [supply, setSupply]     = useState("0");
  const [btcPrice, setBtcPrice] = useState(0);
  const [tab, setTab]           = useState<Tab>("home");
  const [mode, setMode]         = useState<"buy" | "sell">("buy");

  const [isApproved, setIsApproved] = useState(false);
  const [appS, setAppS]           = useState<TxState>("idle");
  const [appM, setAppM]           = useState("");
  const [buyAmt, setBuyAmt]       = useState("");
  const [buyS, setBuyS]         = useState<TxState>("idle");
  const [buyM, setBuyM]         = useState("");

  const [sellAmt, setSellAmt]   = useState("");
  const [showSellWarning, setShowSellWarning] = useState(false);
  const [sellS, setSellS]       = useState<TxState>("idle");
  const [sellM, setSellM]       = useState("");

  const [txTo, setTxTo]         = useState("");
  const [txAmt, setTxAmt]       = useState("");
  const [txS, setTxS]           = useState<TxState>("idle");
  const [txM, setTxM]           = useState("");

  const [wdS, setWdS]           = useState<TxState>("idle");
  const [wdM, setWdM]           = useState("");
  const [rvS, setRvS]           = useState<TxState>("idle");
  const [rvM, setRvM]           = useState("");

  const [insVault, setInsVault] = useState("");
  const [insAsset, setInsAsset] = useState("");
  const [insCbbtc, setInsCbbtc] = useState("");
  const [insOrd, setInsOrd]     = useState("");
  const [insInsId, setInsInsId]   = useState("");
  const [galArtist, setGalArtist]     = useState("");
  const [galBio, setGalBio]           = useState("");
  const [galCollection, setGalCollection] = useState("");
  const [galColDesc, setGalColDesc]   = useState("");
  const [galPieceName, setGalPieceName]   = useState("");
  const [galType, setGalType]             = useState("original");
  const [galEdition, setGalEdition]       = useState("1 of 1");
  const [galPrivate, setGalPrivate]       = useState(false);
  const [galPassword, setGalPassword]     = useState("");
  const [galEntry, setGalEntry]           = useState("");
  const [galShopify, setGalShopify]       = useState("");
  const [insS, setInsS]         = useState<TxState>("idle");
  const [insM, setInsM]         = useState("");

  const [repOrd, setRepOrd]     = useState("");
  const [repS, setRepS]         = useState<TxState>("idle");
  const [repM, setRepM]         = useState("");

  const [vAddr, setVAddr]       = useState("");
  const [vResult, setVResult]   = useState<VaultResult>(null);
  const [vS, setVS]             = useState<TxState>("idle");
  const [vM, setVM]             = useState("");
  const [autoChecked, setAutoChecked] = useState(false);

  // Gallery state
  const [galleryData, setGalleryData] = useState<any>(null);
  const [vaultMode, setVaultMode] = useState<"keychain" | "conduct" | "checker">("checker");
  const [galleryView, setGalleryView] = useState<"artists" | "collections" | "pieces">("collections");
  const [selectedArtist, setSelectedArtist] = useState<any>(null);
  const [selectedCollection, setSelectedCollection] = useState<any>(null);
  const [selectedPiece, setSelectedPiece] = useState<any>(null);
  const [galleryPassword, setGalleryPassword] = useState("");
  const [unlockedCollections, setUnlockedCollections] = useState<Set<string>>(new Set());
  const [swapMode, setSwapMode] = useState<"buy" | "sell" | "transfer">("buy");

  const correctChain = chain?.id === Number(CHAIN_ID);

  async function fetchBtcPrice() {
    // Try CoinGecko → Binance → Kraken in order
    try {
      const res  = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
      const data = await res.json();
      if (data?.bitcoin?.usd) { setBtcPrice(data.bitcoin.usd); return; }
    } catch (e) { /* try next */ }
    try {
      const res  = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
      const data = await res.json();
      if (data?.price) { setBtcPrice(parseFloat(data.price)); return; }
    } catch (e) { /* try next */ }
    try {
      const res  = await fetch("https://api.kraken.com/0/public/Ticker?pair=XBTUSD");
      const data = await res.json();
      const price = data?.result?.XXBTZUSD?.c?.[0];
      if (price) { setBtcPrice(parseFloat(price)); return; }
    } catch (e) { console.error("BTC price unavailable — all sources failed"); }
  }

  async function load(user: string) {
    try {
      const provider = new ethers.JsonRpcProvider(PUBLIC_RPC);
      const cbbtc = new ethers.Contract(CBBTC_ADDRESS, CBBTC_ABI, provider);
      const wk   = new ethers.Contract(WK_ADDRESS,  WK_ABI,   provider);
      const [cb, ob, dv, ts] = await Promise.all([
        cbbtc.balanceOf(user), wk.balanceOf(user),
        wk.recirculationOf(user), wk.totalSupply(),
      ]);
      setCbbtcBal(cb.toString()); setOktBal(ob.toString());
      setDivs(dv.toString()); setSupply(ts.toString());
    } catch (e) { console.error(e); }
  }

  // ─── Helper: get ethers signer from wagmi walletClient ──────────────────
  function getSigner() {
    if (!walletClient) throw new Error("Wallet not connected");
    const { account: acc, chain: ch, transport } = walletClient;
    const network = { chainId: ch.id, name: ch.name };
    const provider = new ethers.BrowserProvider(transport, network);
    return provider.getSigner(acc.address);
  }

  async function approveCbbtc() {
    if (!account) { alert("Connect wallet first"); return; }
    if (!buyAmt)  { alert("Enter cbBTC amount first"); return; }
    const s = await getSigner();
    const cbbtc = new ethers.Contract(CBBTC_ADDRESS, CBBTC_ABI, s);
    setAppS("pending"); setAppM("Confirm approval in your wallet...");
    try {
      const tx = await cbbtc.approve(WK_ADDRESS, BigInt("100000000")); // 1 BTC max approval
      setAppM("Approving — waiting for confirmation...");
      await tx.wait();
      await new Promise(resolve => setTimeout(resolve, 1500));
      setIsApproved(true);
      setAppS("success"); setAppM("cbBTC approved ✓ — now tap Acquire Witness Keys");
    } catch (e: any) { setAppS("failed"); setAppM(e.reason || e.message || "Approval failed"); }
  }

  async function buy() {
    if (!account) { alert("Connect wallet first"); return; }
    if (!buyAmt)  { alert("Enter cbBTC amount");   return; }
    if (Number(buyAmt) < 100) { alert("Minimum buy is 100 Satoshis"); return; }
    const s = await getSigner();
    const cbbtc = new ethers.Contract(CBBTC_ADDRESS, CBBTC_ABI, s);
    const wk   = new ethers.Contract(WK_ADDRESS,  WK_ABI,   s);
    setBuyS("pending"); setBuyM("Approving cbBTC...");
    try {
      // Step 1: Approve exact amount
      const approveTx = await cbbtc.approve(WK_ADDRESS, BigInt(buyAmt));
      await approveTx.wait();
      setBuyM("Approved — acquiring Witness Keys...");
    } catch (e: any) {
      setBuyS("failed");
      const msg = e.reason || e.message || "";
      if (msg.includes("user rejected") || msg.includes("User denied")) {
        setBuyM("Transaction cancelled.");
      } else {
        setBuyM("Approval failed — try again.");
      }
      return;
    }
    try {
      // Step 2: Buy — small delay to let approval propagate
      await new Promise(r => setTimeout(r, 1500));
      const tx = await wk.buy(BigInt(buyAmt), BigInt(0));
      setBuyM("Confirming on chain...");
      await tx.wait();
      setBuyS("success"); setBuyM("Purchase confirmed — Witness Keys received");
      if (account) await load(account);
    } catch (e: any) {
      setBuyS("failed");
      const msg = e.reason || e.message || "";
      if (msg.includes("Minimum 100 Satoshis")) {
        setBuyM("Minimum purchase is 100 Satoshis.");
      } else if (msg.includes("user rejected") || msg.includes("User denied")) {
        setBuyM("Transaction cancelled.");
      } else if (msg.includes("missing revert") || msg.includes("CALL_EXCEPTION")) {
        setBuyM("Transaction failed — make sure you have enough cbBTC and try again.");
      } else if (msg.includes("coalesce") || msg.includes("Unexpected error") || msg.includes("-32603") || msg.includes("insufficient funds")) {
        setBuyM("This wallet needs ETH on Base to pay gas fees. Send a small amount of ETH first.");
      } else {
        setBuyM("Buy failed — check your cbBTC balance and try again.");
      }
    }
  }

  async function sell() {
    if (!account) { alert("Connect wallet first"); return; }
    if (!sellAmt) { alert("Enter Witness Key amount");     return; }
    const s = await getSigner();
    const wk = new ethers.Contract(WK_ADDRESS, WK_ABI, s);
    setSellS("pending"); setSellM("Awaiting wallet...");
    try {
      await (await wk.sell(BigInt(sellAmt), BigInt(0))).wait();
      setSellS("success"); setSellM("");
      if (account) await load(account);
    } catch (e: any) {
      setSellS("failed");
      const msg = e.reason || e.message || "";
      if (msg.includes("Minimum 100")) {
        setSellM("Minimum 100 Witness Keys to sell.");
      } else if (msg.includes("Cannot sell entire supply")) {
        setSellM("Cannot sell — at least 1 Witness Key must remain in total supply. Try a smaller amount.");
      } else if (msg.includes("Insufficient balance")) {
        setSellM("You don't have enough Witness Keys to sell that amount.");
      } else if (msg.includes("Slippage")) {
        setSellM("Price moved — try again or reduce your amount.");
      } else if (msg.includes("user rejected") || msg.includes("User denied")) {
        setSellM("Transaction cancelled.");
      } else if (msg.includes("coalesce") || msg.includes("Unexpected error") || msg.includes("-32603") || msg.includes("insufficient funds")) {
        setSellM("This wallet needs ETH on Base to pay gas fees. Send a small amount of ETH first.");
      } else if (msg.includes("CALL_EXCEPTION") || msg.includes("missing revert")) {
        setSellM("Minimum 100 Witness Keys to sell.");
      } else {
        setSellM("Sell failed — check your balance and try again.");
      }
    }
  }

  async function claim() {
    if (!account) { alert("Connect wallet first"); return; }
    const s = await getSigner();
    const wk = new ethers.Contract(WK_ADDRESS, WK_ABI, s);
    setWdS("pending"); setWdM("Awaiting wallet...");
    try {
      await (await wk.claim()).wait();
      setWdS("success"); setWdM("cbBTC recirculation sent to your wallet");
      if (account) await load(account);
    } catch (e: any) {
      setWdS("failed");
      const msg = e.reason || e.message || "";
      if (msg.includes("No recirculation") || msg.includes("No proceeds")) {
        setWdM("No recirculation to collect.");
      } else if (msg.includes("user rejected") || msg.includes("User denied")) {
        setWdM("Transaction cancelled.");
      } else if (msg.includes("coalesce") || msg.includes("Unexpected error") || msg.includes("-32603") || msg.includes("insufficient funds")) {
        setWdM("This wallet needs ETH on Base to pay gas fees. Send a small amount of ETH to this address first.");
      } else {
        setWdM("Claim failed — try again.");
      }
    }
  }

  async function recirculate() {
    if (!account) { alert("Connect wallet first"); return; }
    const s = await getSigner();
    const wk = new ethers.Contract(WK_ADDRESS, WK_ABI, s);
    setRvS("pending"); setRvM("Awaiting wallet...");
    try {
      await (await wk.recirculate()).wait();
      setRvS("success"); setRvM("Recirculated — new Witness Keys received");
      if (account) await load(account);
    } catch (e: any) {
      setRvS("failed");
      const msg = e.reason || e.message || "";
      if (msg.includes("Minimum 100 Satoshis") || msg.includes("missing revert") || msg.includes("CALL_EXCEPTION")) {
        setRvM("You need at least 100 Satoshis of recirculation to recirculate.");
      } else if (msg.includes("user rejected") || msg.includes("User denied")) {
        setRvM("Transaction cancelled.");
      } else {
        setRvM("Repurchase failed — try again.");
      }
    }
  }

  async function transfer() {
    if (!account || !txTo || !txAmt) { alert("Fill in all fields"); return; }
    const s = await getSigner();
    const wk = new ethers.Contract(WK_ADDRESS, WK_ABI, s);
    setTxS("pending"); setTxM("Awaiting wallet...");
    try {
      await (await wk.transfer(txTo, BigInt(txAmt))).wait();
      setTxS("success"); setTxM("Transfer complete — zero fee");
      if (account) await load(account);
    } catch (e: any) {
      setTxS("failed");
      const msg = e.reason || e.message || "";
      if (msg.includes("Zero tokens") || msg.includes("CALL_EXCEPTION") || msg.includes("missing revert")) {
        setTxM("Enter an amount greater than zero to transfer.");
      } else if (msg.includes("Zero address")) {
        setTxM("Enter a valid wallet address to transfer to.");
      } else if (msg.includes("Insufficient balance")) {
        setTxM("You don't have enough Witness Keys to transfer that amount.");
      } else if (msg.includes("user rejected") || msg.includes("User denied")) {
        setTxM("Transaction cancelled.");
      } else if (msg.includes("coalesce") || msg.includes("Unexpected error") || msg.includes("-32603") || msg.includes("insufficient funds")) {
        setTxM("This wallet needs ETH on Base to pay gas fees. Send a small amount of ETH first.");
      } else {
        setTxM("Transfer failed — try again.");
      }
    }
  }

  async function inscribe() {
    if (!account) { alert("Connect wallet first"); return; }
    if (!insVault || !insAsset || !insCbbtc) { alert("Vault address, asset ID and cbBTC amount are required"); return; }
    if (Number(insCbbtc) < 100) { alert("Minimum inscribe is 100 Satoshis"); return; }
    const s = await getSigner();
    const cbbtc = new ethers.Contract(CBBTC_ADDRESS, CBBTC_ABI, s);
    const wk   = new ethers.Contract(WK_ADDRESS,  WK_ABI,   s);
    setInsS("pending"); setInsM("Checking cbBTC allowance...");
    try {
      await ensureAllowance(cbbtc, account, WK_ADDRESS, BigInt(insCbbtc), setInsM);
      setInsM("Confirm inscription in your wallet...");
      const ordNum = insOrd ? BigInt(insOrd) : BigInt(0);
      const vaultAddr = ethers.getAddress(insVault); // checksum — prevents ENS lookup
      const tx = await wk.inscribe(vaultAddr, b32(insAsset), BigInt(insCbbtc), ordNum, insInsId);
      setInsM("Confirming on chain...");
      await tx.wait();
      setInsS("success"); setInsM(`Vault inscribed — ${insAsset} registered on chain`);
      if (account) await load(account);
    } catch (e: any) { setInsS("failed"); setInsM(e.reason || e.message || "Inscribe failed"); }
  }

  async function reportOrdinalMoved() {
    if (!account) { alert("Connect wallet first"); return; }
    if (!repOrd)  { alert("Enter ordinal number"); return; }
    const s = await getSigner();
    const wk = new ethers.Contract(WK_ADDRESS, WK_ABI, s);
    setRepS("pending"); setRepM("Awaiting wallet...");
    try {
      await (await wk.reportOrdinalMoved(BigInt(repOrd))).wait();
      setRepS("success"); setRepM(`Origin Key #${repOrd} marked as moved — permanent on chain`);
    } catch (e: any) { setRepS("failed"); setRepM(e.reason || e.message || "Report failed"); }
  }

  async function checkVault() {
    if (!vAddr) { alert("Enter a vault address"); return; }
    setVS("pending"); setVM("Querying vault registry...");
    try {
      const provider = new ethers.JsonRpcProvider(PUBLIC_RPC);
      const wk = new ethers.Contract(WK_ADDRESS, WK_ABI, provider);
      const [core, ordinal, divAmount] = await Promise.all([
        wk.vaultStatus(vAddr),
        wk.vaultOrdinalStatus(vAddr),
        wk.recirculationOf(vAddr),
      ]);
      const [registered, swept, balance, assetId]                    = core;
      const [ordinalNumber, hasOrdinal, ordinalMoved, ordinalMovedAt, inscriptionId] = ordinal;
      // Fallback: if the contract has no inscriptionId (was inscribed with a blank
      // string), pull it from gallery.json by matching the vault address. The image
      // still loads from the real Ordinal on ordinals.com — this only supplies the ID.
      let resolvedInscriptionId = inscriptionId || "";
      if (!resolvedInscriptionId && galleryData) {
        try {
          const target = vAddr.toLowerCase();
          for (const a of (galleryData.artists || [])) {
            for (const col of (a.collections || [])) {
              for (const p of (col.pieces || [])) {
                if (p.vault && p.vault.toLowerCase() === target && p.inscriptionId) {
                  resolvedInscriptionId = p.inscriptionId;
                }
              }
            }
          }
        } catch {}
      }
      setVResult({ registered, swept, balance: balance.toString(), recirculation: divAmount.toString(), assetId: assetId.toString(), ordinalNumber: ordinalNumber.toString(), hasOrdinal, ordinalMoved, ordinalMovedAt: ordinalMovedAt.toString(), inscriptionId: resolvedInscriptionId });
      setVS("idle"); setVM("");
    } catch (e: any) { setVS("failed"); setVM("Could not query — check address and try again"); setVResult(null); }
  }

  // Option B: connected wallet → trade, new visitor → home
  useEffect(() => {
    // Wallet connected — don't auto-switch tabs
  }, [connected]);

  useEffect(() => { fetchBtcPrice(); const iv = setInterval(fetchBtcPrice, 60000); return () => clearInterval(iv); }, []);

  // Load gallery data
  useEffect(() => {
    fetch("/gallery.json").then(r => r.json()).then(d => setGalleryData(d)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!account) return;
    load(account);
    // Check if already approved
    const checkAllowance = async () => {
      try {
        const provider = new ethers.JsonRpcProvider(PUBLIC_RPC);
        const cbbtc = new ethers.Contract(CBBTC_ADDRESS, CBBTC_ABI, provider);
        const allowance = await cbbtc.allowance(account, WK_ADDRESS);
        setIsApproved(allowance > BigInt(0));
      } catch (e) { console.error(e); }
    };
    checkAllowance();
    const iv = setInterval(() => load(account), 10000);
    return () => clearInterval(iv);
  }, [account]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("vault");
    if (v) { setVResult(null); setAutoChecked(false); setVAddr(v); setTab("vault"); }
  }, []);
  useEffect(() => { if (vAddr && tab === "vault" && !autoChecked) { setAutoChecked(true); setTimeout(() => checkVault(), 300); } }, [vAddr, tab]);

  const bPrev    = preview7(buyAmt);
  const sPrev    = preview7(sellAmt);
  const insPrev  = preview7(insCbbtc);
  const cbbtcNum = Number(cbbtcBal);
  const oktNum   = Number(oktBal);
  const divsNum  = Number(divs);
  const supplyNum= Number(supply);
  const cbbtcUsd = btcPrice > 0 ? fmtUsd(SatoshisToUsd(cbbtcNum, btcPrice)) : "";
  const oktUsd   = btcPrice > 0 ? fmtUsd(SatoshisToUsd(oktNum,   btcPrice)) : "";
  const divsUsd  = btcPrice > 0 ? fmtUsd(SatoshisToUsd(divsNum,  btcPrice)) : "";
  const accountStr   = account ?? "";
  const isRegistrar  = accountStr.toLowerCase() === VAULT_REGISTRAR.toLowerCase();

  const tabs: { id: Tab; label: string; short: string }[] = [
    { id: "gallery",  label: "GALLERY",  short: "GALLERY"  },
    { id: "vault",    label: "VAULT",    short: "VAULT"    },
    { id: "keychain", label: "KEYCHAIN", short: "KEYCHAIN" },
    { id: "conduct",  label: "CONDUCT",  short: "CONDUCT"  },
    ...(isRegistrar ? [{ id: "inscribe" as Tab, label: "INSCRIBE", short: "INSCRIBE" }] : []),
  ];

  return (
    <main style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", WebkitOverflowScrolling: "touch" as any }}>

      {/* HEADER */}
      <div style={{ background: tab === "home" ? "transparent" : C.card, borderBottom: tab === "home" ? "none" : `1px solid ${C.border}`, padding: 0, display: "flex", flexDirection: "column" as const, alignItems: "center", position: "fixed" as const, top: 0, left: 0, right: 0, zIndex: 100, boxShadow: tab === "home" ? "none" : C.shadow }}>
        {/* ROW 1 — cbBTC price left, dark mode right */}
        <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: mobile ? "6px 12px" : "6px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <CbbtcLogo size={mobile ? 20 : 22} />
            {btcPrice > 0 && (
              <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: C.textMuted }}>
                BTC {fmtUsd(btcPrice)}
              </div>
            )}
          </div>
          <button
            onClick={() => setDarkMode(!darkMode)}
            style={{ background: darkMode ? "#2A2D35" : C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 8px", cursor: "pointer", color: C.textMuted, display: "flex", alignItems: "center", gap: 4, WebkitTapHighlightColor: "transparent" }}
          >
            {darkMode ? <SunIcon /> : <MoonIcon />}
            {!mobile && <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10, fontWeight: 600 }}>{darkMode ? "Light" : "Dark"}</span>}
          </button>
        </div>

        {/* ROW 2 — IMMUTABLE EDITIONS centered (hidden on home) */}
        {tab !== "home" && (
        <div style={{ padding: mobile ? "2px 0 4px" : "2px 0 6px" }}>
          <span onClick={() => setTab("home")} style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: mobile ? 22 : 30, fontWeight: 400, color: C.text, letterSpacing: "0.08em", textTransform: "uppercase" as const, cursor: "pointer" }}>
            Immutable Editions
          </span>
        </div>
        )}

        {/* ROW 3 — Tabs with line that fits under title (hidden on home) */}
        {tab !== "home" && (
        <div style={{ display: "inline-flex", justifyContent: "center", borderTop: `1px solid ${C.border}`, overflowX: "auto" as const, WebkitOverflowScrolling: "touch" as const, scrollbarWidth: "none" as const }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ flexShrink: 0, padding: mobile ? "7px 10px" : "8px 18px", fontFamily: "'Fraunces', Georgia, serif", fontSize: mobile ? 12 : 14, letterSpacing: "0.08em", background: "transparent", color: tab === t.id ? C.blue : C.textMuted, border: "none", borderBottom: tab === t.id ? `2px solid ${C.blue}` : "2px solid transparent", cursor: "pointer", fontWeight: 500, WebkitTapHighlightColor: "transparent", whiteSpace: "nowrap" as const, textTransform: "uppercase" as const }}>
              {mobile ? t.short : t.label}
            </button>
          ))}
        </div>
        )}
      </div>

      <div style={{ height: tab === "home" ? (mobile ? 40 : 48) : (mobile ? 100 : 115) }} />







      <div style={{ maxWidth: 880, margin: "0 auto", padding: mobile ? "20px 12px" : "32px 24px" }}>




        {/* HOME / SPLASH — reached via IMMUTABLE EDITIONS title */}
        {tab === "home" && (
          <div style={{ position: "relative" as const, minHeight: "72vh", display: "flex", flexDirection: "column" as const, justifyContent: "center", alignItems: "center", textAlign: "center" as const, padding: mobile ? "20px 24px 40px" : "10px 28px 60px" }}>

            {/* etched-glass vertical lines backdrop */}
            <div style={{ position: "absolute" as const, inset: 0, backgroundImage: `repeating-linear-gradient(to right, ${darkMode ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.020)"} 0, ${darkMode ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.020)"} 1px, transparent 1px, transparent 84px)`, pointerEvents: "none" as const, zIndex: 0 }} />

            <div style={{ position: "relative" as const, zIndex: 1, width: "100%", display: "flex", flexDirection: "column" as const, alignItems: "center" }}>

              {/* eyebrow */}
              <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.34em", color: C.textMuted, textTransform: "uppercase" as const, marginBottom: mobile ? 28 : 40 }}>
                Immutable Editions
              </div>

              {/* headline */}
              <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 300, fontSize: mobile ? "3.2rem" : "clamp(3.2rem, 9vw, 7rem)", lineHeight: 0.98, letterSpacing: "-0.02em", marginBottom: mobile ? 24 : 30, color: C.text }}>
                Integrity,<br /><span style={{ fontStyle: "italic", fontWeight: 400, color: C.blue }}>witnessed.</span>
              </h1>

              {/* lede */}
              <p style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: mobile ? "0.95rem" : "1.15rem", lineHeight: 1.6, color: C.textMuted, maxWidth: "30ch", marginBottom: mobile ? 48 : 66 }}>
                Tokenized physical real-world assets.
              </p>

              {/* the four ways in — ledger rows */}
              <nav style={{ width: "100%", maxWidth: 440, borderTop: `1px solid ${C.border}` }}>
                {([
                  ["gallery",  "Gallery",  "The Work"],
                  ["vault",    "Vault",    "The Verification"],
                  ["keychain", "Keychain", "The Connection"],
                  ["conduct",  "Conduct",  "The Guide"],
                ] as const).map(([dest, name, tag]) => (
                  <button key={dest} onClick={() => setTab(dest as Tab)}
                    onMouseEnter={(e: any) => { e.currentTarget.style.color = C.blue; e.currentTarget.style.paddingLeft = "14px"; e.currentTarget.querySelector(".rtag").style.color = C.blue; }}
                    onMouseLeave={(e: any) => { e.currentTarget.style.color = C.text; e.currentTarget.style.paddingLeft = "6px"; e.currentTarget.querySelector(".rtag").style.color = C.textMuted; }}
                    style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", width: "100%", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, color: C.text, padding: "22px 6px", cursor: "pointer", transition: "color 0.25s ease, padding-left 0.25s ease", textAlign: "left" as const }}>
                    <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: mobile ? "1.3rem" : "1.5rem", fontWeight: 400, letterSpacing: "0.01em" }}>{name}</span>
                    <span className="rtag" style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: C.textMuted, transition: "color 0.25s ease" }}>{tag}</span>
                  </button>
                ))}
              </nav>

            </div>

            {/* seal */}
            <div style={{ position: "relative" as const, zIndex: 1, marginTop: mobile ? 40 : 56, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10.5, letterSpacing: "0.2em", color: C.textMuted, textTransform: "uppercase" as const }}>
              The Glass Vault<span style={{ verticalAlign: "super", fontSize: 7 }}>&trade;</span> <span style={{ color: C.blue, fontWeight: 500 }}>&middot; Patent Pending</span>
            </div>
          </div>
        )}

        {/* TRADE */}
        {tab === "gallery" && (
          <>
            {/* GALLERY NAVIGATION */}
            {galleryView === "pieces" && (
              <button onClick={() => { setGalleryView("collections"); setSelectedPiece(null); }}
                style={{ background: "none", border: "none", color: C.blue, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 16, padding: 0 }}>
                ← Back to Collections
              </button>
            )}

            {/* GALLERY — Artist Bio + Collections */}
            {galleryView !== "pieces" && galleryData && galleryData.artists.length > 0 && (() => {
              const artist = galleryData.artists[0];
              return (
              <>
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: mobile ? 22 : 28, fontWeight: 400, color: C.text, letterSpacing: "0.06em", marginBottom: 12, textAlign: "center" as const }}>Michael James Slattery</div>
                  <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.blue}`, borderRadius: 6, padding: mobile ? "16px 16px" : "20px 22px", maxWidth: 640, margin: "0 auto" }}>
                    <div style={{ fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif", fontSize: mobile ? 13 : 14, color: C.textDim, lineHeight: 1.75, textAlign: "center" as const }}>
                      Michael, The Luminist, fuses day and night exposures with darkroom alchemy to reveal the extraordinary light hidden in the ordinary — then seals each masterpiece in immutable, trustless and permissionless glory.
                      <br /><br />
                      A sovereign creator. He hand-builds frames and programs on-chain inscriptions. He carries his art from capture to collector. With zero intermediaries.
                    </div>
                    <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: mobile ? 14 : 15, color: C.textMuted, fontStyle: "italic", lineHeight: 1.6, margin: "14px 0 12px", paddingTop: 14, borderTop: `1px solid ${C.border}`, textAlign: "center" as const }}>
                      "The vault standing guard: see everything, touch nothing. Until the seal is broken."
                    </div>
                    <div style={{ textAlign: "center" as const }}>
                      <a href="https://luminous-views.com" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: C.blue, fontWeight: 600, textDecoration: "none" }}>
                        Michael's fine art — Luminous Views Gallery ↗
                      </a>
                    </div>
                  </div>
                </div>

                {artist.canvaEmbed && (
                  <div style={{ maxWidth: artist.canvaAspect === "vertical" ? 280 : 500, margin: "0 auto 24px", borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
                    <div style={{ position: "relative" as const, paddingBottom: artist.canvaAspect === "vertical" ? "177.78%" : "56.25%", height: 0 }}>
                      <iframe src={artist.canvaEmbed + "?embed"} style={{ position: "absolute" as const, top: 0, left: 0, width: "100%", height: "100%", border: "none" }} loading="lazy" allowFullScreen />
                    </div>
                  </div>
                )}

                <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 16 }}>Collections</div>
                <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                  {artist.collections.map((col: any) => {
                    const coverPiece = col.pieces.find((p: any) => p.inscriptionId) || col.pieces[0];
                    return (
                      <div key={col.id} onClick={() => {
                        setSelectedArtist(artist);
                        if (col.private && !unlockedCollections.has(col.id)) {
                          const pw = prompt("This collection is private. Enter password:");
                          if (pw === col.password) {
                            setUnlockedCollections(prev => new Set([...prev, col.id]));
                            setSelectedCollection(col);
                            setGalleryView("pieces");
                          } else if (pw !== null) {
                            alert("Incorrect password.");
                          }
                        } else {
                          setSelectedCollection(col);
                          setGalleryView("pieces");
                        }
                      }}
                        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", cursor: "pointer", boxShadow: C.shadow, transition: "border-color 0.2s" }}
                        onMouseEnter={(e: any) => e.currentTarget.style.borderColor = C.blue}
                        onMouseLeave={(e: any) => e.currentTarget.style.borderColor = C.border}>
                        {coverPiece?.inscriptionId && (
                          <img src={`https://ordinals.com/content/${coverPiece.inscriptionId}`} alt={col.name}
                            style={{ width: "100%", height: 200, objectFit: "cover" }}
                            onError={(e: any) => { e.target.style.display = "none"; }} />
                        )}
                        <div style={{ padding: 16 }}>
                          <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>{col.name}</div>
                          <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, color: C.textMuted, marginBottom: 6 }}>{col.description}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: C.blue, fontWeight: 600 }}>{col.pieces.length} Piece{col.pieces.length !== 1 ? "s" : ""} →</div>
                            {col.private && !unlockedCollections.has(col.id) && <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12 }}>🔒</span>}
                            {col.private && unlockedCollections.has(col.id) && <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12 }}>🔓</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
              );
            })()}

            {/* LEVEL 3 — PIECES */}
            {galleryView === "pieces" && selectedCollection && (
              <>
                <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>{selectedCollection.name}</div>
                <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 14, color: C.textMuted, marginBottom: 12 }}>by {selectedArtist?.name} · {selectedCollection.description}</div>
                {selectedCollection.canvaEmbed && (
                  <div style={{ maxWidth: selectedCollection.canvaAspect === "vertical" ? 280 : 500, margin: "0 auto 20px", borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
                    <div style={{ position: "relative" as const, paddingBottom: selectedCollection.canvaAspect === "vertical" ? "177.78%" : "56.25%", height: 0 }}>
                      <iframe src={selectedCollection.canvaEmbed + "?embed"} style={{ position: "absolute" as const, top: 0, left: 0, width: "100%", height: "100%", border: "none" }} loading="lazy" allowFullScreen />
                    </div>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 12 }}>
                  {selectedCollection.pieces.map((piece: any, idx: number) => (
                    <div key={idx} onClick={() => setSelectedPiece(piece)}
                      style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", cursor: "pointer", boxShadow: C.shadow, transition: "border-color 0.2s", position: "relative" as const }}
                      onMouseEnter={(e: any) => e.currentTarget.style.borderColor = C.blue}
                      onMouseLeave={(e: any) => e.currentTarget.style.borderColor = C.border}>
                      {piece.sold && (
                        <div style={{ position: "absolute" as const, top: 8, right: 8, zIndex: 2, background: C.red, color: "#FFFFFF", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", padding: "3px 9px", borderRadius: 4 }}>SOLD</div>
                      )}
                      {piece.inscriptionId ? (
                        <img src={`https://ordinals.com/content/${piece.inscriptionId}`} alt={piece.name}
                          style={{ width: "100%", height: mobile ? 120 : 160, objectFit: "cover", opacity: piece.sold ? 0.5 : 1, filter: piece.sold ? "grayscale(0.4)" : "none" }}
                          onError={(e: any) => { e.target.style.display = "none"; }} />
                      ) : (
                        <div style={{ width: "100%", height: mobile ? 120 : 160, background: C.panel, display: "flex", alignItems: "center", justifyContent: "center", opacity: piece.sold ? 0.5 : 1 }}>
                          <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textMuted }}>Witness Keys Only</span>
                        </div>
                      )}
                      <div style={{ padding: 8 }}>
                        <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{piece.name}</div>
                        <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10, color: C.textMuted }}>{piece.type === "original" ? "Original · " + piece.edition : "Limited · " + piece.edition}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* PIECE MODAL */}
            {selectedPiece && (
              <div onClick={() => setSelectedPiece(null)} style={{ position: "fixed" as const, top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                <div onClick={(e: any) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, padding: mobile ? 20 : 32, maxWidth: 480, width: "100%", maxHeight: "90vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
                  {/* Image */}
                  {selectedPiece.inscriptionId && (
                      <img src={`https://ordinals.com/content/${selectedPiece.inscriptionId}`} alt={selectedPiece.name}
                        style={{ width: "100%", height: "auto", borderRadius: 8, marginBottom: 16 }}
                        onError={(e: any) => { e.target.style.display = "none"; }} />
                  )}

                  {/* Title */}
                  <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 4 }}>{selectedPiece.name}</div>

                  {/* Type and edition */}
                  <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, color: C.blue, fontWeight: 600, marginBottom: 12 }}>
                    {selectedPiece.type === "original" ? `Original · ${selectedPiece.edition}` : `Limited Edition · ${selectedPiece.edition}`}
                  </div>

                  {/* Details */}
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 8, marginBottom: 16 }}>
                    {selectedPiece.ordinalNumber && selectedPiece.ordinalNumber !== "0" && (
                      <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, color: C.textDim }}>
                        Origin Key #{selectedPiece.ordinalNumber}
                      </div>
                    )}
                    {selectedPiece.oktAmount && (
                      <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, color: C.textDim }}>
                        {Number(selectedPiece.oktAmount).toLocaleString()} Witness Keys sealed
                      </div>
                    )}
                    {selectedPiece.vault && (
                      <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: C.textMuted }}>
                        Minted to: <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11 }}>{selectedPiece.vault}</span>
                      </div>
                    )}
                  </div>

                  {/* Links */}
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>

                    {selectedPiece.sold ? (
                      <div style={{ display: "block", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 14, color: C.textMuted, fontWeight: 700, textAlign: "center" as const, letterSpacing: "0.1em" }}>
                        SOLD
                      </div>
                    ) : selectedPiece.shopifyUrl && (
                      <a href={selectedPiece.shopifyUrl} target="_blank" rel="noopener noreferrer"
                        style={{ display: "block", background: C.green, borderRadius: 8, padding: "12px 16px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 14, color: "#FFFFFF", textDecoration: "none", fontWeight: 700, textAlign: "center" as const }}>
                        Purchase This Piece ↗
                      </a>
                    )}
                    {selectedPiece.vault && (
                      <button onClick={(e: any) => { e.stopPropagation(); setSelectedPiece(null); setVResult(null); setAutoChecked(false); setVAddr(selectedPiece.vault); setTab("vault"); }}
                        style={{ display: "block", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 16px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, color: C.textDim, fontWeight: 700, cursor: "pointer", textAlign: "center" as const, width: "100%" }}>
                        Check Vault Status →
                      </button>
                    )}

                  </div>

                  {/* Close button */}
                  <button onClick={() => setSelectedPiece(null)} style={{ marginTop: 16, width: "100%", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, color: C.textMuted, cursor: "pointer", fontWeight: 600 }}>Close</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* VAULT */}
        {/* ─── VAULT: copy stack, always shown ─────────────────────────── */}
        {tab === "vault" && (
          <div style={{ textAlign: "center" as const, marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: mobile ? 6 : 8, fontFamily: "'Fraunces', Georgia, serif", fontSize: mobile ? 26 : 34, fontWeight: 400, color: C.text, letterSpacing: "-0.01em" }}>
              <span>Tokenized</span>
              <span style={{ writingMode: "vertical-rl" as const, transform: "rotate(180deg)", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: mobile ? 8 : 10, fontWeight: 700, letterSpacing: "0.15em", color: C.blue, textTransform: "uppercase" as const, lineHeight: 1 }}>Physical</span>
              <span>Real World Assets</span>
            </div>
          </div>
        )}

        {/* VAULT header shows on VAULT tab only */}

        {tab === "keychain" && (
          <>
          {/* ─── KEY DEFINITIONS — hidden once connected ──────────────────── */}
          {!connected && (
          <>
          {(() => {
            const BOXES = [
              {
                name: "Origin Key",
                sub: "Immutable Ordinal Inscription (IOI)",
                bullets: [
                  "An Origin Key is the piece's birth record, written permanently onto Bitcoin itself.",
                ],
              },
              {
                name: "Witness Key",
                sub: "Deterministic Automatic Operation (DAO) Contract",
                bullets: [
                  "Witness Keys make you a witness to the vault, with a measure that's real and fixed.",
                ],
              },
              {
                name: "The Glass Vault",
                sub: "PATENT PENDING",
                dial: true,
                bullets: [
                  "And the Glass Vault is the part that lets you check all of it — see exactly what's inside — without ever breaking the seal.",
                ],
              },
            ];
            return BOXES.map(b => (
              <div key={b.name} style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.blue}`, borderRadius: 6, padding: mobile ? "16px 16px" : "20px 22px", marginBottom: 14 }}>
                <div style={{ textAlign: "center" as const, marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 6 }}>
                    {(b as any).dial ? <Keyhole size={36} dark={darkMode} /> : <SkeletonKey size={36} dark={darkMode} />}
                    <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: mobile ? 22 : 28, fontWeight: 400, color: C.blue, letterSpacing: "0.06em" }}>{b.name}</span>
                  </div>
                  {b.sub && (
                    <div style={{ fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif", fontSize: mobile ? 13 : 14, fontWeight: 600, color: (b as any).dial ? C.text : C.textDim, letterSpacing: "0.02em" }}>
                      {b.sub}
                    </div>
                  )}
                </div>
                <div style={{ fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif", fontSize: mobile ? 13 : 14, color: C.textDim, lineHeight: 1.65, fontWeight: 400, textAlign: "center" as const }}>
                  {b.bullets[0]}
                </div>
              </div>
            ));
          })()}

          {/* ─── PARTICIPANT NOTE ─────────────────────────────────────────── */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.blue}`, borderRadius: 6, padding: mobile ? "14px 16px" : "16px 22px", marginBottom: 18 }}>
            <div style={{ fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif", fontSize: mobile ? 13 : 14, color: C.text, lineHeight: 1.8, fontWeight: 600 }}>
              Connecting a wallet makes you a participant. There are no customers here.
            </div>
          </div>
          </>
          )}

          {/* WALLET — compact bar + inline stats */}
          {connected ? (
            <div style={{ marginBottom: 14 }}>

              {/* Compact wallet bar: address pill + disconnect */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.green, flexShrink: 0 }} />
                  <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: C.textDim, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    {fmtAddr(accountStr)}
                  </span>
                </div>
                <ConnectButton.Custom>
                  {({ openAccountModal }) => (
                    <button onClick={openAccountModal} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 10px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textMuted, cursor: "pointer", fontWeight: 600, flexShrink: 0 }}>
                      Manage
                    </button>
                  )}
                </ConnectButton.Custom>
              </div>

              {/* Recirculation claim — only when there's something to claim */}
              {divsNum > 0 && (
                <div style={{ background: C.blueBg, border: `1px solid ${C.blue}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8, display: "flex", flexDirection: mobile ? "column" : "row" as const, alignItems: mobile ? "stretch" : "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, color: C.blue, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                    <CbbtcLogo size={14} />{fmtSats(divs)} available
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={claim} style={{ background: C.blue, color: "#FFFFFF", border: "none", borderRadius: 6, padding: "7px 14px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>Collect</button>
                    <button onClick={recirculate}
                      onMouseEnter={(e: any) => { e.currentTarget.style.background = C.blue; e.currentTarget.style.color = "#FFFFFF"; }}
                      onMouseLeave={(e: any) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.blue; }}
                      style={{ background: "transparent", color: C.blue, border: `1px solid ${C.blue}`, borderRadius: 6, padding: "7px 14px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, cursor: "pointer", fontWeight: 700, transition: "all 0.15s ease" }}>Recirculate</button>
                  </div>
                  <div><Status state={wdS} msg={wdM} theme={C} /><Status state={rvS} msg={rvM} theme={C} /></div>
                </div>
              )}

              {/* Inline stat strip — 4 compact cells */}
              <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 1, background: C.border, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
                {[
                  { k: "cbBTC", v: fmtOnlyNum(cbbtcBal), u: cbbtcUsd, hi: false },
                  { k: "Keys Held", v: fmtOnlyNum(oktBal), u: oktUsd, hi: false },
                  { k: "Recirculation", v: fmtOnlyNum(divs), u: divsUsd, hi: true },
                  { k: "Total Supply", v: fmtOnlyNum(supply), u: "", hi: false },
                ].map((s, i) => (
                  <div key={i} style={{ background: C.card, padding: "11px 12px", borderTop: s.hi ? `2px solid ${C.blue}` : "2px solid transparent" }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, letterSpacing: "0.08em", color: s.hi ? C.blue : C.textMuted, textTransform: "uppercase" as const, fontWeight: 600, marginBottom: 5 }}>{s.k}</div>
                    <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 21, fontWeight: 700, color: s.hi ? C.blue : C.text, lineHeight: 1.1 }}>{s.v}</div>
                    {s.u && <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: C.green, fontWeight: 600, marginTop: 2 }}>{s.u}</div>}
                  </div>
                ))}
              </div>

              {/* Footer: revoke only — address is already in the bar above */}
              <div style={{ textAlign: "center" as const, marginTop: 7 }}>
                <button onClick={async () => {
                  try {
                    const gs = await getSigner();
                    const cbbtc = new ethers.Contract(CBBTC_ADDRESS, CBBTC_ABI, gs);
                    const tx = await cbbtc.approve(WK_ADDRESS, BigInt(0));
                    await tx.wait();
                    alert("cbBTC approval revoked — the contract can no longer spend your cbBTC.");
                  } catch (e: any) {
                    if (e.message?.includes("user rejected")) return;
                    alert("Revoke failed — try again.");
                  }
                }} style={{ background: "transparent", border: "none", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10, color: C.textMuted, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                  Revoke cbBTC approval
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 14 }}>
              <ConnectButton.Custom>
                {({ openConnectModal }) => (
                  <button onClick={openConnectModal} style={{ width: "100%", background: C.blue, color: "#FFFFFF", border: "none", borderRadius: 8, padding: "15px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em" }}>
                    Connect Wallet
                  </button>
                )}
              </ConnectButton.Custom>
            </div>
          )}

          {/* Trade inputs — only once a wallet is connected */}
          {connected && (
          <div>
          {/* MODE SELECTOR — segmented, no arrows */}
          <div style={{ display: "flex", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 4, marginBottom: 14, gap: 4 }}>
            {([["buy","Acquire"],["sell","Dispose"],["transfer","Transfer"]] as const).map(([m, label]) => {
              const active = swapMode === m;
              return (
                <button key={m} onClick={() => setSwapMode(m)}
                  style={{ flex: 1, padding: mobile ? "11px 8px" : "12px 8px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: mobile ? 13 : 14, fontWeight: 700, cursor: "pointer", borderRadius: 7, background: active ? C.blue : "transparent", color: active ? "#FFFFFF" : C.textMuted, border: "none", letterSpacing: "0.03em", transition: "all 0.15s ease" }}>
                  {label}
                </button>
              );
            })}
          </div>

          <div>

            {/* ═══ FLIP-CARD SWAP — Buy & Sell share one surface ═══ */}
            {(swapMode === "buy" || swapMode === "sell") && (() => {
              const isBuy = swapMode === "buy";
              // Buy: pay cbBTC (SATS) -> receive WK.  Sell: pay WK -> receive cbBTC (SATS).
              const payAmt   = isBuy ? buyAmt : sellAmt;
              const setPay   = isBuy ? setBuyAmt : setSellAmt;
              const prev     = isBuy ? bPrev : sPrev;
              const payTag   = isBuy ? "SATS" : "WK";
              const getTag   = isBuy ? "WK" : "SATS";
              const payLabel = isBuy ? "cbBTC (in Satoshis)" : "Witness Keys";
              const getLabel = isBuy ? "Witness Keys" : "cbBTC (in Satoshis)";
              const payBal   = isBuy ? cbbtcNum : oktNum;
              const outVal   = prev ? prev.out : 0;
              const feeVal   = prev ? prev.fee : 0;

              return (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: mobile ? 16 : 20, boxShadow: C.shadow }}>

                  {/* Header row: title + fee pill */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: mobile ? 18 : 20, fontWeight: 500, color: C.text }}>
                      {isBuy ? "Acquire Keys" : "Dispose Keys"}
                    </span>
                    <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 700, color: C.blue, background: C.blueBg, border: `1px solid ${C.blue}`, borderRadius: 20, padding: "4px 12px" }}>
                      7% fee &rarr; holders
                    </span>
                  </div>

                  {/* YOU PAY */}
                  <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: mobile ? "12px 14px" : "14px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" as const, fontWeight: 600 }}>You spend</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textMuted }}>Balance: {payBal.toLocaleString()} {payTag}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input type="number" value={payAmt} onChange={e => setPay(e.target.value)} placeholder="0"
                        style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: mobile ? 24 : 28, fontWeight: 700, color: C.text, WebkitAppearance: "none" as const, padding: 0 }} />
                      <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: mobile ? 14 : 16, fontWeight: 700, color: C.blue, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                        {(isBuy) && <CbbtcLogo size={18} />}{payTag}
                      </span>
                    </div>
                    {btcPrice > 0 && Number(payAmt) > 0 && (
                      <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: C.textMuted, marginTop: 4 }}>
                        &asymp; {fmtUsd(SatoshisToUsd(isBuy ? Number(payAmt) : Number(payAmt), btcPrice))} USD
                      </div>
                    )}
                  </div>

                  {/* FLIP BUTTON */}
                  <div style={{ display: "flex", justifyContent: "center", margin: "-10px 0", position: "relative" as const, zIndex: 2 }}>
                    <button onClick={() => setSwapMode(isBuy ? "sell" : "buy")}
                      title="Flip direction"
                      onMouseEnter={(e: any) => { e.currentTarget.style.background = C.blue; e.currentTarget.style.color = "#FFFFFF"; e.currentTarget.style.transform = "rotate(180deg)"; }}
                      onMouseLeave={(e: any) => { e.currentTarget.style.background = C.card; e.currentTarget.style.color = C.blue; e.currentTarget.style.transform = "rotate(0deg)"; }}
                      style={{ width: 38, height: 38, borderRadius: "50%", background: C.card, border: `2px solid ${C.blue}`, color: C.blue, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, transition: "all 0.2s ease", boxShadow: C.shadow }}>
                      &#8645;
                    </button>
                  </div>

                  {/* YOU RECEIVE */}
                  <div style={{ background: C.blueBg, border: `1px solid ${C.blue}`, borderRadius: 12, padding: mobile ? "12px 14px" : "14px 16px", marginBottom: 14 }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.blue, letterSpacing: "0.08em", textTransform: "uppercase" as const, fontWeight: 600, marginBottom: 8 }}>You get</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ flex: 1, minWidth: 0, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: mobile ? 24 : 28, fontWeight: 700, color: outVal > 0 ? C.text : C.textMuted, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {outVal > 0 ? outVal.toLocaleString() : "0"}
                      </span>
                      <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: mobile ? 14 : 16, fontWeight: 700, color: C.blue, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                        {(!isBuy) && <CbbtcLogo size={18} />}{getTag}
                      </span>
                    </div>
                    {btcPrice > 0 && outVal > 0 && (
                      <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: C.green, fontWeight: 600, marginTop: 4 }}>
                        &asymp; {fmtUsd(SatoshisToUsd(outVal, btcPrice))} USD
                      </div>
                    )}
                  </div>

                  {/* Fee line + 1:1 note */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: C.textMuted, marginBottom: 14, padding: "0 2px" }}>
                    <span>1 Satoshi = 1 WK &middot; permanently pegged</span>
                    {feeVal > 0 && <span>Fee: {feeVal.toLocaleString()} Satoshis</span>}
                  </div>

                  {/* ACTION BUTTON */}
                  {isBuy ? (
                    <>
                      <BigBtn onClick={buy} theme={C} disabled={!connected}>
                        {connected ? "Acquire Witness Keys" : "Connect wallet to acquire"}
                      </BigBtn>
                      <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textMuted, marginTop: 8, textAlign: "center" as const }}>
                        Two steps: approve, then acquire. You approve only what you spend.
                      </div>
                      <Status state={buyS} msg={buyM} theme={C} />
                    </>
                  ) : (
                    <>
                      <BigBtn variant="outline" theme={C} disabled={!connected} onClick={() => {
                        if (!sellAmt) return;
                        if (Number(sellAmt) >= oktNum && divsNum > 0) { setShowSellWarning(true); }
                        else { sell(); }
                      }}>
                        {connected ? "Dispose for cbBTC" : "Connect wallet to dispose"}
                      </BigBtn>
                      <Status state={sellS} msg={sellM} theme={C} />

                      {showSellWarning && (
                        <div style={{ position: "fixed" as const, top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                          <div style={{ background: C.card, border: `2px solid ${C.orange}`, borderRadius: 16, padding: mobile ? 24 : 36, maxWidth: 480, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
                            <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 20, fontWeight: 700, color: C.orange, marginBottom: 16 }}>
                              Wait &mdash; you have uncollected recirculation
                            </div>
                            <p style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 15, color: C.textDim, lineHeight: 1.7, marginBottom: 16 }}>
                              You have <strong style={{ color: C.blue }}>{fmtSats(divs.toString())}</strong> in uncollected recirculation. Collect it before selling so you receive every Satoshi.
                            </p>
                            <p style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 14, color: C.textMuted, lineHeight: 1.7, marginBottom: 24 }}>
                              Your share of recirculation is tied to your token balance. Sell first and your share drops to zero. Collect first and you keep it while still holding WK.
                            </p>
                            <div style={{ display: "flex", gap: 10, flexDirection: mobile ? "column" : "row" as const }}>
                              <button onClick={() => setShowSellWarning(false)} style={{ flex: 1, background: C.blue, color: "#FFFFFF", border: "none", borderRadius: 8, padding: "14px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                                Collect first (recommended)
                              </button>
                              <button onClick={() => { setShowSellWarning(false); sell(); }} style={{ flex: 1, background: "transparent", color: C.red, border: `2px solid ${C.red}`, borderRadius: 8, padding: "14px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                                Sell anyway
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            {swapMode === "transfer" && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: mobile ? 16 : 20, boxShadow: C.shadow }}>

                {/* Header row: title + zero-fee pill */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: mobile ? 18 : 20, fontWeight: 500, color: C.text }}>
                    Transfer Keys
                  </span>
                  <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 700, color: C.green, background: C.blueBg, border: `1px solid ${C.green}`, borderRadius: 20, padding: "4px 12px" }}>
                    0% fee
                  </span>
                </div>

                {/* SEND TO */}
                <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: mobile ? "12px 14px" : "14px 16px", marginBottom: 10 }}>
                  <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" as const, fontWeight: 600, marginBottom: 8 }}>Send to</div>
                  <input type="text" value={txTo} onChange={e => setTxTo(e.target.value)} placeholder="0x..."
                    style={{ width: "100%", background: "transparent", border: "none", outline: "none", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: mobile ? 14 : 16, fontWeight: 600, color: C.text, padding: 0 }} />
                </div>

                {/* YOU SEND */}
                <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: mobile ? "12px 14px" : "14px 16px", marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" as const, fontWeight: 600 }}>You send</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textMuted }}>Balance: {oktNum.toLocaleString()} WK</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="number" value={txAmt} onChange={e => setTxAmt(e.target.value)} placeholder="0"
                      style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: mobile ? 24 : 28, fontWeight: 700, color: C.text, WebkitAppearance: "none" as const, padding: 0 }} />
                    <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: mobile ? 14 : 16, fontWeight: 700, color: C.blue, flexShrink: 0 }}>WK</span>
                  </div>
                  {btcPrice > 0 && Number(txAmt) > 0 && (
                    <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: C.textMuted, marginTop: 4 }}>
                      &asymp; {fmtUsd(SatoshisToUsd(Number(txAmt), btcPrice))} USD
                    </div>
                  )}
                </div>

                {/* Note line */}
                <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: C.textMuted, marginBottom: 14, padding: "0 2px", textAlign: "center" as const }}>
                  Recirculation moves proportionally with the Keys &middot; no fee
                </div>

                <BigBtn onClick={transfer} theme={C} disabled={!connected}>
                  {connected ? "Transfer Keys" : "Connect wallet to transfer"}
                </BigBtn>
                <Status state={txS} msg={txM} theme={C} />
              </div>
            )}
          </div>
          </div>
          )}
          </>
        )}

        {/* INSCRIBE */}
        {tab === "inscribe" && isRegistrar && (
          <div>
            <Panel title="Inscribe Vault — Analog Bitcoin Art Piece" theme={C}>
              <p style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: mobile ? 14 : 15, color: C.textDim, lineHeight: 1.7, marginBottom: 16 }}>
                You spend cbBTC — 7% recirculates to all WK holders, and the remaining 93% becomes WK tokens sealed inside the vault. The Origin Key number is optional — leave blank for series pieces without an Origin Key.
              </p>
              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "16px", marginBottom: 12 }}>
                <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: C.blue, marginBottom: 12, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>How It Works</div>
                {[
                  "Generate a fresh wallet in MetaMask — click Add Account",
                  "Copy that wallet address into the Vault field below",
                  "Get your Ordinal inscription number from ordinals.com (optional)",
                  "Enter how much cbBTC you want embedded — 7% fee applies, minimum 100 Satoshis",
                  "Hit Inscribe — cbBTC approved, fee distributed, WK sealed in vault",
                  "Print the private key and seal it inside the physical art",
                ].map((s, i) => (
                  <div key={i} style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 14, color: C.textDim, padding: "5px 0", display: "flex", gap: 12 }}>
                    <span style={{ color: C.blue, flexShrink: 0, fontWeight: 700 }}>{i + 1}.</span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
              <Input theme={C} label="Vault wallet address (sealed inside the art)" value={insVault} onChange={setInsVault} placeholder="0x..." />
              <Input theme={C} label="Asset ID (max 31 characters)" value={insAsset} onChange={setInsAsset} placeholder="RWI001-KEYSTONE-21of21" hint="Combine catalog ID + edition, e.g. RWI001-KEYSTONE-21of21 or RWI001-ARCH-3of7. Sealed on-chain and shown in the vault check." />
              <Input theme={C} label="Ordinal inscription number (optional)" value={insOrd} onChange={setInsOrd} placeholder="68743291 or leave blank" type="number" hint="Only the 1-of-1 has an Origin Key number. Leave blank for the 32 editions (Witness Keys only)." />
              <Input theme={C} label="Ordinal inscription ID — for gallery/vault image (optional)" value={insInsId} onChange={setInsInsId} placeholder="115067ee...a6d0ei0" hint="Paste the artwork's inscription ID to display its image. Editions reuse the 1-of-1's ID here to show the same artwork — leave the number above blank." />
              {(!insOrd || Number(insOrd) === 0) && (
                <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: C.textMuted, marginBottom: 20, padding: "10px 14px", background: C.panel, borderRadius: 8, border: `1px solid ${C.border}` }}>
                  No Origin Key number — this vault holds Witness Keys only. It can still show the artwork image if you paste an inscription ID above.
                </div>
              )}
              <Input theme={C} label="cbBTC to spend (Satoshis) — 7% fee, rest becomes WK in vault" value={insCbbtc} onChange={setInsCbbtc} placeholder="10000" type="number" tag="SATS"
                hint={btcPrice > 0 && insCbbtc ? `≈ ${fmtUsd(SatoshisToUsd(Number(insCbbtc), btcPrice))} USD` : `Your cbBTC: ${fmtSats(cbbtcBal)} · Minimum 100 Satoshis`} />
              {insPrev && (
                <Preview theme={C} rows={[
                  { label: "7% fee — distributed to all WK holders", value: insPrev.fee.toLocaleString() + " Satoshis" },
                  { label: "WK sealed in vault (1 Satoshi = 1 WK)", value: insPrev.out.toLocaleString() + " WK" + (btcPrice > 0 ? "  ·  " + fmtUsd(SatoshisToUsd(insPrev.out, btcPrice)) : ""), blue: true },
                ]} />
              )}
              {/* ─── Gallery Admin ─── */}
              <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 16, paddingTop: 16, marginBottom: 16 }}>
                <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 14, fontWeight: 700, color: C.blue, marginBottom: 12 }}>Gallery Admin</div>

                {/* Step 1 — Fill in gallery info */}
                <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
                  <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, fontWeight: 700, color: C.textDim, marginBottom: 8 }}>Step 1 — Fill in gallery info</div>
                  {/* Artist selector */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, color: C.textDim, marginBottom: 8, fontWeight: 600 }}>Artist</div>
                    <select value={galArtist} onChange={e => {
                      const val = e.target.value;
                      if (val === "__new__") { setGalArtist(""); setGalBio(""); setGalCollection(""); setGalColDesc(""); }
                      else {
                        setGalArtist(val);
                        const artist = galleryData?.artists.find((a: any) => a.name === val);
                        if (artist) setGalBio(artist.bio || "");
                      }
                    }} style={{ width: "100%", background: C.input, border: `2px solid ${C.text}`, borderRadius: 8, color: C.text, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 15, padding: "12px 16px", marginBottom: 8 }}>
                      <option value="">Select artist...</option>
                      {galleryData?.artists.map((a: any) => <option key={a.id} value={a.name}>{a.name}</option>)}
                      <option value="__new__">+ New Artist</option>
                    </select>
                    {(galArtist === "" || !galleryData?.artists.find((a: any) => a.name === galArtist)) && (
                      <>
                        <Input theme={C} label="New artist name" value={galArtist} onChange={setGalArtist} placeholder="Michael Slattery" />
                        <Input theme={C} label="Artist bio" value={galBio} onChange={setGalBio} placeholder="Creator of Analog Bitcoin" />
                      </>
                    )}
                  </div>

                  {/* Collection selector */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, color: C.textDim, marginBottom: 8, fontWeight: 600 }}>Collection</div>
                    <select value={galCollection} onChange={e => {
                      const val = e.target.value;
                      if (val === "__new__") { setGalCollection(""); setGalColDesc(""); }
                      else {
                        setGalCollection(val);
                        const artist = galleryData?.artists.find((a: any) => a.name === galArtist);
                        const col = artist?.collections.find((c: any) => c.name === val);
                        if (col) setGalColDesc(col.description || "");
                      }
                    }} style={{ width: "100%", background: C.input, border: `2px solid ${C.text}`, borderRadius: 8, color: C.text, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 15, padding: "12px 16px", marginBottom: 8 }}>
                      <option value="">Select collection...</option>
                      {galleryData?.artists.find((a: any) => a.name === galArtist)?.collections.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
                      <option value="__new__">+ New Collection</option>
                    </select>
                    {(galCollection === "" || !galleryData?.artists.find((a: any) => a.name === galArtist)?.collections.find((c: any) => c.name === galCollection)) && (
                      <>
                        <Input theme={C} label="New collection name" value={galCollection} onChange={setGalCollection} placeholder="Curry Cards" />
                        <Input theme={C} label="Collection description" value={galColDesc} onChange={setGalColDesc} placeholder="160 collectible fine art trading cards" />
                      </>
                    )}
                  </div>
                  <Input theme={C} label="Piece name" value={galPieceName} onChange={setGalPieceName} placeholder="Card #1" />
                  <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                    <button onClick={() => setGalType("original")} style={{ flex: 1, padding: "10px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, fontWeight: 700, border: "none", borderRadius: 6, cursor: "pointer", background: galType === "original" ? C.blue : C.card, color: galType === "original" ? "#FFFFFF" : C.textMuted }}>Original</button>
                    <button onClick={() => setGalType("limited")} style={{ flex: 1, padding: "10px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, fontWeight: 700, border: "none", borderRadius: 6, cursor: "pointer", background: galType === "limited" ? C.blue : C.card, color: galType === "limited" ? "#FFFFFF" : C.textMuted }}>Limited Edition</button>
                  </div>
                  <Input theme={C} label="Edition" value={galEdition} onChange={setGalEdition} placeholder="1 of 1 or 3 of 10" />
                  <Input theme={C} label="Shopify checkout link (optional)" value={galShopify} onChange={setGalShopify} placeholder="https://yourstore.myshopify.com/cart/..." />
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: C.textMuted, cursor: "pointer" }}>
                      <input type="checkbox" checked={galPrivate} onChange={e => setGalPrivate(e.target.checked)} />
                      Private collection
                    </label>
                  </div>
                  {galPrivate && (
                    <Input theme={C} label="Collection password" value={galPassword} onChange={setGalPassword} placeholder="vip2026" />
                  )}
                </div>

                {/* Current Gallery — Delete pieces */}
                {galleryData && galleryData.artists.length > 0 && (
                  <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, fontWeight: 700, color: C.textDim, marginBottom: 8 }}>Current Gallery Pieces</div>
                    <div style={{ maxHeight: 200, overflow: "auto" }}>
                      {galleryData.artists.map((artist: any) =>
                        artist.collections.map((col: any) =>
                          col.pieces.map((piece: any, pIdx: number) => (
                            <div key={`${artist.id}-${col.id}-${pIdx}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderBottom: `1px solid ${C.border}`, gap: 8 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{piece.name}</div>
                                <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10, color: C.textMuted }}>{artist.name} · {col.name} · {piece.edition}</div>
                              </div>
                              <button onClick={() => {
                                const updated = JSON.parse(JSON.stringify(galleryData));
                                const a = updated.artists.find((x: any) => x.id === artist.id);
                                const c = a.collections.find((x: any) => x.id === col.id);
                                c.pieces[pIdx].sold = !c.pieces[pIdx].sold;
                                setGalleryData(updated);
                                const json = JSON.stringify(updated, null, 2);
                                setGalEntry(json);
                                navigator.clipboard.writeText(json);
                              }} style={{ background: piece.sold ? C.redBg : "transparent", border: `1px solid ${piece.sold ? C.red : C.green}`, borderRadius: 4, padding: "4px 8px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10, color: piece.sold ? C.red : C.green, fontWeight: 700, cursor: "pointer", flexShrink: 0, minWidth: 74 }}>
                                {piece.sold ? "● SOLD" : "○ For sale"}
                              </button>
                              <button onClick={() => {
                                const updated = JSON.parse(JSON.stringify(galleryData));
                                const a = updated.artists.find((x: any) => x.id === artist.id);
                                const c = a.collections.find((x: any) => x.id === col.id);
                                c.pieces.splice(pIdx, 1);
                                if (c.pieces.length === 0) {
                                  a.collections = a.collections.filter((x: any) => x.id !== col.id);
                                }
                                if (a.collections.length === 0) {
                                  updated.artists = updated.artists.filter((x: any) => x.id !== artist.id);
                                }
                                setGalleryData(updated);
                                const json = JSON.stringify(updated, null, 2);
                                setGalEntry(json);
                                navigator.clipboard.writeText(json);
                              }} style={{ background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 4, padding: "4px 8px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10, color: C.red, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                                Delete
                              </button>
                            </div>
                          ))
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Step 2 — Generate and copy */}
                <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
                  <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, fontWeight: 700, color: C.textDim, marginBottom: 8 }}>Step 2 — Add to gallery and copy</div>
                  <button onClick={() => {
                    // Load current gallery data
                    const current = galleryData ? JSON.parse(JSON.stringify(galleryData)) : { artists: [] };
                    
                    // Create the new piece
                    const newPiece: any = {
                      name: galPieceName || "Untitled",
                      type: galType,
                      edition: galEdition || "1 of 1",
                      ordinalNumber: insOrd || "",
                      inscriptionId: insInsId || "",
                      vault: insVault || "",
                      oktAmount: insCbbtc || "",
                      shopifyUrl: galShopify || "",
                      sold: false
                    };

                    // Find or create artist
                    const artistId = (galArtist || "unknown").toLowerCase().replace(/\s+/g, "-");
                    let artist = current.artists.find((a: any) => a.id === artistId);
                    if (!artist) {
                      artist = {
                        id: artistId,
                        name: galArtist || "Unknown",
                        bio: galBio || "",
                        collections: []
                      };
                      current.artists.push(artist);
                    } else if (galBio) {
                      artist.bio = galBio;
                    }

                    // Find or create collection
                    const colId = (galCollection || "untitled").toLowerCase().replace(/\s+/g, "-");
                    let col = artist.collections.find((c: any) => c.id === colId);
                    if (!col) {
                      col = {
                        id: colId,
                        name: galCollection || "Untitled",
                        private: galPrivate,
                        password: galPrivate ? galPassword : "",
                        description: galColDesc || "",
                        pieces: []
                      };
                      artist.collections.push(col);
                    } else {
                      if (galColDesc) col.description = galColDesc;
                      if (galPrivate) { col.private = true; col.password = galPassword; }
                    }

                    // Add piece
                    col.pieces.push(newPiece);

                    // Generate JSON
                    const json = JSON.stringify(current, null, 2);
                    setGalEntry(json);
                    navigator.clipboard.writeText(json);
                    setGalleryData(current);
                  }} style={{ width: "100%", padding: "14px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 14, fontWeight: 700, background: C.blue, color: "#FFFFFF", border: "none", borderRadius: 8, cursor: "pointer", marginBottom: 8 }}>
                    ✚ Add Piece to Gallery + Copy Full JSON
                  </button>
                  <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textMuted, marginBottom: 8 }}>
                    This adds the piece to the gallery preview above AND copies the complete gallery.json to your clipboard.
                  </div>
                </div>

                {/* Step 3 — Paste into file */}
                {galEntry && (
                  <div style={{ background: C.greenBg, border: `1px solid ${C.green}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, fontWeight: 700, color: C.green, marginBottom: 8 }}>✓ Copied! Now do this:</div>
                    <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: C.textDim, lineHeight: 1.8 }}>
                      1. Open terminal and type: <code style={{ background: C.panel, padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>code /c/Users/Slattery/ieok-ui/frontend/public/gallery.json</code><br />
                      2. Select all: <strong>Ctrl+A</strong><br />
                      3. Paste: <strong>Ctrl+V</strong><br />
                      4. Save: <strong>Ctrl+S</strong><br />
                      5. Push: <code style={{ background: C.panel, padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>git add . && git commit -m "Add piece" && git push</code>
                    </div>
                  </div>
                )}

                {/* Current gallery preview */}
                {galEntry && (
                  <details style={{ marginBottom: 12 }}>
                    <summary style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textMuted, cursor: "pointer", marginBottom: 4 }}>View full gallery.json</summary>
                    <pre style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 9, color: C.textMuted, background: C.panel, padding: 8, borderRadius: 6, overflow: "auto", maxHeight: 200, border: `1px solid ${C.border}` }}>{galEntry}</pre>
                  </details>
                )}
              </div>
              <BigBtn onClick={inscribe} theme={C} disabled={!connected}>Inscribe Vault</BigBtn>
              <Status state={insS} msg={insM} theme={C} />
            </Panel>

            <Panel title="Report Ordinal Moved — Bitcoin Alert" theme={C}>
              <p style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: mobile ? 14 : 15, color: C.textDim, lineHeight: 1.7, marginBottom: 12 }}>
                When you see a linked Origin Key has moved on ordinals.com — enter its inscription number to record the alert permanently on Base.
              </p>
              <Input theme={C} label="Ordinal inscription number" value={repOrd} onChange={setRepOrd} placeholder="68743291" type="number" hint="Verify on ordinals.com before reporting — this is permanent and cannot be undone" />
              <BigBtn onClick={reportOrdinalMoved} theme={C} variant="outline" disabled={!connected}>Report Ordinal Moved</BigBtn>
              <Status state={repS} msg={repM} theme={C} />
            </Panel>
          </div>
        )}

        {tab === "vault" && (
          <>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: mobile ? 16 : 20, boxShadow: C.shadow }}>

            {/* Header row: title + read-only pill */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10 }}>
              <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: mobile ? 18 : 20, fontWeight: 500, color: C.text }}>
                Vault Registry
              </span>
              <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 700, color: C.blue, background: C.blueBg, border: `1px solid ${C.blue}`, borderRadius: 20, padding: "4px 12px", whiteSpace: "nowrap" as const }}>
                on-chain seal
              </span>
            </div>

            {/* VAULT ADDRESS — styled like the wallet inputs */}
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: mobile ? "12px 14px" : "14px 16px", marginBottom: 14 }}>
              <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" as const, fontWeight: 600, marginBottom: 8 }}>
                Vault wallet address
              </div>
              <input
                type="text"
                value={vAddr}
                onChange={e => { setVAddr(e.target.value); setVResult(null); setAutoChecked(false); }}
                placeholder="0x..."
                style={{ width: "100%", background: "transparent", border: "none", outline: "none", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: mobile ? 14 : 16, fontWeight: 600, color: C.text, padding: 0, boxSizing: "border-box" as const }}
              />
            </div>

            {/* Note line */}
            <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: C.textMuted, marginBottom: 14, padding: "0 2px", textAlign: "center" as const }}>
              Scan the NFC tag or paste the address &middot; read-only
            </div>

            <BigBtn onClick={checkVault} theme={C} variant="outline">Verify Vault Status</BigBtn>
            <Status state={vS} msg={vM} theme={C} />

            {vResult && (
              <div style={{ marginTop: 20, padding: mobile ? 20 : 28, border: `2px solid ${!vResult.registered ? C.border : vResult.swept ? C.red : C.green}`, borderRadius: 12, background: !vResult.registered ? C.panel : vResult.swept ? C.redBg : C.greenBg, color: C.text }}>

                <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: mobile ? 18 : 22, fontWeight: 700, marginBottom: 16, lineHeight: 1.3 }}>
                  {!vResult.registered && <span style={{ color: C.textMuted }}>⚪ Not a Registered Vault</span>}
                  {vResult.registered && !vResult.swept && <span style={{ color: C.green }}>🟢 Vault Sealed — Untouched</span>}
                  
                  {vResult.registered && vResult.swept && <span style={{ color: C.red }}>🔴 Vault Swept — Witness Keys Have Been Moved</span>}
                  
                </div>

                {/* STATUS BADGE — WK only */}
                {vResult.registered && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 16 }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6,
                      background: vResult.swept ? C.redBg : C.greenBg,
                      border: `1px solid ${vResult.swept ? C.red : C.green}` }}>
                      <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, fontWeight: 700,
                        color: vResult.swept ? C.red : C.green }}>
                        {vResult.swept ? "⚠ Witness Keys Swept" : "✓ Witness Keys Sealed"}
                      </span>
                    </div>
                  </div>
                )}

                {/* ORDINAL BOX — thumbnail, minted address, verify link, marketplace links */}
                {vResult.registered && (
                  <div style={{ textAlign: "center" as const, marginBottom: 12 }}>
                    {vResult.hasOrdinal && Number(vResult.ordinalNumber) > 0 ? (
                      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: mobile ? 16 : 24, display: "inline-block" }}>

                        {/* Ordinal number header */}
                        <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 16, fontWeight: 700, color: C.blue, marginBottom: 12 }}>
                          Origin Key #{vResult.ordinalNumber}
                        </div>

                        {/* Ordinal Preview Image */}
                        <OrdinalPreview ordinalNumber={vResult.ordinalNumber} inscriptionId={vResult.inscriptionId || ""} mobile={mobile} borderColor={C.border} />

                        {/* Minted to vault address */}
                        <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: C.textMuted, marginBottom: 4 }}>
                          Minted to:
                        </div>
                        <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textDim, wordBreak: "break-all" as const, marginBottom: 12, padding: "6px 10px", background: C.card, borderRadius: 6, border: `1px solid ${C.border}` }}>
                          {vAddr}
                        </div>

                        {/* Verify link */}
                        <a href={`https://ordinals.com/inscription/${vResult.inscriptionId || vResult.ordinalNumber}`} target="_blank" rel="noopener noreferrer"
                          style={{ display: "block", background: C.blueBg, border: `1px solid ${C.blue}`, borderRadius: 8, padding: "10px 20px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, color: C.blue, textDecoration: "none", fontWeight: 700, marginBottom: 8 }}>
                          View on Origin Keys.com ↗
                        </a>

                        {/* Marketplace links */}
                        <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textMuted, marginBottom: 6, marginTop: 12 }}>
                          Did you sweep this asset? You can list it here:
                        </div>
                        <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" as const }}>
                          <a href={`https://gamma.io/ordinals/collections`} target="_blank" rel="noopener noreferrer"
                            style={{ display: "inline-block", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textDim, textDecoration: "none", fontWeight: 600 }}>
                            Gamma ↗
                          </a>
                          <a href={`https://unisat.io/market`} target="_blank" rel="noopener noreferrer"
                            style={{ display: "inline-block", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textDim, textDecoration: "none", fontWeight: 600 }}>
                            UniSat ↗
                          </a>
                          <a href={`https://ordinalswallet.com`} target="_blank" rel="noopener noreferrer"
                            style={{ display: "inline-block", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textDim, textDecoration: "none", fontWeight: 600 }}>
                            Ordinals Wallet ↗
                          </a>
                        </div>


                      </div>
                    ) : vResult.inscriptionId ? (
                      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: mobile ? 16 : 24, display: "inline-block" }}>

                        {/* Edition — artwork image, no Origin Key claim */}
                        <OrdinalPreview ordinalNumber={vResult.ordinalNumber} inscriptionId={vResult.inscriptionId || ""} mobile={mobile} borderColor={C.border} />

                        <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: C.textMuted, marginBottom: 4 }}>
                          Sealed in vault:
                        </div>
                        <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textDim, wordBreak: "break-all" as const, padding: "6px 10px", background: C.card, borderRadius: 6, border: `1px solid ${C.border}` }}>
                          {vAddr}
                        </div>
                        <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textMuted, marginTop: 10 }}>
                          Limited Edition — Witness Keys only. The Origin Key lives with the signed 1-of-1.
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "inline-block", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 24px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 14, color: C.textMuted }}>
                        No Origin Key linked — Witness Keys only
                      </div>
                    )}
                  </div>
                )}



                {vResult.registered && (
                  <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 20 }}>
                    <div>
                      <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textMuted, letterSpacing: "0.1em", marginBottom: 6, textTransform: "uppercase" as const, fontWeight: 600 }}>Vault Address</div>
                      <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: C.textDim, wordBreak: "break-all" as const }}>{vAddr}</div>
                      {decodeAssetId(vResult.assetId) && (
                        <>
                          <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textMuted, letterSpacing: "0.1em", margin: "12px 0 6px", textTransform: "uppercase" as const, fontWeight: 600 }}>Asset ID</div>
                          <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: mobile ? 15 : 17, color: C.blue, fontWeight: 700 }}>{decodeAssetId(vResult.assetId)}</div>
                        </>
                      )}
                    </div>
                    <div>
                      <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textMuted, letterSpacing: "0.1em", marginBottom: 6, textTransform: "uppercase" as const, fontWeight: 600 }}>Witness Key Balance</div>
                      <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: mobile ? 22 : 26, color: C.text, fontWeight: 700 }}>{Number(vResult.balance).toLocaleString()} WK</div>
                      <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, color: C.textMuted, marginTop: 4 }}>{Number(vResult.balance).toLocaleString()} Satoshis&nbsp;·&nbsp;{fmtCbbtc(vResult.balance)}</div>
                      {btcPrice > 0 && <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 15, color: C.green, marginTop: 6, fontWeight: 700 }}>{fmtUsd(SatoshisToUsd(Number(vResult.balance), btcPrice))} USD</div>}
                    </div>
                    <div>
                      <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.textMuted, letterSpacing: "0.1em", marginBottom: 6, textTransform: "uppercase" as const, fontWeight: 600 }}>cbBTC Recirculation</div>
                      {Number(vResult.recirculation) > 0 ? (
                        <>
                          <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: mobile ? 22 : 26, color: C.blue, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                            <CbbtcLogo size={24} />{Number(vResult.recirculation).toLocaleString()} Satoshis
                          </div>
                          <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, color: C.textMuted, marginTop: 4 }}>{fmtCbbtc(vResult.recirculation)}</div>
                          {btcPrice > 0 && <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 15, color: C.green, marginTop: 6, fontWeight: 700 }}>{fmtUsd(SatoshisToUsd(Number(vResult.recirculation), btcPrice))} USD</div>}
                        </>
                      ) : (
                        <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 14, color: C.textMuted }}>No recirculation yet — accumulates as others buy and sell</div>
                      )}
                    </div>

                    {btcPrice > 0 && (
                      <div style={{ gridColumn: "1 / -1", background: C.blueBg, border: `1px solid ${C.blue}`, borderRadius: 8, padding: "16px 20px" }}>
                        <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: C.blue, letterSpacing: "0.1em", marginBottom: 8, textTransform: "uppercase" as const, fontWeight: 700 }}>Total Redeemable Value</div>
                        <div style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
                          <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: mobile ? 22 : 26, color: C.blue, fontWeight: 700 }}>{(Number(vResult.balance) + Number(vResult.recirculation)).toLocaleString()} Satoshis</div>
                          <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, color: C.textMuted }}>{fmtUsd(SatoshisToUsd(Number(vResult.balance) + Number(vResult.recirculation), btcPrice))} USD&nbsp;·&nbsp;{fmtCbbtc((Number(vResult.balance) + Number(vResult.recirculation)).toString())}</div>
                        </div>
                        <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: C.textMuted, marginTop: 6 }}>
                          WK tokens + accumulated cbBTC recirculation — redeemable by destroying the art piece and acquiring the embedded SeedPod (Private Key) to the wallet holding the digital assets.
                        </div>
                      </div>
                    )}

                    {/* Asset ID hidden from display — stored on chain for internal records */}

                    {vResult.swept && (
                      <div style={{ gridColumn: "1 / -1", padding: "14px 18px", background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 8 }}>
                        <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 14, color: C.red, lineHeight: 1.7 }}>⚠ Check the VaultSwept event on Basescan for the exact timestamp.</div>
                        <a href={`${BLOCK_EXPLORER}/address/${WK_ADDRESS}#events`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 13, color: C.red, display: "block", marginTop: 8, fontWeight: 700 }}>
                          View VaultSwept Events on Basescan ↗
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {!vResult.registered && (
                  <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 15, color: C.textMuted }}>This address is not registered in the Analog Bitcoin vault registry.</div>
                )}

                <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                    {[
                      { label: "AnalogBitcoin.com — About this project", url: "https://analogbitcoin.com" },
                      { label: "View contract and events on Basescan",   url: `${BLOCK_EXPLORER}/address/${WK_ADDRESS}` },
                    ].map(link => (
                      <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 14, color: C.blue, textDecoration: "none", padding: "10px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, display: "block", fontWeight: 600 }}>
                        {link.label} ↗
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          </>

        )}

        {/* LEARN */}
        {tab === "conduct" && (
          <div>
            <div style={{ textAlign: "center" as const, marginBottom: 24 }}>
              <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: mobile ? 26 : 34, fontWeight: 400, color: C.text, letterSpacing: "-0.01em", marginBottom: 12 }}>Conduct</div>
              <p style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: mobile ? 14 : 16, fontStyle: "italic", color: C.textMuted, lineHeight: 1.6, maxWidth: 620, margin: "0 auto" }}>
                The collectible market runs on trust. We built a vault that runs on proof — glass on every side. Look in from anywhere, verify everything, take nothing until you break the seal yourself.
              </p>
            </div>

            {(() => {
              const PART1 = [
                { tag: "START HERE", title: "The Glass Vault", intro: "A vault you can see straight through.",
                  body: ["Every piece is a physical collectable — a real object in your hands — with real digital assets sealed inside its own Bitcoin (crypto) wallet. A tap of the embedded NFC chip opens it on-chain, so you can confirm exactly what the piece holds. Anytime, from anywhere, without asking anyone.", "Sealed inside the collectable is the SeedPod: the private key that controls everything in the wallet. To reach those keys, you have to destroy the art. Until you do, the piece stands whole, its contents plain for everyone to see but no one to touch."] },
                { tag: "PROVENANCE", title: "Origin Key", intro: "The birth record, written onto Bitcoin itself.",
                  body: "Each original work is inscribed as an Origin Key — a Bitcoin Ordinal, a 1-of-1 inscription written permanently onto the Bitcoin blockchain. Inscriptions use the Dublin Core Metatag Initiative standard that libraries and museums use to catalog the world. The inscription proves the creation and the ownership of the work, directly from the work. Not a certificate in a drawer. A permanent Ordinal inscription anyone can check, that no one can forge." },
                { tag: "THE MATH", title: "Witness Key", intro: "Real Bitcoin interest, sealed in the same vault — governed by rule, not by rulers.",
                  body: ["A Witness Key is a unit of participation on Base. Its measure is fixed: 1 Witness Key = 1 Satoshi, backed one-to-one by cbBTC — real Bitcoin, verifiable on-chain.", "Every original run will have an Origin Key and will also carry Witness Keys. The Limited Editions just carry Witness Keys.", "A Key rests in one of two states: Sealed inside a piece's wallet, whole and intact; or Loose in a wallet on the live network, where witnesses acquire, dispose, and recirculate.", "The math runs the protocol. It is a **DAO** — Deterministic Automatic Operation. Every acquisition, disposition, and recirculation is calculated automatically by fixed rule. No owner. No admin. No governance. No intervention. The math decides."] },
              ];
              const PART2 = [
                { tag: "VERIFY", title: "Verify a Piece", intro: "Trust nothing. Check everything.",
                  body: "Tap the NFC chip, or paste the wallet address into the Vault. You'll see the piece's state at once — sealed or swept. If it carries an Origin Key, you'll see the inscription and a link to confirm it independently; match the owner address to the vault address and the Origin Key stands authentic. Below that, the Witness Keys it holds. Sealed means whole and intact." },
                { tag: "BEGINNERS", title: "Get cbBTC on Base", intro: "Your on-ramp, once.",
                  body: "To participate you need cbBTC on Base. Open Coinbase, buy Bitcoin, move it to Coinbase Wallet, and send it on the Base network to your wallet. It arrives as cbBTC — real Bitcoin on Base — ready to acquire Witness Keys." },
                { tag: "PARTICIPATE", title: "Acquire & Dispose", intro: "Step onto the live network.",
                  body: "Open Keychain, connect your wallet. Tap Acquire, enter the amount in Satoshis (minimum 100) — first time you approve cbBTC, then confirm; after that it's one tap. Tap Dispose to release Keys back for cbBTC, straight to your wallet. A fixed 7% recirculates through the network by math." },
                { tag: "THE TELLING", title: "Recirculation", intro: "A witness realizes their share by witnessing it.",
                  body: "Every acquisition and disposition carries a fixed 7% that recirculates to holders, proportionate to the Keys each wallet holds. Realize it as cbBTC in your wallet, or send it forward into more Witness Keys — deepening your standing in the network." },
                { tag: "BREAK THE GLASS", title: "Redeem", intro: "The seal is yours to break.",
                  body: "Every piece has a SeedPod sealed inside — the private key to its own wallet. Destroy the art, import the key, and everything the piece held is yours: the Witness Keys, the Origin Key, every Satoshi. On-chain, the vault stands swept from then on, plain for all to see. If the piece carried an Origin Key, you may instead list it on Gamma, UniSat, or Ordinals Wallet and let the provenance travel on." },
              ];
              const Card = (g: any, i: number) => (
                <div key={i} style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.blue}`, borderRadius: 6, padding: mobile ? "16px 16px" : "20px 22px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" as const }}>
                    <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: mobile ? 17 : 20, fontWeight: 400, color: C.blue }}>{g.title}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 9, color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 4, padding: "2px 8px", letterSpacing: "0.12em", fontWeight: 700 }}>{g.tag}</span>
                  </div>
                  <p style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: mobile ? 14 : 15, fontStyle: "italic", color: C.textDim, lineHeight: 1.5, margin: "0 0 10px" }}>{g.intro}</p>
                  {(Array.isArray(g.body) ? g.body : [g.body]).map((para: string, pi: number) => (
                    <p key={pi} style={{ fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif", fontSize: mobile ? 13 : 14, color: C.textDim, lineHeight: 1.7, margin: pi === 0 ? 0 : "10px 0 0" }}>{para.split("**").map((seg: string, si: number) => si % 2 === 1 ? <strong key={si} style={{ color: C.text, fontWeight: 700 }}>{seg}</strong> : seg)}</p>
                  ))}
                </div>
              );
              return (
                <>
                  <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, letterSpacing: "0.2em", color: C.textMuted, textTransform: "uppercase" as const, fontWeight: 700, textAlign: "center" as const, margin: "8px 0 12px" }}>Part I — Understand It</div>
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>{PART1.map(Card)}</div>

                  <div style={{ textAlign: "center" as const, fontFamily: "'Fraunces', Georgia, serif", fontSize: mobile ? 15 : 17, fontStyle: "italic", color: C.textMuted, margin: "26px 0" }}>Now you understand it. Here's how to use it.</div>

                  <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, letterSpacing: "0.2em", color: C.textMuted, textTransform: "uppercase" as const, fontWeight: 700, textAlign: "center" as const, margin: "0 0 12px" }}>Part II — Use It</div>
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>{PART2.map(Card)}</div>
                </>
              );
            })()}

            <div style={{ textAlign: "center" as const, marginTop: 24, fontFamily: "'Fraunces', Georgia, serif", fontSize: mobile ? 16 : 19, fontStyle: "italic", color: C.text }}>
              See everything. Touch nothing until the seal is broken.
            </div>

            {/* Closing teaser */}
            <div style={{ textAlign: "center" as const, marginTop: 40, paddingTop: 28, borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: mobile ? 18 : 22, fontWeight: 700, color: C.text, marginBottom: 8 }}>
                The first card grade no one can rig.
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: mobile ? 12 : 13, color: C.textMuted, letterSpacing: "0.04em", marginBottom: 14 }}>
                Seen by light. Sealed by math. Judged by the many.
              </div>
              <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: mobile ? 20 : 24, fontStyle: "italic", fontWeight: 700, color: C.blue }}>
                Coming to The Glass Vault.
              </div>
            </div>
          </div>
        )}

        {/* CONTRACT ADDRESSES — Witness Key page only */}
        {tab === "keychain" && (
        <div style={{ marginTop: 24, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            {[
              { label: "WK Contract",   value: WK_ADDRESS,  color: C.blue      },
              { label: "cbBTC Contract", value: CBBTC_ADDRESS, color: C.textMuted },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10, color: C.textMuted, letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6, fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: item.color, wordBreak: "break-all" as const, fontWeight: 600 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* FOOTER — matches home seal line (hidden on home; home has its own) */}
        {tab !== "home" && (
        <div style={{ textAlign: "center" as const, padding: "26px 28px 34px", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10.5, color: C.textMuted, letterSpacing: "0.2em", textTransform: "uppercase" as const }}>
          The Glass Vault<span style={{ verticalAlign: "super", fontSize: 7 }}>&trade;</span> <span style={{ color: C.blue, fontWeight: 500 }}>&middot; Patent Pending</span>
        </div>
        )}

      </div>
    </main>
  );
}
