"use client";
// @ts-ignore
import Head from "next/head";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { IEOK_ADDRESS, CBBTC_ADDRESS } from "@/lib/contracts";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";

const OKT_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function dividendsOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function buy(uint256 cbbtcAmount, uint256 minTokens) external",
  "function reinvest() external",
  "function sell(uint256 tokens, uint256 minCbbtc) external",
  "function transfer(address to, uint256 tokens) external returns (bool)",
  "function withdraw() external",
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
type Tab = "home" | "gallery" | "swap" | "vault" | "learn" | "inscribe";
type VaultResult = {
  registered: boolean;
  swept: boolean;
  balance: string;
  dividends: string;
  assetId: string;
  ordinalNumber: string;
  hasOrdinal: boolean;
  ordinalMoved: boolean;
  ordinalMovedAt: string;
  inscriptionId: string;
} | null;

const LIGHT = {
  bg:       "#FFFFFF",
  panel:    "#F5F7FA",
  card:     "#FFFFFF",
  input:    "#F5F7FA",
  border:   "#E0E4EC",
  blue:     "#0052FF",
  text:     "#0A0B0D",
  textDim:  "#2D3748",
  textMuted:"#5B6278",
  green:    "#00A878",
  red:      "#DA3A3A",
  orange:   "#E8913A",
  greenBg:  "#E6F7F3",
  redBg:    "#FDEAEA",
  orangeBg: "rgba(232,145,58,0.12)",
  blueBg:   "#E8EFFE",
  shadow:   "0 1px 3px rgba(0,0,0,0.08)",
};

const DARK = {
  bg:       "#1A1D24",
  panel:    "#22262F",
  card:     "#22262F",
  input:    "#22262F",
  border:   "#363B47",
  blue:     "#0052FF",
  text:     "#F0EDE6",
  textDim:  "#C5C0B8",
  textMuted:"#6B7280",
  green:    "#00A878",
  red:      "#DA3A3A",
  orange:   "#E8913A",
  greenBg:  "rgba(0,168,120,0.2)",
  redBg:    "rgba(218,58,58,0.2)",
  orangeBg: "rgba(232,145,58,0.12)",
  blueBg:   "rgba(0,82,255,0.15)",
  shadow:   "0 1px 3px rgba(0,0,0,0.4)",
};

const VAULT_REGISTRAR = "0x10DB4bf0C9e7c14f320C4e831CC85fFD8D15BE6D";
const CHAIN_ID        = "84532";
const CHAIN_LABEL     = "BASE SEPOLIA";
const BLOCK_EXPLORER  = "https://sepolia.basescan.org";

const satsToBtc = (s: number) => s / 1e8;
const satsToUsd = (s: number, p: number) => satsToBtc(s) * p;
const fmtUsd    = (n: number) => "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtAddr   = (v: string) => v ? v.slice(0, 6) + "..." + v.slice(-4) : "—";
const fmtCbbtc  = (v: string) => (Number(v) / 1e8).toFixed(6) + " cbBTC";
const fmtSats   = (v: string) => Number(v).toLocaleString() + " sats";
const fmtOK    = (v: string) => Number(v).toLocaleString() + " OKey";
const fmtTs     = (ts: string) => { const n = Number(ts); if (!n) return "—"; return new Date(n * 1000).toLocaleString(); };

function preview7(sats: string) {
  const n = Number(sats);
  if (!n) return null;
  const fee = Math.floor(n * 7 / 100);
  return { fee, out: n - fee };
}
function b32(str: string) { return ethers.encodeBytes32String(str.slice(0, 31)); }

const useIsMobile = () => {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    // Inject Oswald font
  if (typeof document !== "undefined" && !document.getElementById("oswald-font")) {
    const link = document.createElement("link");
    link.id = "oswald-font";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap";
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
          alt={`Ordinal #${ordinalNumber}`}
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

function SkeletonKey({ size = 28, dark = false }: { size?: number; dark?: boolean }) {
  const ratio = 190 / 86;
  const w = size * 0.55;
  const h = w * ratio;
  return (
    <img
      src="/okp-logo.png"
      width={w}
      height={h}
      alt="Origin Key"
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
      <span style={{ color: cfg.color, fontFamily: "Arial, sans-serif", fontSize: 15 }}>{cfg.icon} {msg}</span>
    </div>
  );
}

function FeeBadge({ mobile, theme }: { mobile: boolean; theme?: typeof LIGHT }) {
  const T = theme || LIGHT;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.blueBg, border: `1px solid ${T.blue}`, borderRadius: 8, padding: mobile ? "10px 14px" : "12px 18px", marginBottom: 24 }}>
      <span style={{ fontFamily: "Arial, sans-serif", fontSize: 18, color: T.blue }}>◈</span>
      <span style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 13 : 14, color: T.blue, fontWeight: 600 }}>
        7% fee on every buy and sell — distributed instantly to all Origin Key holders as cbBTC proceeds
      </span>
    </div>
  );
}

function Card({ label, value, sub, sub2, accent, theme }: { label: string; value: string; sub?: string; sub2?: string; accent?: boolean; theme?: typeof LIGHT }) {
  const T = theme || LIGHT;
  return (
    <div style={{ background: T.card, border: `1px solid ${T.blue}`, borderTop: `3px solid ${T.blue}`, borderRadius: "0 0 8px 8px", padding: "12px 16px", flex: 1, minWidth: 0, boxShadow: T.shadow }}>
      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, letterSpacing: "0.1em", color: T.textMuted, textTransform: "uppercase" as const, marginBottom: 10, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 22, fontWeight: 700, color: accent ? T.blue : T.text, lineHeight: 1, wordBreak: "break-all" as const }}>{value}</div>
      {sub  && <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: T.textMuted, marginTop: 6 }}>{sub}</div>}
      {sub2 && <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: T.green, marginTop: 3, fontWeight: 600 }}>{sub2}</div>}
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
      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: T.textDim, marginBottom: 8, fontWeight: 600 }}>{label}</div>
      <div style={{ position: "relative" as const }}>
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{ width: "100%", background: T.input, border: `2px solid ${T.text}`, borderRadius: 8, color: T.text, fontFamily: "Arial, sans-serif", fontSize: 14, padding: tag ? "8px 65px 8px 10px" : "8px 10px", outline: "none", boxSizing: "border-box" as const, WebkitAppearance: "none" as const }}
          onFocus={e => e.target.style.borderColor = T.blue}
          onBlur={e => e.target.style.borderColor = T.text}
        />
        {tag && <div style={{ position: "absolute" as const, right: 16, top: "50%", transform: "translateY(-50%)", fontFamily: "Arial, sans-serif", fontSize: 13, color: T.blue, fontWeight: 700 }}>{tag}</div>}
      </div>
      {hint && <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: T.textMuted, marginTop: 6 }}>{hint}</div>}
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
            <span style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: T.textMuted }}>{r.label}</span>
            <span style={{ fontFamily: "Arial, sans-serif", fontSize: 15, color: r.blue ? T.blue : T.textDim, fontWeight: r.blue ? 700 : 400, flexShrink: 0 }}>{r.value}</span>
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
    <button onClick={onClick} disabled={disabled} style={{ width: "100%", background: v.bg, color: v.color, border: v.border, borderRadius: 8, padding: "10px", fontFamily: "Arial, sans-serif", fontSize: 13, letterSpacing: "0.05em", textTransform: "uppercase" as const, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, marginBottom: 4, fontWeight: 700, WebkitTapHighlightColor: "transparent", boxShadow: disabled ? "none" : T.shadow }}>
      {children}
    </button>
  );
}

function Panel({ title, children, theme }: { title: string; children: React.ReactNode; theme?: typeof LIGHT }) {
  const T = theme || LIGHT;
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px", marginBottom: 8, boxShadow: T.shadow }}>
      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 16, color: T.blue, marginBottom: 20, fontWeight: 700 }}>{title}</div>
      {children}
    </div>
  );
}

const VIDEOS = [
  { title: "What is Immutable Editions?",
    desc: "The collectible space has always struggled with two problems. Authenticity — fake works, fake appraisals, expert opinions that can be bought. And fair value — where interest is measured by hype, not math. Immutable Editions solves both. Every piece carries on-chain provenance through Bitcoin Ordinals — permanent, verifiable, impossible to forge. Every piece carries Origin Key tokens that measure real interest through real transactions — buys, sells, and proceeds distributed by math. Where provenance and interest meet market integrity.",
    url: "https://youtube.com", tag: "START HERE", tc: "#00A878" },
  { title: "How to Verify a Piece",
    desc: "Tap the NFC chip on the art piece — or go to Vault Check and paste the wallet address. You'll see the vault status instantly — sealed or swept. If there's a linked Ordinal you'll see the actual inscription image and a link to verify on ordinals.com. Check that the owner address matches the vault address shown. If they match — the Ordinal is authentic and untouched. Below that you'll see the Origin Key balance — how many tokens are sealed inside. If proceeds are showing, the piece is actively earning from exchange activity. If the vault shows swept — someone has accessed the wallet and the provenance chain is broken.",
    url: "https://youtube.com", tag: "VERIFY", tc: "#00A878" },
  { title: "How Immutable Editions Use Ordinals",
    desc: "A Bitcoin Ordinal is data permanently written into the Bitcoin blockchain. It cannot be edited. It cannot be deleted. It cannot be faked. We inscribe every original work as an Ordinal using the Dublin Core Metadata Initiative — the same indexing standard used by libraries and museums worldwide. This is not a certificate of authenticity. This is not an expert opinion. This is not a slab grade. Those can be debated. Those can be forged. An Ordinal cannot. The record is cryptographically secured, fully transparent, and proves both the creation and ownership of the asset directly from the asset itself. Traditional provenance asks you to trust someone. An Ordinal asks you to verify math. That is Real World Inscription — and it is not up for debate. Ordinals are not Origin Keys. Ordinals are the permanent provenance layer on Bitcoin. Origin Keys are the value layer on Base chain. One proves the art is real. The other measures interest.",
    url: "https://youtube.com", tag: "ORDINALS", tc: "#0052FF" },
  { title: "What is an Origin Key?",
    desc: "An Origin Key is a physical art piece with a Bitcoin wallet sealed inside. That wallet holds Origin Key tokens on Base chain — and those tokens earn cbBTC proceeds from every single trade on the exchange. Origin Keys are not Ordinals. Ordinals are permanent inscriptions on Bitcoin — the provenance layer. Origin Keys are tokens on Base — the value layer. One proves the art is real. The other measures how much interest that art generates. Some pieces carry both. Some carry just Origin Keys. The art earns Bitcoin while it hangs on your wall. Destroy the art to redeem the Bitcoin. Until then — it earns.",
    url: "https://youtube.com", tag: "CONCEPT", tc: "#0052FF" },
  { title: "What is a DAO Contract?",
    desc: "A regular DAO is governed by votes. People argue. People lobby. People manipulate. A DAO Contract is governed by math. Every acquisition, every disposition, every proceed is calculated automatically. No admin can change it. No vote can override it. Math, not votes.",
    url: "https://youtube.com", tag: "DAO", tc: "#0052FF" },
  { title: "How to Get cbBTC on Base",
    desc: "To acquire Origin Keys you need cbBTC on Base chain. Open Coinbase. Buy Bitcoin. Go to Coinbase Wallet. Tap send. Choose Base network. Send to your wallet address. That's it — your Bitcoin is now cbBTC on Base. Ready to acquire.",
    url: "https://youtube.com", tag: "BEGINNERS", tc: "#00A878" },
  { title: "How to Acquire Origin Keys",
    desc: "Go to the SWAP tab. Connect your wallet. Tap Acquire. Enter the amount in satoshis — minimum 100. First time you'll see two wallet popups — first to approve cbBTC, then to buy. After that it's one tap. Your Origin Keys appear in your balance and start earning proceeds immediately.",
    url: "https://youtube.com", tag: "TRADING", tc: "#0052FF" },
  { title: "How to Dispose Origin Keys",
    desc: "Go to the SWAP tab. Tap Dispose. Enter how many Origin Keys to sell. cbBTC goes directly to your wallet. Seven percent fee gets distributed to every other holder as proceeds. Simple.",
    url: "https://youtube.com", tag: "TRADING", tc: "#0052FF" },
  { title: "How to Claim Proceeds",
    desc: "Every trade on the exchange generates a seven percent fee. That fee is split proportionally to everyone holding Origin Keys. Your share shows in the Proceeds box. Tap Claim Satoshis to withdraw cbBTC to your wallet. Or tap Repurchase to convert proceeds into more Origin Keys.",
    url: "https://youtube.com", tag: "PROCEEDS", tc: "#0052FF" },
  { title: "What Happens When You Destroy the Art?",
    desc: "Every Origin Key has a private key sealed inside — physically sealed. To access the Bitcoin in that wallet you have to destroy the art piece. Import the private key into a wallet. The Origin Keys and any unclaimed proceeds are yours. But the vault is permanently marked as swept on chain. Everyone can see it. The provenance is broken forever. Alternatively, if the piece carries a Bitcoin Ordinal, you may choose to sell the Ordinal on marketplaces like Gamma, UniSat, or Ordinals Wallet instead of destroying the physical art.",
    url: "https://youtube.com", tag: "REDEMPTION", tc: "#DA3A3A" },
];

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
      return localStorage.getItem("okt-theme") === "dark";
    }
    return false;
  });
  const C = darkMode ? DARK : LIGHT;

  useEffect(() => {
    localStorage.setItem("okt-theme", darkMode ? "dark" : "light");
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
      const okt   = new ethers.Contract(IEOK_ADDRESS,  OKT_ABI,   provider);
      const [cb, ob, dv, ts] = await Promise.all([
        cbbtc.balanceOf(user), okt.balanceOf(user),
        okt.dividendsOf(user), okt.totalSupply(),
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
      const tx = await cbbtc.approve(IEOK_ADDRESS, BigInt("100000000")); // 1 BTC max approval
      setAppM("Approving — waiting for confirmation...");
      await tx.wait();
      await new Promise(resolve => setTimeout(resolve, 1500));
      setIsApproved(true);
      setAppS("success"); setAppM("cbBTC approved ✓ — now tap Acquire Origin Keys");
    } catch (e: any) { setAppS("failed"); setAppM(e.reason || e.message || "Approval failed"); }
  }

  async function buy() {
    if (!account) { alert("Connect wallet first"); return; }
    if (!buyAmt)  { alert("Enter cbBTC amount");   return; }
    if (Number(buyAmt) < 100) { alert("Minimum buy is 100 sats"); return; }
    const s = await getSigner();
    const cbbtc = new ethers.Contract(CBBTC_ADDRESS, CBBTC_ABI, s);
    const okt   = new ethers.Contract(IEOK_ADDRESS,  OKT_ABI,   s);
    setBuyS("pending"); setBuyM("Confirm purchase in your wallet...");
    try {
      // Approve exact amount then buy — safest for users
      const approveTx = await cbbtc.approve(IEOK_ADDRESS, BigInt(buyAmt));
      await approveTx.wait();
      setBuyM("Approved — now buying...");
      const tx = await okt.buy(BigInt(buyAmt), BigInt(0));
      setBuyM("Confirming on chain...");
      await tx.wait();
      setBuyS("success"); setBuyM("Purchase confirmed — OKT tokens received");
      if (account) await load(account);
    } catch (e: any) {
      setBuyS("failed");
      const msg = e.reason || e.message || "";
      if (msg.includes("Minimum 100 sats")) {
        setBuyM("Minimum purchase is 100 sats.");
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
    if (!sellAmt) { alert("Enter OKT amount");     return; }
    const s = await getSigner();
    const okt = new ethers.Contract(IEOK_ADDRESS, OKT_ABI, s);
    setSellS("pending"); setSellM("Awaiting wallet...");
    try {
      await (await okt.sell(BigInt(sellAmt), BigInt(0))).wait();
      setSellS("success"); setSellM("");
      if (account) await load(account);
    } catch (e: any) {
      setSellS("failed");
      const msg = e.reason || e.message || "";
      if (msg.includes("Minimum 100")) {
        setSellM("Minimum 100 Origin Keys to sell.");
      } else if (msg.includes("Cannot sell entire supply")) {
        setSellM("Cannot sell — at least 1 Origin Key must remain in total supply. Try a smaller amount.");
      } else if (msg.includes("Insufficient balance")) {
        setSellM("You don't have enough Origin Keys to sell that amount.");
      } else if (msg.includes("Slippage")) {
        setSellM("Price moved — try again or reduce your amount.");
      } else if (msg.includes("user rejected") || msg.includes("User denied")) {
        setSellM("Transaction cancelled.");
      } else if (msg.includes("coalesce") || msg.includes("Unexpected error") || msg.includes("-32603") || msg.includes("insufficient funds")) {
        setSellM("This wallet needs ETH on Base to pay gas fees. Send a small amount of ETH first.");
      } else if (msg.includes("CALL_EXCEPTION") || msg.includes("missing revert")) {
        setSellM("Minimum 100 Origin Keys to sell.");
      } else {
        setSellM("Sell failed — check your balance and try again.");
      }
    }
  }

  async function withdraw() {
    if (!account) { alert("Connect wallet first"); return; }
    const s = await getSigner();
    const okt = new ethers.Contract(IEOK_ADDRESS, OKT_ABI, s);
    setWdS("pending"); setWdM("Awaiting wallet...");
    try {
      await (await okt.withdraw()).wait();
      setWdS("success"); setWdM("cbBTC proceeds sent to your wallet");
      if (account) await load(account);
    } catch (e: any) {
      setWdS("failed");
      const msg = e.reason || e.message || "";
      if (msg.includes("No proceeds") || msg.includes("No dividends")) {
        setWdM("No proceeds to claim.");
      } else if (msg.includes("user rejected") || msg.includes("User denied")) {
        setWdM("Transaction cancelled.");
      } else if (msg.includes("coalesce") || msg.includes("Unexpected error") || msg.includes("-32603") || msg.includes("insufficient funds")) {
        setWdM("This wallet needs ETH on Base to pay gas fees. Send a small amount of ETH to this address first.");
      } else {
        setWdM("Claim failed — try again.");
      }
    }
  }

  async function reinvest() {
    if (!account) { alert("Connect wallet first"); return; }
    const s = await getSigner();
    const okt = new ethers.Contract(IEOK_ADDRESS, OKT_ABI, s);
    setRvS("pending"); setRvM("Awaiting wallet...");
    try {
      await (await okt.reinvest()).wait();
      setRvS("success"); setRvM("Dividends repurchaseed — new OKT tokens received");
      if (account) await load(account);
    } catch (e: any) {
      setRvS("failed");
      const msg = e.reason || e.message || "";
      if (msg.includes("Minimum 100 sats") || msg.includes("missing revert") || msg.includes("CALL_EXCEPTION")) {
        setRvM("You need at least 100 sats in proceeds to repurchase. Keep earning.");
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
    const okt = new ethers.Contract(IEOK_ADDRESS, OKT_ABI, s);
    setTxS("pending"); setTxM("Awaiting wallet...");
    try {
      await (await okt.transfer(txTo, BigInt(txAmt))).wait();
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
        setTxM("You don't have enough Origin Keys to transfer that amount.");
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
    if (Number(insCbbtc) < 100) { alert("Minimum inscribe is 100 sats"); return; }
    const s = await getSigner();
    const cbbtc = new ethers.Contract(CBBTC_ADDRESS, CBBTC_ABI, s);
    const okt   = new ethers.Contract(IEOK_ADDRESS,  OKT_ABI,   s);
    setInsS("pending"); setInsM("Checking cbBTC allowance...");
    try {
      await ensureAllowance(cbbtc, account, IEOK_ADDRESS, BigInt(insCbbtc), setInsM);
      setInsM("Confirm inscription in your wallet...");
      const ordNum = insOrd ? BigInt(insOrd) : BigInt(0);
      const vaultAddr = ethers.getAddress(insVault); // checksum — prevents ENS lookup
      const tx = await okt.inscribe(vaultAddr, b32(insAsset), BigInt(insCbbtc), ordNum, insInsId);
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
    const okt = new ethers.Contract(IEOK_ADDRESS, OKT_ABI, s);
    setRepS("pending"); setRepM("Awaiting wallet...");
    try {
      await (await okt.reportOrdinalMoved(BigInt(repOrd))).wait();
      setRepS("success"); setRepM(`Ordinal #${repOrd} marked as moved — permanent on chain`);
    } catch (e: any) { setRepS("failed"); setRepM(e.reason || e.message || "Report failed"); }
  }

  async function checkVault() {
    if (!vAddr) { alert("Enter a vault address"); return; }
    setVS("pending"); setVM("Querying vault registry...");
    try {
      const provider = new ethers.JsonRpcProvider(PUBLIC_RPC);
      const okt = new ethers.Contract(IEOK_ADDRESS, OKT_ABI, provider);
      const [core, ordinal, divAmount] = await Promise.all([
        okt.vaultStatus(vAddr),
        okt.vaultOrdinalStatus(vAddr),
        okt.dividendsOf(vAddr),
      ]);
      const [registered, swept, balance, assetId]                    = core;
      const [ordinalNumber, hasOrdinal, ordinalMoved, ordinalMovedAt, inscriptionId] = ordinal;
      setVResult({ registered, swept, balance: balance.toString(), dividends: divAmount.toString(), assetId: assetId.toString(), ordinalNumber: ordinalNumber.toString(), hasOrdinal, ordinalMoved, ordinalMovedAt: ordinalMovedAt.toString(), inscriptionId: inscriptionId || "" });
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
        const allowance = await cbbtc.allowance(account, IEOK_ADDRESS);
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
    if (v) { setVAddr(v); setTab("vault"); }
  }, []);
  useEffect(() => { if (vAddr && tab === "vault" && !autoChecked) { setAutoChecked(true); setTimeout(() => checkVault(), 300); } }, [vAddr, tab]);

  const bPrev    = preview7(buyAmt);
  const sPrev    = preview7(sellAmt);
  const insPrev  = preview7(insCbbtc);
  const cbbtcNum = Number(cbbtcBal);
  const oktNum   = Number(oktBal);
  const divsNum  = Number(divs);
  const supplyNum= Number(supply);
  const cbbtcUsd = btcPrice > 0 ? fmtUsd(satsToUsd(cbbtcNum, btcPrice)) : "";
  const oktUsd   = btcPrice > 0 ? fmtUsd(satsToUsd(oktNum,   btcPrice)) : "";
  const divsUsd  = btcPrice > 0 ? fmtUsd(satsToUsd(divsNum,  btcPrice)) : "";
  const accountStr   = account ?? "";
  const isRegistrar  = accountStr.toLowerCase() === VAULT_REGISTRAR.toLowerCase();

  const tabs: { id: Tab; label: string; short: string }[] = [
    { id: "gallery",  label: "GALLERY",     short: "GALLERY"  },
    { id: "swap",     label: "SWAP",        short: "SWAP"     },
    { id: "vault",    label: "VAULT CHECK", short: "VAULT"    },
    { id: "learn",    label: "CONDUCT",     short: "CONDUCT"  },
    ...(isRegistrar ? [{ id: "inscribe" as Tab, label: "INSCRIBE", short: "INSCRIBE" }] : []),
  ];

  return (
    <main style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "Arial, sans-serif", touchAction: "pan-y", WebkitOverflowScrolling: "touch" as any, overscrollBehavior: "none" }}>

      {/* HEADER */}
      <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: 0, display: "flex", flexDirection: "column" as const, alignItems: "center", position: "fixed" as const, top: 0, left: 0, right: 0, zIndex: 100, boxShadow: C.shadow }}>
        {/* ROW 1 — cbBTC price left, dark mode right */}
        <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: mobile ? "6px 12px" : "6px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <CbbtcLogo size={mobile ? 20 : 22} />
            {btcPrice > 0 && (
              <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: C.textMuted }}>
                BTC {fmtUsd(btcPrice)}
              </div>
            )}
          </div>
          <button
            onClick={() => setDarkMode(!darkMode)}
            style={{ background: darkMode ? "#2A2D35" : C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 8px", cursor: "pointer", color: C.textMuted, display: "flex", alignItems: "center", gap: 4, WebkitTapHighlightColor: "transparent" }}
          >
            {darkMode ? <SunIcon /> : <MoonIcon />}
            {!mobile && <span style={{ fontFamily: "Arial, sans-serif", fontSize: 10, fontWeight: 600 }}>{darkMode ? "Light" : "Dark"}</span>}
          </button>
        </div>

        {/* ROW 2 — IMMUTABLE EDITIONS centered */}
        <div style={{ padding: mobile ? "2px 0 4px" : "2px 0 6px" }}>
          <span onClick={() => setTab("home")} style={{ fontFamily: "Georgia, serif", fontSize: mobile ? 22 : 30, fontWeight: 400, color: C.text, letterSpacing: "0.08em", textTransform: "uppercase" as const, cursor: "pointer" }}>
            Immutable Editions
          </span>
        </div>

        {/* ROW 3 — Tabs with line that fits under title */}
        <div style={{ display: "inline-flex", justifyContent: "center", borderTop: `1px solid ${C.border}`, overflowX: "auto" as const, WebkitOverflowScrolling: "touch" as const, scrollbarWidth: "none" as const }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ flexShrink: 0, padding: mobile ? "7px 10px" : "8px 18px", fontFamily: "Georgia, serif", fontSize: mobile ? 12 : 14, letterSpacing: "0.08em", background: "transparent", color: tab === t.id ? C.blue : C.textMuted, border: "none", borderBottom: tab === t.id ? `2px solid ${C.blue}` : "2px solid transparent", cursor: "pointer", fontWeight: 500, WebkitTapHighlightColor: "transparent", whiteSpace: "nowrap" as const, textTransform: "uppercase" as const }}>
              {mobile ? t.short : t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: mobile ? 100 : 115 }} />







      <div style={{ maxWidth: 880, margin: "0 auto", padding: mobile ? "20px 12px" : "32px 24px" }}>



        {/* HOME */}
        {tab === "home" && (
          <div>
            {/* HERO */}
            <div style={{ textAlign: "center" as const, padding: mobile ? "48px 0 40px" : "64px 0 56px" }}>

              <h1 style={{ fontFamily: "Georgia, serif", fontSize: mobile ? 36 : 56, fontWeight: 400, color: C.text, lineHeight: 1.1, margin: "0 0 24px", letterSpacing: "-0.02em" }}>
                Where Provenance<br/>and Interest meet<br/>
                <span style={{ color: C.blue, fontStyle: "italic" }}>Market Integrity.</span>
              </h1>
              <p style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 15 : 18, color: C.textMuted, lineHeight: 1.7, maxWidth: 600, margin: "0 auto 40px", fontWeight: 300 }}>
                The collectible space has always struggled with authenticity and fair value. We built the infrastructure to fix both — permanently, on chain, with no one in control.
              </p>

            </div>

            {/* CANVA VIDEO */}
            <div style={{ margin: "48px auto 0", maxWidth: 320, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}` }}>
              <div style={{ position: "relative" as const, paddingBottom: "177.78%", height: 0 }}>
                <iframe
                  src="https://www.canva.com/design/DAHKUQElnjQ/KEZ-IoKy9KaXVkTgCgBh0g/watch?embed"
                  style={{ position: "absolute" as const, top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                  loading="lazy"
                  allowFullScreen
                  title="Immutable Editions"
                />
              </div>
            </div>

            {/* DIVIDER */}
            <div style={{ height: 1, background: C.border, margin: "56px 0 56px" }} />

            {/* THE PROBLEM */}
            <div style={{ textAlign: "center" as const, marginBottom: 56 }}>
              <p style={{ fontFamily: "Georgia, serif", fontSize: mobile ? 20 : 28, color: C.textDim, lineHeight: 1.5, maxWidth: 700, margin: "0 auto", fontStyle: "italic", fontWeight: 400 }}>
                "The collectable market runs on trust — but trust is not provenance, interest is not measured accurately, and integrity is not always enforced."
              </p>
            </div>

            {/* THREE PILLARS */}
            <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr 1fr", gap: mobile ? 16 : 20, marginBottom: 56 }}>
              {[
                {
                  label: "Provenance",
                  title: "Real World Inscriptions",
                  desc: "Tokenizing physical collectables with the unquestionable Bitcoin Ordinal standard. Using the embedded SeedPod (wallet private key) and NFC scan for verification of provenance. Tap any piece to see its entire origin — unalterable, on chain, forever.",
                  site: "AnalogBitcoin.com",
                  url: "https://analogbitcoin.com",
                  tab: null,
                },
                {
                  label: "Interest",
                  title: "Origin Key",
                  desc: "Every physical creation is embedded with Origin Keys at birth. Held tokens earn cbBTC yield each time another creation comes to life or when a trade happens. Fees from every collectable creation (and OKT trade) flow automatically to all holders — including each already (still Vaulted) creation.",
                  site: "Acquire Origin Keys",
                  url: null,
                  tab: "trade",
                },
                {
                  label: "Market Integrity",
                  title: "The Key Exchange",
                  desc: "Deployed on Base for the best performance and support. The Origin Key is pegged to Bitcoin (1 OKT = 1 Sat). The protocol has been audited. There is no admin. No governance. No intervention. The market is pure math.",
                  site: "Verify a Piece",
                  url: null,
                  tab: "vault",
                },
              ].map((p, i) => (
                <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderTop: `3px solid ${C.blue}`, borderRadius: "0 0 12px 12px", padding: "28px 24px", boxShadow: C.shadow }}>
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", color: C.blue, textTransform: "uppercase" as const, marginBottom: 12 }}>
                    {p.label}
                  </div>
                  <div style={{ fontFamily: "Georgia, serif", fontSize: 20, color: C.text, marginBottom: 14, lineHeight: 1.2 }}>
                    {p.title}
                  </div>
                  <p style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: C.textMuted, lineHeight: 1.7, marginBottom: 20, fontWeight: 300 }}>
                    {i === 1 ? (
                      <>Every physical creation is embedded with Origin Keys at birth. Held tokens earn <img src="/coinbase-wrapped-btc.png" width={18} height={18} alt="cbBTC" style={{ display: "inline", verticalAlign: "middle", margin: "0 1px -2px 1px" }} /> cbBTC yield each time another creation comes to life or when a trade happens. Fees from every collectable creation (and OKT trade) flow automatically to all holders — including each already (still Vaulted) creation.</>
                    ) : i === 2 ? (
                      <>Deployed on Base for the best performance and support. The Origin Key is pegged to Bitcoin (1 OKT = 1 Sat) so volatility in Automated Market Maker pricing <span style={{ color: "#DA3A3A", fontWeight: 700 }}>IS NOT HERE</span> to provide extractors one of their most valuable weapons. The protocol has been audited. There is no admin. No governance. No intervention. The market is pure math.</>
                    ) : p.desc}
                  </p>
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.blue, fontWeight: 600, textDecoration: "none" }}>
                      {p.site} ↗
                    </a>
                  ) : (
                    <button onClick={() => setTab(p.tab as Tab)} style={{ background: "none", border: "none", padding: 0, fontFamily: "Arial, sans-serif", fontSize: 13, color: C.blue, fontWeight: 600, cursor: "pointer" }}>
                      {p.site} →
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* HOW IT WORKS */}
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: mobile ? "32px 24px" : "40px 48px", marginBottom: 56 }}>
              <div style={{ fontFamily: "Arial, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", color: C.blue, textTransform: "uppercase" as const, marginBottom: 24 }}>
                How It Works
              </div>
              <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(5, 1fr)", gap: mobile ? 20 : 12 }}>
                {[
                  { n: "01", title: "Vault the Ordinal and Origin Keys", desc: "Both digital assets are placed in two different digital wallets — both sharing the same Private Key within the SeedPod." },
                  { n: "02", title: "Physical Art", desc: "A finished physical collectable is embedded with the SeedPod (printed wallet Private Key) along with a programmed read-only NFC Tag. Sealed securely within the asset." },
                  { n: "03", title: "Vault Verification", desc: "The owner can scan the NFC Tag anytime to see the Ordinal and Origin Keys along with the yield earned." },
                  { n: "04", title: "Physical Bitcoin Interest", desc: "" },
                  { n: "05", title: "Redemption (if necessary)", desc: "Destruction of the collectable can reveal the SeedPod one can use to sweep all digital assets out of the Vault." },
                ].map((s, i) => (
                  <div key={i} style={{ position: "relative" as const }}>
                    <div style={{ fontFamily: "Georgia, serif", fontSize: 32, color: C.border, fontWeight: 400, lineHeight: 1, marginBottom: 10 }}>{s.n}</div>
                    <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>{s.title}</div>
                    <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: C.textMuted, lineHeight: 1.6, fontWeight: 300 }}>
                      {i === 3 ? (
                        <>Every published work and trade pays <img src="/coinbase-wrapped-btc.png" width={14} height={14} alt="cbBTC" style={{ display: "inline", verticalAlign: "middle", margin: "0 1px -2px 1px" }} /> cbBTC proceeds to all Immutable Editions collectable holders and Origin Key holders.</>
                      ) : s.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* FOOTER CTA */}
            <div style={{ textAlign: "center" as const, padding: mobile ? "32px 0 48px" : "40px 0 64px" }}>
              <div style={{ fontFamily: "Georgia, serif", fontSize: mobile ? 24 : 36, color: C.text, marginBottom: 16, fontStyle: "italic" }}>
                Ready to own a piece of the future?
              </div>
              <p style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: C.textMuted, marginBottom: 32, fontWeight: 300 }}>
                Collect physical assets that represent a trustless, permissionless and unquestionable integrity.
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" as const }}>
                <a href="https://analogbitcoin.com" target="_blank" rel="noopener noreferrer" style={{ background: C.blue, color: "#FFFFFF", border: "none", borderRadius: 8, padding: "14px 32px", fontFamily: "Arial, sans-serif", fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em", textDecoration: "none", display: "inline-block" }}>
                  Explore Analog Bitcoin
                </a>
                <button onClick={() => setTab("swap")} style={{ background: "transparent", color: C.blue, border: `2px solid ${C.blue}`, borderRadius: 8, padding: "14px 32px", fontFamily: "Arial, sans-serif", fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em" }}>
                  Start Trading
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TRADE */}
        {tab === "gallery" && (
          <>
            {/* GALLERY NAVIGATION */}
            {galleryView === "pieces" && (
              <button onClick={() => { setGalleryView("collections"); setSelectedPiece(null); }}
                style={{ background: "none", border: "none", color: C.blue, fontFamily: "Arial, sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 16, padding: 0 }}>
                ← Back to Collections
              </button>
            )}

            {/* GALLERY — Artist Bio + Collections */}
            {galleryView !== "pieces" && galleryData && galleryData.artists.length > 0 && (() => {
              const artist = galleryData.artists[0];
              return (
              <>
                <div style={{ textAlign: "center" as const, marginBottom: 28 }}>
                  <div style={{ fontFamily: "Georgia, serif", fontSize: mobile ? 22 : 28, fontWeight: 400, color: C.text, letterSpacing: "0.06em", marginBottom: 12 }}>Michael James Slattery</div>
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 13 : 14, color: C.textDim, lineHeight: 1.8, maxWidth: 640, margin: "0 auto", marginBottom: 16 }}>
                    Michael, The Luminist, captures the profound intersection of civilization and nature. Fusing hours-long exposures with darkroom alchemy, his archival prints reveal the extraordinary light hidden within the ordinary.
                    <br /><br />
                    Today, he pioneers the future of provenance and interest via Immutable Editions. By inscribing his physical masterpieces as Bitcoin Ordinals, he anchors art to history's most secure ledger. Furthermore, every edition acts as an Origin Key Token (OKT) vault, continuously yielding Bitcoin upon subsequent publishing of new work.
                    <br /><br />
                    A sovereign creator, Michael masters every phase of his craft — from hand-building the physical frames to authoring the on-chain inscriptions. From capture to collector, with zero intermediaries.
                  </div>
                  <div style={{ fontFamily: "Georgia, serif", fontSize: mobile ? 13 : 15, color: C.textMuted, fontStyle: "italic", marginBottom: 8 }}>
                    "Most art captures just a moment of perception. OKT Luminism captures what could be."
                  </div>
                  <a href="https://ilikewhatisee.com" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: C.blue, fontWeight: 600, textDecoration: "none" }}>
                    Michael's wall art — ilikewhatisee.com ↗
                  </a>
                </div>

                {artist.canvaEmbed && (
                  <div style={{ maxWidth: artist.canvaAspect === "vertical" ? 280 : 500, margin: "0 auto 24px", borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
                    <div style={{ position: "relative" as const, paddingBottom: artist.canvaAspect === "vertical" ? "177.78%" : "56.25%", height: 0 }}>
                      <iframe src={artist.canvaEmbed + "?embed"} style={{ position: "absolute" as const, top: 0, left: 0, width: "100%", height: "100%", border: "none" }} loading="lazy" allowFullScreen />
                    </div>
                  </div>
                )}

                <div style={{ fontFamily: "Arial, sans-serif", fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 16 }}>Collections</div>
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
                          <div style={{ fontFamily: "Arial, sans-serif", fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>{col.name}</div>
                          <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.textMuted, marginBottom: 6 }}>{col.description}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: C.blue, fontWeight: 600 }}>{col.pieces.length} Piece{col.pieces.length !== 1 ? "s" : ""} →</div>
                            {col.private && !unlockedCollections.has(col.id) && <span style={{ fontFamily: "Arial, sans-serif", fontSize: 12 }}>🔒</span>}
                            {col.private && unlockedCollections.has(col.id) && <span style={{ fontFamily: "Arial, sans-serif", fontSize: 12 }}>🔓</span>}
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
                <div style={{ fontFamily: "Arial, sans-serif", fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>{selectedCollection.name}</div>
                <div style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: C.textMuted, marginBottom: 12 }}>by {selectedArtist?.name} · {selectedCollection.description}</div>
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
                      style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", cursor: "pointer", boxShadow: C.shadow, transition: "border-color 0.2s" }}
                      onMouseEnter={(e: any) => e.currentTarget.style.borderColor = C.blue}
                      onMouseLeave={(e: any) => e.currentTarget.style.borderColor = C.border}>
                      {piece.inscriptionId ? (
                        <img src={`https://ordinals.com/content/${piece.inscriptionId}`} alt={piece.name}
                          style={{ width: "100%", height: mobile ? 120 : 160, objectFit: "cover" }}
                          onError={(e: any) => { e.target.style.display = "none"; }} />
                      ) : (
                        <div style={{ width: "100%", height: mobile ? 120 : 160, background: C.panel, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted }}>Origin Keys Only</span>
                        </div>
                      )}
                      <div style={{ padding: 8 }}>
                        <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{piece.name}</div>
                        <div style={{ fontFamily: "Arial, sans-serif", fontSize: 10, color: C.textMuted }}>{piece.type === "original" ? "Original · " + piece.edition : "Limited · " + piece.edition}</div>
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
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 4 }}>{selectedPiece.name}</div>

                  {/* Type and edition */}
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.blue, fontWeight: 600, marginBottom: 12 }}>
                    {selectedPiece.type === "original" ? `Original · ${selectedPiece.edition}` : `Limited Edition · ${selectedPiece.edition}`}
                  </div>

                  {/* Details */}
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 8, marginBottom: 16 }}>
                    {selectedPiece.ordinalNumber && selectedPiece.ordinalNumber !== "0" && (
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.textDim }}>
                        Ordinal #{selectedPiece.ordinalNumber}
                      </div>
                    )}
                    {selectedPiece.oktAmount && (
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.textDim }}>
                        {Number(selectedPiece.oktAmount).toLocaleString()} Origin Keys sealed
                      </div>
                    )}
                    {selectedPiece.vault && (
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: C.textMuted }}>
                        Minted to: <span style={{ fontFamily: "monospace", fontSize: 11 }}>{selectedPiece.vault}</span>
                      </div>
                    )}
                  </div>

                  {/* Links */}
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>

                    {selectedPiece.shopifyUrl && (
                      <a href={selectedPiece.shopifyUrl} target="_blank" rel="noopener noreferrer"
                        style={{ display: "block", background: C.green, borderRadius: 8, padding: "12px 16px", fontFamily: "Arial, sans-serif", fontSize: 14, color: "#FFFFFF", textDecoration: "none", fontWeight: 700, textAlign: "center" as const }}>
                        Purchase This Piece ↗
                      </a>
                    )}
                    {selectedPiece.vault && (
                      <button onClick={(e: any) => { e.stopPropagation(); setSelectedPiece(null); setVAddr(selectedPiece.vault); setTab("vault"); }}
                        style={{ display: "block", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 16px", fontFamily: "Arial, sans-serif", fontSize: 13, color: C.textDim, fontWeight: 700, cursor: "pointer", textAlign: "center" as const, width: "100%" }}>
                        Check Vault Status →
                      </button>
                    )}

                  </div>

                  {/* Close button */}
                  <button onClick={() => setSelectedPiece(null)} style={{ marginTop: 16, width: "100%", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px", fontFamily: "Arial, sans-serif", fontSize: 13, color: C.textMuted, cursor: "pointer", fontWeight: 600 }}>Close</button>
                </div>
              </div>
            )}
          </>
        )}

        {tab === "swap" && (
          <>
          {/* SWAP HEADER — Origin Key Token + DAO */}
          <div style={{ textAlign: "center" as const, marginBottom: 12, padding: "4px 0" }}>
            <div style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 11 : 12, color: C.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
              Origin Key tokens are denominated 1:1 in Satoshis using cbBTC, tokenized Bitcoin issued by Coinbase.
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 8 }}>
              <SkeletonKey size={36} dark={darkMode} />
              <span style={{ fontFamily: "Georgia, serif", fontSize: mobile ? 22 : 28, fontWeight: 400, color: C.blue, letterSpacing: "0.06em" }}>Origin Key Token</span>
            </div>
            <div style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 13 : 14, fontWeight: 700, color: C.textDim, marginBottom: 10 }}>
              Deterministic Automatic Operation (DAO) Contract
            </div>
            <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr 1fr", gap: 8, marginBottom: 6 }}>
              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: C.textDim, lineHeight: 1.5 }}>The Origin Key Token's 7% fee is distributed proportionately via unquestionable math to Immutable Edition Collectables and active holders who acquire OKT only.</div>
              </div>
              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontFamily: "Arial, sans-serif", fontSize: 15, color: C.textDim, lineHeight: 1.5, fontWeight: 700 }}>Absolutely no brokers or influencers benefit.</div>
              </div>
              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontFamily: "Arial, sans-serif", fontSize: 17, color: C.blue, lineHeight: 1.5, fontWeight: 700 }}>Only collectors and creators.</div>
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: C.border, marginBottom: 12 }} />

          {/* CONNECT + PORTFOLIO CARDS — inside swap tab, 35% smaller */}
          {connected ? (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <ConnectButton
                  showBalance={false}
                  chainStatus="none"
                  accountStatus="address"
                />
              </div>

              {/* PROCEEDS BANNER — above balance boxes */}
              {divsNum > 0 && (
                <div style={{ background: C.blueBg, border: `1px solid ${C.blue}`, borderRadius: 8, padding: mobile ? "10px 12px" : "10px 16px", marginBottom: 8, display: "flex", flexDirection: mobile ? "column" : "row" as const, alignItems: mobile ? "stretch" : "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.blue, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                    <CbbtcLogo size={14} />{fmtSats(divs)} cbBTC proceeds available
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={withdraw} style={{ background: C.blue, color: "#FFFFFF", border: "none", borderRadius: 6, padding: "8px 16px", fontFamily: "Arial, sans-serif", fontSize: 12, cursor: "pointer", fontWeight: 700, letterSpacing: "0.05em" }}>Claim Satoshis</button>
                    <button onClick={reinvest}
                      onMouseEnter={(e: any) => { e.currentTarget.style.background = C.blue; e.currentTarget.style.color = "#FFFFFF"; }}
                      onMouseLeave={(e: any) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.blue; }}
                      style={{ background: "transparent", color: C.blue, border: `1px solid ${C.blue}`, borderRadius: 6, padding: "8px 16px", fontFamily: "Arial, sans-serif", fontSize: 12, cursor: "pointer", fontWeight: 700, letterSpacing: "0.05em", transition: "all 0.15s ease" }}>Repurchase</button>
                  </div>
                  <div><Status state={wdS} msg={wdM} theme={C} /><Status state={rvS} msg={rvM} theme={C} /></div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 1, background: C.border, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
                <div style={{ background: C.card, padding: "8px 10px" }}>
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: "0.1em", color: C.textMuted, textTransform: "uppercase" as const, fontWeight: 600, marginBottom: 4 }}>cbBTC Balance</div>
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 15, fontWeight: 700, color: C.text }}>{fmtSats(cbbtcBal)}</div>
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 10, color: C.textMuted }}>{fmtCbbtc(cbbtcBal)}</div>
                  {cbbtcUsd && <div style={{ fontFamily: "Arial, sans-serif", fontSize: 10, color: C.green, fontWeight: 600 }}>{cbbtcUsd}</div>}
                </div>
                <div style={{ background: C.card, padding: "8px 10px" }}>
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: "0.1em", color: C.textMuted, textTransform: "uppercase" as const, fontWeight: 600, marginBottom: 4 }}>Keys Held</div>
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 15, fontWeight: 700, color: C.text }}>{fmtOK(oktBal)}</div>
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 10, color: C.textMuted }}>{fmtSats(oktBal)}</div>
                  {oktUsd && <div style={{ fontFamily: "Arial, sans-serif", fontSize: 10, color: C.green, fontWeight: 600 }}>{oktUsd}</div>}
                </div>
                <div style={{ background: C.card, padding: "8px 10px", borderTop: `2px solid ${C.blue}` }}>
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: "0.1em", color: C.blue, textTransform: "uppercase" as const, fontWeight: 600, marginBottom: 4 }}>Proceeds</div>
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 15, fontWeight: 700, color: C.blue }}>{fmtSats(divs)}</div>
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 10, color: C.textMuted }}>{fmtCbbtc(divs)}</div>
                  {divsUsd && <div style={{ fontFamily: "Arial, sans-serif", fontSize: 10, color: C.green, fontWeight: 600 }}>{divsUsd}</div>}
                </div>
                <div style={{ background: C.card, padding: "8px 10px" }}>
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 9, letterSpacing: "0.1em", color: C.textMuted, textTransform: "uppercase" as const, fontWeight: 600, marginBottom: 4 }}>Total Key Supply</div>
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 15, fontWeight: 700, color: C.text }}>{fmtOK(supply)}</div>
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 10, color: C.textMuted }}>{fmtSats(supply)}</div>
                </div>
              </div>


              {/* Wallet address */}
              {connected && account && (
                <div style={{ textAlign: "center" as const, marginTop: 8, fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted }}>
                  Your Wallet Address: {mobile ? fmtAddr(accountStr) : accountStr}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: "center" as const, padding: "12px", marginBottom: 16, background: C.panel, borderRadius: 8, border: `1px solid ${C.border}` }}>
              <ConnectButton
                showBalance={false}
                chainStatus="none"
                accountStatus="address"
              />
            </div>
          )}

          {/* REVOKE APPROVAL */}
          {connected && (
            <div style={{ textAlign: "center" as const, marginBottom: 10 }}>
              <span style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: C.textMuted }}>
                <button onClick={async () => {
                  try {
                    const gs = await getSigner();
                    const cbbtc = new ethers.Contract(CBBTC_ADDRESS, CBBTC_ABI, gs);
                    const tx = await cbbtc.approve(IEOK_ADDRESS, BigInt(0));
                    await tx.wait();
                    alert("cbBTC approval revoked — the contract can no longer spend your cbBTC.");
                  } catch (e: any) {
                    if (e.message?.includes("user rejected")) return;
                    alert("Revoke failed — try again.");
                  }
                }} style={{ background: "transparent", border: "none", fontFamily: "Arial, sans-serif", fontSize: 10, color: C.textMuted, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                  Revoke cbBTC approval
                </button>
                {" "}— Revoke the cbBTC approval permission for your wallet. You can re-approve on your next acquisition.
              </span>
            </div>
          )}

          {/* SWAP MODE TOGGLE */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {(["buy", "sell", "transfer"] as const).map(m => {
              const label = m === "buy" ? "▲ ACQUIRE" : m === "sell" ? "▼ DISPOSE" : "→ TRANSFER";
              const active = swapMode === m;
              return (
                <button key={m} onClick={() => setSwapMode(m)}
                  onMouseEnter={(e: any) => { if (!active) { e.currentTarget.style.background = C.blue; e.currentTarget.style.color = "#FFFFFF"; e.currentTarget.style.borderColor = C.blue; } }}
                  onMouseLeave={(e: any) => { if (!active) { e.currentTarget.style.background = C.panel; e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = C.border; } }}
                  style={{ flex: 1, padding: "14px 8px", fontFamily: "Arial, sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer", borderRadius: 8, background: active ? C.blue : C.panel, color: active ? "#FFFFFF" : C.text, border: `2px solid ${active ? C.blue : C.border}`, letterSpacing: "0.05em", boxShadow: active ? "0 2px 8px rgba(0,82,255,0.3)" : C.shadow, transition: "all 0.15s ease" }}>
                  {label}
                </button>
              );
            })}
          </div>

          <div>

            {swapMode === "buy" && (
              <Panel title="Acquire Origin Keys — Fixed Price 1 Sat = 1 OKey" theme={C}>
                <FeeBadge mobile={mobile} theme={C} />


                <p style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 14 : 15, color: C.textDim, lineHeight: 1.7, marginBottom: 12 }}>
                  Enter your cbBTC amount in Satoshis. Minimum 100 sats. The process is two steps: 1st Approve, 2nd Acquire. Your wallet will never be approved for more than you are spending.
                </p>
                <Input theme={C} label="cbBTC amount in satoshis" value={buyAmt} onChange={setBuyAmt} placeholder="1000" type="number" tag="SATS"
                  hint={btcPrice > 0 && buyAmt ? `≈ ${fmtUsd(satsToUsd(Number(buyAmt), btcPrice))} USD` : "Minimum 100 sats · 1,000 sats = 930 OKT after 7% fee"} />
                {bPrev && (
                  <Preview theme={C} rows={[
                    { label: "7% fee — paid to all OKT holders", value: bPrev.fee.toLocaleString() + " sats" },
                    { label: "OKT you receive (1 sat = 1 OKT)", value: bPrev.out.toLocaleString() + " OKey" + (btcPrice > 0 ? "  ·  " + fmtUsd(satsToUsd(bPrev.out, btcPrice)) : ""), blue: true },
                  ]} />
                )}
                {/* BUY BUTTON — auto-approves exact amount */}
                <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted, marginBottom: 8, textAlign: "center" as const }}>
                  The process is two steps: 1st Approve, 2nd Acquire. Your wallet will never be approved for more than you are spending.
                </div>
                <BigBtn onClick={buy} theme={C} disabled={!connected}>Acquire Origin Keys</BigBtn>
                <Status state={buyS} msg={buyM} theme={C} />
              </Panel>
            )}

            {swapMode === "sell" && (
              <Panel title="Dispose Origin Keys" theme={C}>
                <FeeBadge mobile={mobile} theme={C} />
                <Input theme={C} label="OKT amount to sell" value={sellAmt} onChange={setSellAmt} placeholder="930" type="number" tag="OKT" hint={`Your balance: ${oktNum.toLocaleString()} OKT`} />
                {sPrev && (
                  <Preview theme={C} rows={[
                    { label: "7% fee — paid to all OKT holders", value: sPrev.fee.toLocaleString() + " sats" },
                    { label: "cbBTC you receive (1 OKT = 1 sat)", value: sPrev.out.toLocaleString() + " sats" + (btcPrice > 0 ? "  ·  " + fmtUsd(satsToUsd(sPrev.out, btcPrice)) : ""), blue: true },
                  ]} />
                )}
                <BigBtn onClick={() => {
                  if (!sellAmt) return;
                  const selling = Number(sellAmt);
                  const balance = oktNum;
                  const divs    = divsNum;
                  if (selling >= balance && divs > 0) {
                    setShowSellWarning(true);
                  } else {
                    sell();
                  }
                }} variant="outline" disabled={!connected}>Dispose Origin Keys for cbBTC</BigBtn>

                {/* SELL WARNING POPUP */}
                {showSellWarning && (
                  <div style={{ position: "fixed" as const, top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                    <div style={{ background: C.card, border: `2px solid ${C.orange}`, borderRadius: 16, padding: mobile ? 24 : 36, maxWidth: 480, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 22, fontWeight: 700, color: C.orange, marginBottom: 16 }}>
                        ⚠️ Wait — You Have Unclaimed Dividends
                      </div>
                      <p style={{ fontFamily: "Arial, sans-serif", fontSize: 15, color: C.textDim, lineHeight: 1.7, marginBottom: 16 }}>
                        You have <strong style={{ color: C.blue }}>{fmtSats(divs.toString())} cbBTC</strong> in unclaimed proceeds. We recommend claiming them before selling your tokens to ensure you receive every satoshi.
                      </p>
                      <p style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: C.textMuted, lineHeight: 1.7, marginBottom: 24 }}>
                        <strong>Why this matters:</strong> Your share of yield is tied directly to your token balance. If you sell first, your earning power drops to zero. Withdraw first and you collect your cbBTC while still holding OKT — continuing to earn on every transaction until the moment you sell.
                      </p>
                      <div style={{ display: "flex", gap: 10, flexDirection: mobile ? "column" : "row" as const }}>
                        <button onClick={() => { setShowSellWarning(false); }} style={{ flex: 1, background: C.blue, color: "#FFFFFF", border: "none", borderRadius: 8, padding: "14px", fontFamily: "Arial, sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                          ← Withdraw First (Recommended)
                        </button>
                        <button onClick={() => { setShowSellWarning(false); sell(); }} style={{ flex: 1, background: "transparent", color: C.red, border: `2px solid ${C.red}`, borderRadius: 8, padding: "14px", fontFamily: "Arial, sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                          Sell Anyway
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <Status state={sellS} msg={sellM} theme={C} />
              </Panel>
            )}

            {swapMode === "transfer" && (
              <Panel title="Transfer Origin Keys — Zero Fee" theme={C}>
                <p style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 14 : 15, color: C.textDim, lineHeight: 1.7, marginBottom: 12 }}>
                  Send Origin Keys to any wallet with no fee. Dividend yield moves proportionally with the tokens.
                </p>
                <Input theme={C} label="Recipient wallet address" value={txTo} onChange={setTxTo} placeholder="0x..." />
                <Input theme={C} label="Origin Keys amount" value={txAmt} onChange={setTxAmt} placeholder="930" type="number" tag="OK" hint={`Your balance: ${oktNum.toLocaleString()} OKey`} />
                <BigBtn onClick={transfer} theme={C} disabled={!connected}>Transfer — Free</BigBtn>
                <Status state={txS} msg={txM} theme={C} />
              </Panel>
            )}
          </div>
          </>
        )}

        {/* INSCRIBE */}
        {tab === "inscribe" && isRegistrar && (
          <div>
            <Panel title="Inscribe Vault — Analog Bitcoin Art Piece" theme={C}>
              <p style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 14 : 15, color: C.textDim, lineHeight: 1.7, marginBottom: 16 }}>
                You spend cbBTC — 7% goes to all OKT holders as dividends, and the remaining 93% becomes OKT tokens sealed inside the vault. The Ordinal number is optional — leave blank for series pieces without an Ordinal.
              </p>
              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "16px", marginBottom: 12 }}>
                <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: C.blue, marginBottom: 12, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>How It Works</div>
                {[
                  "Generate a fresh wallet in MetaMask — click Add Account",
                  "Copy that wallet address into the Vault field below",
                  "Get your Ordinal inscription number from ordinals.com (optional)",
                  "Enter how much cbBTC you want embedded — 7% fee applies, minimum 100 sats",
                  "Hit Inscribe — cbBTC approved, fee distributed, OKT sealed in vault",
                  "Print the private key and seal it inside the physical art",
                ].map((s, i) => (
                  <div key={i} style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: C.textDim, padding: "5px 0", display: "flex", gap: 12 }}>
                    <span style={{ color: C.blue, flexShrink: 0, fontWeight: 700 }}>{i + 1}.</span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
              <Input theme={C} label="Vault wallet address (sealed inside the art)" value={insVault} onChange={setInsVault} placeholder="0x..." />
              <Input theme={C} label="Asset ID (max 31 characters)" value={insAsset} onChange={setInsAsset} placeholder="RWI-001" hint="e.g. RWI-001, IE-GENESIS-001, AB-001" />
              <Input theme={C} label="Ordinal inscription number (optional)" value={insOrd} onChange={setInsOrd} placeholder="68743291 or leave blank" type="number" hint="Leave blank for series pieces without a linked Ordinal" />
              {insOrd && Number(insOrd) > 0 ? (
                <Input theme={C} label="Ordinal inscription ID" value={insInsId} onChange={setInsInsId} placeholder="01b0dd658974e98059a753bab23e3cdbd4c86c7b49b92c2b03f7ede01b09031ei0" hint="Paste the full inscription ID from ordinals.com/inscription/YOUR_NUMBER — this displays the ordinal image in the vault checker" />
              ) : (
                <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: C.textMuted, marginBottom: 20, padding: "10px 14px", background: C.panel, borderRadius: 8, border: `1px solid ${C.border}` }}>
                  No Ordinal — this vault will hold Origin Keys only. The vault checker will show token balance and dividends but no linked Bitcoin inscription.
                </div>
              )}
              <Input theme={C} label="cbBTC to spend (sats) — 7% fee, rest becomes OKT in vault" value={insCbbtc} onChange={setInsCbbtc} placeholder="10000" type="number" tag="SATS"
                hint={btcPrice > 0 && insCbbtc ? `≈ ${fmtUsd(satsToUsd(Number(insCbbtc), btcPrice))} USD` : `Your cbBTC: ${fmtSats(cbbtcBal)} · Minimum 100 sats`} />
              {insPrev && (
                <Preview theme={C} rows={[
                  { label: "7% fee — distributed to all OKT holders", value: insPrev.fee.toLocaleString() + " sats" },
                  { label: "OKT sealed in vault (1 sat = 1 OKT)", value: insPrev.out.toLocaleString() + " OKey" + (btcPrice > 0 ? "  ·  " + fmtUsd(satsToUsd(insPrev.out, btcPrice)) : ""), blue: true },
                ]} />
              )}
              {/* ─── Gallery Admin ─── */}
              <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 16, paddingTop: 16, marginBottom: 16 }}>
                <div style={{ fontFamily: "Arial, sans-serif", fontSize: 14, fontWeight: 700, color: C.blue, marginBottom: 12 }}>Gallery Admin</div>

                {/* Step 1 — Fill in gallery info */}
                <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 700, color: C.textDim, marginBottom: 8 }}>Step 1 — Fill in gallery info</div>
                  {/* Artist selector */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.textDim, marginBottom: 8, fontWeight: 600 }}>Artist</div>
                    <select value={galArtist} onChange={e => {
                      const val = e.target.value;
                      if (val === "__new__") { setGalArtist(""); setGalBio(""); setGalCollection(""); setGalColDesc(""); }
                      else {
                        setGalArtist(val);
                        const artist = galleryData?.artists.find((a: any) => a.name === val);
                        if (artist) setGalBio(artist.bio || "");
                      }
                    }} style={{ width: "100%", background: C.input, border: `2px solid ${C.text}`, borderRadius: 8, color: C.text, fontFamily: "Arial, sans-serif", fontSize: 15, padding: "12px 16px", marginBottom: 8 }}>
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
                    <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.textDim, marginBottom: 8, fontWeight: 600 }}>Collection</div>
                    <select value={galCollection} onChange={e => {
                      const val = e.target.value;
                      if (val === "__new__") { setGalCollection(""); setGalColDesc(""); }
                      else {
                        setGalCollection(val);
                        const artist = galleryData?.artists.find((a: any) => a.name === galArtist);
                        const col = artist?.collections.find((c: any) => c.name === val);
                        if (col) setGalColDesc(col.description || "");
                      }
                    }} style={{ width: "100%", background: C.input, border: `2px solid ${C.text}`, borderRadius: 8, color: C.text, fontFamily: "Arial, sans-serif", fontSize: 15, padding: "12px 16px", marginBottom: 8 }}>
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
                    <button onClick={() => setGalType("original")} style={{ flex: 1, padding: "10px", fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 700, border: "none", borderRadius: 6, cursor: "pointer", background: galType === "original" ? C.blue : C.card, color: galType === "original" ? "#FFFFFF" : C.textMuted }}>Original</button>
                    <button onClick={() => setGalType("limited")} style={{ flex: 1, padding: "10px", fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 700, border: "none", borderRadius: 6, cursor: "pointer", background: galType === "limited" ? C.blue : C.card, color: galType === "limited" ? "#FFFFFF" : C.textMuted }}>Limited Edition</button>
                  </div>
                  <Input theme={C} label="Edition" value={galEdition} onChange={setGalEdition} placeholder="1 of 1 or 3 of 10" />
                  <Input theme={C} label="Shopify checkout link (optional)" value={galShopify} onChange={setGalShopify} placeholder="https://yourstore.myshopify.com/cart/..." />
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "Arial, sans-serif", fontSize: 12, color: C.textMuted, cursor: "pointer" }}>
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
                    <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 700, color: C.textDim, marginBottom: 8 }}>Current Gallery Pieces</div>
                    <div style={{ maxHeight: 200, overflow: "auto" }}>
                      {galleryData.artists.map((artist: any) =>
                        artist.collections.map((col: any) =>
                          col.pieces.map((piece: any, pIdx: number) => (
                            <div key={`${artist.id}-${col.id}-${pIdx}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderBottom: `1px solid ${C.border}`, gap: 8 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{piece.name}</div>
                                <div style={{ fontFamily: "Arial, sans-serif", fontSize: 10, color: C.textMuted }}>{artist.name} · {col.name} · {piece.edition}</div>
                              </div>
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
                              }} style={{ background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 4, padding: "4px 8px", fontFamily: "Arial, sans-serif", fontSize: 10, color: C.red, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
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
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 700, color: C.textDim, marginBottom: 8 }}>Step 2 — Add to gallery and copy</div>
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
                      shopifyUrl: galShopify || ""
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
                  }} style={{ width: "100%", padding: "14px", fontFamily: "Arial, sans-serif", fontSize: 14, fontWeight: 700, background: C.blue, color: "#FFFFFF", border: "none", borderRadius: 8, cursor: "pointer", marginBottom: 8 }}>
                    ✚ Add Piece to Gallery + Copy Full JSON
                  </button>
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted, marginBottom: 8 }}>
                    This adds the piece to the gallery preview above AND copies the complete gallery.json to your clipboard.
                  </div>
                </div>

                {/* Step 3 — Paste into file */}
                {galEntry && (
                  <div style={{ background: C.greenBg, border: `1px solid ${C.green}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
                    <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 700, color: C.green, marginBottom: 8 }}>✓ Copied! Now do this:</div>
                    <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: C.textDim, lineHeight: 1.8 }}>
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
                    <summary style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted, cursor: "pointer", marginBottom: 4 }}>View full gallery.json</summary>
                    <pre style={{ fontFamily: "monospace", fontSize: 9, color: C.textMuted, background: C.panel, padding: 8, borderRadius: 6, overflow: "auto", maxHeight: 200, border: `1px solid ${C.border}` }}>{galEntry}</pre>
                  </details>
                )}
              </div>
              <BigBtn onClick={inscribe} theme={C} disabled={!connected}>Inscribe Vault</BigBtn>
              <Status state={insS} msg={insM} theme={C} />
            </Panel>

            <Panel title="Report Ordinal Moved — Bitcoin Alert" theme={C}>
              <p style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 14 : 15, color: C.textDim, lineHeight: 1.7, marginBottom: 12 }}>
                When you see a linked Bitcoin Ordinal has moved on ordinals.com — enter its inscription number to record the alert permanently on Base.
              </p>
              <Input theme={C} label="Ordinal inscription number" value={repOrd} onChange={setRepOrd} placeholder="68743291" type="number" hint="Verify on ordinals.com before reporting — this is permanent and cannot be undone" />
              <BigBtn onClick={reportOrdinalMoved} theme={C} variant="outline" disabled={!connected}>Report Ordinal Moved</BigBtn>
              <Status state={repS} msg={repM} theme={C} />
            </Panel>
          </div>
        )}

        {/* VAULT */}
        {tab === "vault" && (
          <Panel title="Vault Registry — On-Chain Seal — Scan NFC or Paste Wallet Address" theme={C}>

            {/* INPUT AND BUTTON — always visible at top */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.textDim, marginBottom: 8, fontWeight: 600 }}>Vault Wallet Address</div>
              <div style={{ position: "relative" as const }}>
                <input
                  type="text"
                  value={vAddr}
                  onChange={e => setVAddr(e.target.value)}
                  placeholder="0x..."
                  style={{ width: "100%", background: C.input, border: `1.5px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: "Arial, sans-serif", fontSize: 17, padding: "14px 16px", outline: "none", boxSizing: "border-box" as const }}
                  onFocus={e => e.target.style.borderColor = C.blue}
                  onBlur={e => e.target.style.borderColor = C.border}
                />
              </div>
            </div>
            <BigBtn onClick={checkVault} theme={C} variant="outline">Verify Vault Status</BigBtn>
            <Status state={vS} msg={vM} theme={C} />

            {vResult && (
              <div style={{ marginTop: 20, padding: mobile ? 20 : 28, border: `2px solid ${!vResult.registered ? C.border : vResult.swept ? C.red : C.green}`, borderRadius: 12, background: !vResult.registered ? C.panel : vResult.swept ? C.redBg : C.greenBg, color: C.text }}>

                <div style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 18 : 22, fontWeight: 700, marginBottom: 16, lineHeight: 1.3 }}>
                  {!vResult.registered && <span style={{ color: C.textMuted }}>⚪ Not a Registered Vault</span>}
                  {vResult.registered && !vResult.swept && <span style={{ color: C.green }}>🟢 Vault Sealed — Untouched</span>}
                  
                  {vResult.registered && vResult.swept && <span style={{ color: C.red }}>🔴 Vault Swept — Origin Keys Have Been Moved</span>}
                  
                </div>

                {/* STATUS BADGE — OKT only */}
                {vResult.registered && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 16 }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6,
                      background: vResult.swept ? C.redBg : C.greenBg,
                      border: `1px solid ${vResult.swept ? C.red : C.green}` }}>
                      <span style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 700,
                        color: vResult.swept ? C.red : C.green }}>
                        {vResult.swept ? "⚠ Origin Keys Swept" : "✓ Origin Keys Sealed"}
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
                        <div style={{ fontFamily: "Arial, sans-serif", fontSize: 16, fontWeight: 700, color: C.blue, marginBottom: 12 }}>
                          Ordinal #{vResult.ordinalNumber}
                        </div>

                        {/* Ordinal Preview Image */}
                        <OrdinalPreview ordinalNumber={vResult.ordinalNumber} inscriptionId={vResult.inscriptionId || ""} mobile={mobile} borderColor={C.border} />

                        {/* Minted to vault address */}
                        <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: C.textMuted, marginBottom: 4 }}>
                          Minted to:
                        </div>
                        <div style={{ fontFamily: "monospace", fontSize: 11, color: C.textDim, wordBreak: "break-all" as const, marginBottom: 12, padding: "6px 10px", background: C.card, borderRadius: 6, border: `1px solid ${C.border}` }}>
                          {vAddr}
                        </div>

                        {/* Verify link */}
                        <a href={`https://ordinals.com/inscription/${vResult.inscriptionId || vResult.ordinalNumber}`} target="_blank" rel="noopener noreferrer"
                          style={{ display: "block", background: C.blueBg, border: `1px solid ${C.blue}`, borderRadius: 8, padding: "10px 20px", fontFamily: "Arial, sans-serif", fontSize: 13, color: C.blue, textDecoration: "none", fontWeight: 700, marginBottom: 8 }}>
                          View on Ordinals.com ↗
                        </a>

                        {/* Marketplace links */}
                        <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted, marginBottom: 6, marginTop: 12 }}>
                          Did you sweep this asset? You can list it here:
                        </div>
                        <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" as const }}>
                          <a href={`https://gamma.io/ordinals/collections`} target="_blank" rel="noopener noreferrer"
                            style={{ display: "inline-block", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textDim, textDecoration: "none", fontWeight: 600 }}>
                            Gamma ↗
                          </a>
                          <a href={`https://unisat.io/market`} target="_blank" rel="noopener noreferrer"
                            style={{ display: "inline-block", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textDim, textDecoration: "none", fontWeight: 600 }}>
                            UniSat ↗
                          </a>
                          <a href={`https://ordinalswallet.com`} target="_blank" rel="noopener noreferrer"
                            style={{ display: "inline-block", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 12px", fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textDim, textDecoration: "none", fontWeight: 600 }}>
                            Ordinals Wallet ↗
                          </a>
                        </div>


                      </div>
                    ) : (
                      <div style={{ display: "inline-block", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 24px", fontFamily: "Arial, sans-serif", fontSize: 14, color: C.textMuted }}>
                        No Ordinal linked — Origin Keys only
                      </div>
                    )}
                  </div>
                )}



                {vResult.registered && (
                  <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 20 }}>
                    <div>
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted, letterSpacing: "0.1em", marginBottom: 6, textTransform: "uppercase" as const, fontWeight: 600 }}>Vault Address</div>
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: C.textDim, wordBreak: "break-all" as const }}>{vAddr}</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted, letterSpacing: "0.1em", marginBottom: 6, textTransform: "uppercase" as const, fontWeight: 600 }}>Origin Key Balance</div>
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 22 : 26, color: C.text, fontWeight: 700 }}>{Number(vResult.balance).toLocaleString()} OKey</div>
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.textMuted, marginTop: 4 }}>{Number(vResult.balance).toLocaleString()} sats&nbsp;·&nbsp;{fmtCbbtc(vResult.balance)}</div>
                      {btcPrice > 0 && <div style={{ fontFamily: "Arial, sans-serif", fontSize: 15, color: C.green, marginTop: 6, fontWeight: 700 }}>{fmtUsd(satsToUsd(Number(vResult.balance), btcPrice))} USD</div>}
                    </div>
                    <div>
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted, letterSpacing: "0.1em", marginBottom: 6, textTransform: "uppercase" as const, fontWeight: 600 }}>cbBTC Yield Earned</div>
                      {Number(vResult.dividends) > 0 ? (
                        <>
                          <div style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 22 : 26, color: C.blue, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                            <CbbtcLogo size={24} />{Number(vResult.dividends).toLocaleString()} sats
                          </div>
                          <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.textMuted, marginTop: 4 }}>{fmtCbbtc(vResult.dividends)}</div>
                          {btcPrice > 0 && <div style={{ fontFamily: "Arial, sans-serif", fontSize: 15, color: C.green, marginTop: 6, fontWeight: 700 }}>{fmtUsd(satsToUsd(Number(vResult.dividends), btcPrice))} USD</div>}
                        </>
                      ) : (
                        <div style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: C.textMuted }}>No yield yet — accumulates as others buy and sell</div>
                      )}
                    </div>

                    {btcPrice > 0 && (
                      <div style={{ gridColumn: "1 / -1", background: C.blueBg, border: `1px solid ${C.blue}`, borderRadius: 8, padding: "16px 20px" }}>
                        <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.blue, letterSpacing: "0.1em", marginBottom: 8, textTransform: "uppercase" as const, fontWeight: 700 }}>Total Redeemable Value</div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" as const }}>
                          <div style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 24 : 30, color: C.blue, fontWeight: 700 }}>{fmtUsd(satsToUsd(Number(vResult.balance) + Number(vResult.dividends), btcPrice))} USD</div>
                          <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.textMuted }}>{fmtCbbtc((Number(vResult.balance) + Number(vResult.dividends)).toString())}&nbsp;·&nbsp;{(Number(vResult.balance) + Number(vResult.dividends)).toLocaleString()} sats</div>
                        </div>
                        <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: C.textMuted, marginTop: 6 }}>
                          OKT tokens + accumulated cbBTC yield — redeemable by destroying the art piece and acquiring the embedded SeedPod (Private Key) to the wallet holding the digital assets.
                        </div>
                      </div>
                    )}

                    {/* Asset ID hidden from display — stored on chain for internal records */}

                    {vResult.swept && (
                      <div style={{ gridColumn: "1 / -1", padding: "14px 18px", background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 8 }}>
                        <div style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: C.red, lineHeight: 1.7 }}>⚠ Check the VaultSwept event on Basescan for the exact timestamp.</div>
                        <a href={`${BLOCK_EXPLORER}/address/${IEOK_ADDRESS}#events`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.red, display: "block", marginTop: 8, fontWeight: 700 }}>
                          View VaultSwept Events on Basescan ↗
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {!vResult.registered && (
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: 15, color: C.textMuted }}>This address is not registered in the Analog Bitcoin vault registry.</div>
                )}

                <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                    {[
                      { label: "AnalogBitcoin.com — About this project", url: "https://analogbitcoin.com" },
                      { label: "View contract and events on Basescan",   url: `${BLOCK_EXPLORER}/address/${IEOK_ADDRESS}` },
                    ].map(link => (
                      <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: C.blue, textDecoration: "none", padding: "10px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, display: "block", fontWeight: 600 }}>
                        {link.label} ↗
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Panel>
        )}

        {/* LEARN */}
        {tab === "learn" && (
          <Panel title="Conduct — Guides" theme={C}>
            <p style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 14 : 15, color: C.textDim, lineHeight: 1.7, marginBottom: 12 }}>
              Everything you need to understand Immutable Editions, Origin Keys, Ordinals, and how to participate.
            </p>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
              {VIDEOS.map((v, i) => (
                <a key={i} href={v.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", gap: 14, padding: "16px 18px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, textDecoration: "none", alignItems: "flex-start" }}>
                  <div style={{ width: 40, height: 40, background: "#FF0000", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16, color: "#FFFFFF" }}>▶</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", flexWrap: "wrap" as const, alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 14 : 15, color: C.text, fontWeight: 700, lineHeight: 1.3 }}>{v.title}</div>
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 10, color: v.tc, border: `1px solid ${v.tc}`, borderRadius: 4, padding: "2px 8px", flexShrink: 0, letterSpacing: "0.1em", fontWeight: 700 }}>{v.tag}</div>
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
        <div style={{ marginTop: 24, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            {[
              { label: "OKT Contract",   value: IEOK_ADDRESS,  color: C.blue      },
              { label: "cbBTC Contract", value: CBBTC_ADDRESS, color: C.textMuted },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontFamily: "Arial, sans-serif", fontSize: 10, color: C.textMuted, letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6, fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: item.color, wordBreak: "break-all" as const, fontWeight: 600 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ textAlign: "center" as const, padding: "32px 0 16px", fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted, letterSpacing: "0.15em", lineHeight: 2 }}>
          NO ADMIN — NO GOVERNANCE — NO INTERVENTION<br />
          IMMUTABLEEDITIONS.COM — ANALOGBITCOIN.COM
        </div>

      </div>
    </main>
  );
}
