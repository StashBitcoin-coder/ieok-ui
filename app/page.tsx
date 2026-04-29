"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { IEOK_ADDRESS, CBBTC_ADDRESS } from "@/lib/contracts";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";

const OKT_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function dividendsOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function buy(uint256 cbbtcAmount, uint256 minTokens, address referrer) external",
  "function reinvest() external",
  "function sell(uint256 tokens, uint256 minCbbtc) external",
  "function transfer(address to, uint256 tokens) external returns (bool)",
  "function withdraw() external",
  "function inscribe(address vault, bytes32 assetId, uint256 cbbtcAmount, uint256 ordinalNumber) external",
  "function reportOrdinalMoved(uint256 ordinalNumber) external",
  "function vaultStatus(address vault) view returns (bool registered, bool swept, uint256 balance, bytes32 assetId)",
  "function vaultOrdinalStatus(address vault) view returns (uint256 ordinalNumber, bool hasOrdinal, bool ordinalMoved, uint256 ordinalMovedAt)",
];

const CBBTC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const PUBLIC_RPC = "https://sepolia.base.org";

type TxState = "idle" | "pending" | "success" | "failed";
type Tab = "home" | "trade" | "transfer" | "vault" | "learn" | "inscribe";
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
} | null;

const C = {
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
const fmtOkt    = (v: string) => Number(v).toLocaleString() + " OKT";
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
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
};

function SkeletonKey({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="4.5" stroke="#808080" strokeWidth="2" fill="none"/>
      <circle cx="8" cy="8" r="1.5" fill="#808080"/>
      <path d="M8 12.5L8 21" stroke="#808080" strokeWidth="2" strokeLinecap="round"/>
      <path d="M6 16L8 16" stroke="#808080" strokeWidth="2" strokeLinecap="round"/>
      <path d="M6 19L8 19" stroke="#808080" strokeWidth="2" strokeLinecap="round"/>
    </svg>
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

function Status({ state, msg }: { state: TxState; msg: string }) {
  if (state === "idle" || !msg) return null;
  const cfg = {
    pending: { bg: C.blueBg,  border: C.blue,  color: C.blue,  icon: "⏳" },
    success: { bg: C.greenBg, border: C.green,  color: C.green, icon: "✓"  },
    failed:  { bg: C.redBg,   border: C.red,    color: C.red,   icon: "✗"  },
    idle:    { bg: "",         border: "",        color: "",       icon: ""   },
  }[state];
  return (
    <div style={{ marginTop: 12, padding: "14px 18px", background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8 }}>
      <span style={{ color: cfg.color, fontFamily: "Arial, sans-serif", fontSize: 15 }}>{cfg.icon} {msg}</span>
    </div>
  );
}

function FeeBadge({ mobile }: { mobile: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.blueBg, border: `1px solid ${C.blue}`, borderRadius: 8, padding: mobile ? "10px 14px" : "12px 18px", marginBottom: 24 }}>
      <span style={{ fontFamily: "Arial, sans-serif", fontSize: 18, color: C.blue }}>◈</span>
      <span style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 13 : 14, color: C.blue, fontWeight: 600 }}>
        7% fee on every buy and sell — distributed instantly to all Origin Key holders as cbBTC dividends
      </span>
    </div>
  );
}

function Card({ label, value, sub, sub2, accent }: { label: string; value: string; sub?: string; sub2?: string; accent?: boolean }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${accent ? C.blue : C.border}`, borderTop: `3px solid ${accent ? C.blue : C.border}`, borderRadius: "0 0 8px 8px", padding: "20px", flex: 1, minWidth: 0, boxShadow: C.shadow }}>
      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, letterSpacing: "0.1em", color: C.textMuted, textTransform: "uppercase" as const, marginBottom: 10, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 22, fontWeight: 700, color: accent ? C.blue : C.text, lineHeight: 1, wordBreak: "break-all" as const }}>{value}</div>
      {sub  && <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.textMuted, marginTop: 6 }}>{sub}</div>}
      {sub2 && <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.green, marginTop: 3, fontWeight: 600 }}>{sub2}</div>}
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = "text", hint, tag }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; hint?: string; tag?: string;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.textDim, marginBottom: 8, fontWeight: 600 }}>{label}</div>
      <div style={{ position: "relative" as const }}>
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{ width: "100%", background: C.input, border: `1.5px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: "Arial, sans-serif", fontSize: 17, padding: tag ? "14px 80px 14px 16px" : "14px 16px", outline: "none", boxSizing: "border-box" as const, WebkitAppearance: "none" as const }}
          onFocus={e => e.target.style.borderColor = C.blue}
          onBlur={e => e.target.style.borderColor = C.border}
        />
        {tag && <div style={{ position: "absolute" as const, right: 16, top: "50%", transform: "translateY(-50%)", fontFamily: "Arial, sans-serif", fontSize: 13, color: C.blue, fontWeight: 700 }}>{tag}</div>}
      </div>
      {hint && <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: C.textMuted, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

function Preview({ rows }: { rows: { label: string; value: string; blue?: boolean }[] }) {
  return (
    <div style={{ background: C.blueBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 18px", marginBottom: 20 }}>
      {rows.map((r, i) => (
        <div key={i}>
          {i > 0 && i === rows.length - 1 && <div style={{ height: 1, background: C.border, margin: "10px 0" }} />}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", gap: 12 }}>
            <span style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: C.textMuted }}>{r.label}</span>
            <span style={{ fontFamily: "Arial, sans-serif", fontSize: 15, color: r.blue ? C.blue : C.textDim, fontWeight: r.blue ? 700 : 400, flexShrink: 0 }}>{r.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function BigBtn({ onClick, children, variant = "blue", disabled = false }: {
  onClick: () => void; children: React.ReactNode; variant?: "blue" | "outline"; disabled?: boolean;
}) {
  const v = { blue: { bg: C.blue, color: "#FFFFFF", border: "none" }, outline: { bg: "transparent", color: C.blue, border: `2px solid ${C.blue}` } }[variant];
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: "100%", background: v.bg, color: v.color, border: v.border, borderRadius: 8, padding: "16px", fontFamily: "Arial, sans-serif", fontSize: 15, letterSpacing: "0.05em", textTransform: "uppercase" as const, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, marginBottom: 4, fontWeight: 700, WebkitTapHighlightColor: "transparent", boxShadow: disabled ? "none" : C.shadow }}>
      {children}
    </button>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "24px", marginBottom: 16, boxShadow: C.shadow }}>
      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 16, color: C.blue, marginBottom: 20, fontWeight: 700 }}>{title}</div>
      {children}
    </div>
  );
}

const VIDEOS = [
  { title: "What is OKT — Origin Key Token",               desc: "Introduction to the Origin Key Token and how it works with physical art pieces.",  url: "https://youtube.com", tag: "START HERE", tc: C.green },
  { title: "What is Analog Bitcoin",                        desc: "The concept behind physical Bitcoin — destroy to redeem.",                           url: "https://youtube.com", tag: "CONCEPT",    tc: C.blue  },
  { title: "How to get cbBTC on Base",                      desc: "Step by step — buying Coinbase Wrapped Bitcoin and getting it into your wallet.",    url: "https://youtube.com", tag: "BEGINNERS",  tc: C.blue  },
  { title: "How to buy Origin Key Tokens",                  desc: "Buying OKT using the exchange on Base.",                                             url: "https://youtube.com", tag: "TRADING",    tc: C.blue  },
  { title: "How cbBTC dividends work",                      desc: "How fees are distributed to all OKT holders and how to withdraw.",                   url: "https://youtube.com", tag: "DIVIDENDS",  tc: C.blue  },
  { title: "How to verify a vault — NFC tap guide",         desc: "Tap an Analog Bitcoin NFC tag and verify vault status on chain.",                    url: "https://youtube.com", tag: "COLLECTORS", tc: C.green },
  { title: "What is an Ordinal inscription",                desc: "Understanding Bitcoin Ordinals and how they connect to physical art.",                url: "https://youtube.com", tag: "ORDINALS",   tc: "#5B6278" },
  { title: "How to redeem an Analog Bitcoin art piece",     desc: "What happens when you destroy the art and sweep the tokens.",                        url: "https://youtube.com", tag: "REDEMPTION", tc: C.red   },
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
  const tx = await cbbtc.approve(spender, BigInt("999999999999999999"));
  setMsg("Approving cbBTC — waiting for confirmation...");
  await tx.wait();
  // Small delay — gives Coinbase Wallet and Phantom time to sync approval state
  await new Promise(resolve => setTimeout(resolve, 1000));
  setMsg("Approved ✓");
}

export default function Home() {
  const mobile = useIsMobile();

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

  const [referrer, setReferrer] = useState<string>("0x0000000000000000000000000000000000000000");
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
  const [rvS, setRvS]           = useState<TxState>("idle");
  const [rvM, setRvM]           = useState("");

  const [insVault, setInsVault] = useState("");
  const [insAsset, setInsAsset] = useState("");
  const [insCbbtc, setInsCbbtc] = useState("");
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
  const [autoChecked, setAutoChecked] = useState(false);

  const correctChain = chain?.id === Number(CHAIN_ID);

  async function fetchBtcPrice() {
    // Try CoinGecko first, fall back to Binance API if blocked (e.g. Brave shields)
    try {
      const res  = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
      const data = await res.json();
      if (data?.bitcoin?.usd) { setBtcPrice(data.bitcoin.usd); return; }
    } catch (e) { /* blocked — try fallback */ }
    try {
      const res  = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
      const data = await res.json();
      if (data?.price) { setBtcPrice(parseFloat(data.price)); return; }
    } catch (e) { /* both failed */ console.error("BTC price unavailable"); }
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

  async function buy() {
    if (!account) { alert("Connect wallet first"); return; }
    if (!buyAmt)  { alert("Enter cbBTC amount");   return; }
    if (Number(buyAmt) < 100) { alert("Minimum buy is 100 sats"); return; }
    const s = await getSigner();
    const cbbtc = new ethers.Contract(CBBTC_ADDRESS, CBBTC_ABI, s);
    const okt   = new ethers.Contract(IEOK_ADDRESS,  OKT_ABI,   s);
    setBuyS("pending"); setBuyM("Checking allowance...");
    try {
      await ensureAllowance(cbbtc, account, IEOK_ADDRESS, BigInt(buyAmt), setBuyM);
      setBuyM("Confirm purchase in your wallet...");
      const tx = await okt.buy(BigInt(buyAmt), BigInt(0), referrer);
      setBuyM("Confirming on chain...");
      await tx.wait();
      setBuyS("success"); setBuyM("Purchase confirmed — OKT tokens received");
      if (account) await load(account);
    } catch (e: any) { setBuyS("failed"); setBuyM(e.reason || e.message || "Buy failed"); }
  }

  async function sell() {
    if (!account) { alert("Connect wallet first"); return; }
    if (!sellAmt) { alert("Enter OKT amount");     return; }
    const s = await getSigner();
    const okt = new ethers.Contract(IEOK_ADDRESS, OKT_ABI, s);
    setSellS("pending"); setSellM("Awaiting wallet...");
    try {
      await (await okt.sell(BigInt(sellAmt), BigInt(0))).wait();
      setSellS("success"); setSellM("Sell confirmed — cbBTC received");
      if (account) await load(account);
    } catch (e: any) { setSellS("failed"); setSellM(e.reason || e.message || "Sell failed"); }
  }

  async function withdraw() {
    if (!account) { alert("Connect wallet first"); return; }
    const s = await getSigner();
    const okt = new ethers.Contract(IEOK_ADDRESS, OKT_ABI, s);
    setWdS("pending"); setWdM("Awaiting wallet...");
    try {
      await (await okt.withdraw()).wait();
      setWdS("success"); setWdM("cbBTC dividends sent to your wallet");
      if (account) await load(account);
    } catch (e: any) { setWdS("failed"); setWdM(e.reason || e.message || "Failed"); }
  }

  async function reinvest() {
    if (!account) { alert("Connect wallet first"); return; }
    const s = await getSigner();
    const okt = new ethers.Contract(IEOK_ADDRESS, OKT_ABI, s);
    setRvS("pending"); setRvM("Awaiting wallet...");
    try {
      await (await okt.reinvest()).wait();
      setRvS("success"); setRvM("Dividends reinvested — new OKT tokens received");
      if (account) await load(account);
    } catch (e: any) { setRvS("failed"); setRvM(e.reason || e.message || "Reinvest failed"); }
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
    } catch (e: any) { setTxS("failed"); setTxM(e.reason || e.message || "Failed"); }
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
      const tx = await okt.inscribe(insVault, b32(insAsset), BigInt(insCbbtc), ordNum);
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
      const [ordinalNumber, hasOrdinal, ordinalMoved, ordinalMovedAt] = ordinal;
      setVResult({ registered, swept, balance: balance.toString(), dividends: divAmount.toString(), assetId: assetId.toString(), ordinalNumber: ordinalNumber.toString(), hasOrdinal, ordinalMoved, ordinalMovedAt: ordinalMovedAt.toString() });
      setVS("idle"); setVM("");
    } catch (e: any) { setVS("failed"); setVM("Could not query — check address and try again"); setVResult(null); }
  }

  // Option B: connected wallet → trade, new visitor → home
  useEffect(() => {
    if (connected) setTab(prev => prev === "home" ? "trade" : prev);
  }, [connected]);

  useEffect(() => { fetchBtcPrice(); const iv = setInterval(fetchBtcPrice, 60000); return () => clearInterval(iv); }, []);
  useEffect(() => {
    if (!account) return;
    load(account);
    const iv = setInterval(() => load(account), 10000);
    return () => clearInterval(iv);
  }, [account]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("vault");
    if (v) { setVAddr(v); setTab("vault"); }
    const ref = params.get("ref");
    if (ref && ethers.isAddress(ref)) { setReferrer(ref); }
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
    { id: "home",     label: "HOME",        short: "HOME"     },
    { id: "trade",    label: "BUY / SELL",  short: "TRADE"    },
    { id: "transfer", label: "TRANSFER",    short: "SEND"     },
    { id: "vault",    label: "VAULT CHECK", short: "VAULT"    },
    { id: "learn",    label: "LEARN",       short: "LEARN"    },
    ...(isRegistrar ? [{ id: "inscribe" as Tab, label: "INSCRIBE", short: "INSCRIBE" }] : []),
  ];

  return (
    <main style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "Arial, sans-serif", touchAction: "pan-y", WebkitOverflowScrolling: "touch" as any, overscrollBehavior: "none" }}>

      {/* HEADER */}
      <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: mobile ? "0 12px" : "0 40px", height: mobile ? 64 : 72, display: "flex", alignItems: "center", justifyContent: "space-between", position: "fixed" as const, top: 0, left: 0, right: 0, zIndex: 100, boxShadow: C.shadow }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <CbbtcLogo size={mobile ? 26 : 34} />
          {!mobile && (
            <div style={{ lineHeight: 1.4 }}>
              <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted }}>Origin Key tokens are denominated in cbBTC,</div>
              <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted }}>tokenized Bitcoin issued by Coinbase.</div>
            </div>
          )}
          {btcPrice > 0 && !mobile && (
            <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: C.textMuted, background: C.panel, padding: "4px 10px", borderRadius: 20, border: `1px solid ${C.border}`, marginLeft: 4 }}>
              BTC {fmtUsd(btcPrice)}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, borderRight: `1px solid ${C.border}`, paddingRight: 12 }}>
            <SkeletonKey size={mobile ? 20 : 26} />
            <div style={{ textAlign: "center" as const }}>
              <div style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 9 : 10, color: C.textMuted, letterSpacing: "0.06em", lineHeight: 1, textTransform: "uppercase" as const, whiteSpace: "nowrap" as const }}>Immutable Editions</div>
              <div style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 13 : 18, fontWeight: 700, color: C.blue, lineHeight: 1.2, whiteSpace: "nowrap" as const }}>Origin Key Exchange</div>
            </div>
          </div>

          <ConnectButton
            showBalance={false}
            chainStatus="none"
            accountStatus="address"
          />
        </div>
      </div>

      <div style={{ height: mobile ? 64 : 72 }} />



      {/* PORTFOLIO CARDS */}
      {connected ? (
        <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "1px" }}>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 1, background: C.border }}>
            {/* cbBTC — sats primary */}
            <Card label="cbBTC Balance" value={fmtSats(cbbtcBal)} sub={fmtCbbtc(cbbtcBal)} sub2={cbbtcUsd} />
            {/* OKT — OKT on top, sats underneath */}
            <Card label="Origin Key Balance" value={fmtOkt(oktBal)} sub={fmtSats(oktBal)} sub2={oktUsd} />
            {/* Dividends — sats primary */}
            <Card label="Dividends" value={fmtSats(divs)} sub={fmtCbbtc(divs)} sub2={divsUsd} accent />
            {/* Total Supply */}
            <Card label="Total Token Supply" value={fmtOkt(supply)} sub={fmtSats(supply)} />
          </div>
        </div>
      ) : (
        <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "32px", textAlign: "center" as const }}>
          <div style={{ marginBottom: 12 }}><SkeletonKey size={40} /></div>
          <div style={{ fontFamily: "Arial, sans-serif", fontSize: 16, color: C.textMuted, fontWeight: 600 }}>Connect your wallet to see your balances</div>
          <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.textMuted, marginTop: 6 }}>Use MetaMask or Coinbase Wallet on Base Sepolia</div>
        </div>
      )}

      {/* DIVIDENDS BANNER */}
      {connected && divsNum > 0 && (
        <div style={{ background: C.blueBg, borderBottom: `1px solid ${C.blue}`, padding: mobile ? "14px 16px" : "14px 40px", display: "flex", flexDirection: mobile ? "column" : "row" as const, alignItems: mobile ? "stretch" : "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <span style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 15 : 16, color: C.blue, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              <CbbtcLogo size={18} />{fmtSats(divs)} cbBTC dividends available
            </span>
            {divsUsd && <span style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.textMuted, marginLeft: 10 }}>{divsUsd}</span>}
          </div>
          <div>
            <div style={{ display: "flex", gap: 8, flexDirection: mobile ? "column" : "row" as const }}>
              <button onClick={withdraw} style={{ background: C.blue, color: "#FFFFFF", border: "none", borderRadius: 8, padding: "11px 22px", fontFamily: "Arial, sans-serif", fontSize: 14, cursor: "pointer", textTransform: "uppercase" as const, fontWeight: 700, letterSpacing: "0.05em", WebkitTapHighlightColor: "transparent" }}>
                Withdraw
              </button>
              <button onClick={reinvest} style={{ background: "transparent", color: C.blue, border: `1.5px solid ${C.blue}`, borderRadius: 8, padding: "11px 22px", fontFamily: "Arial, sans-serif", fontSize: 14, cursor: "pointer", textTransform: "uppercase" as const, fontWeight: 700, letterSpacing: "0.05em", WebkitTapHighlightColor: "transparent" }}>
                Reinvest
              </button>
            </div>
            <Status state={wdS} msg={wdM} />
            <Status state={rvS} msg={rvM} />
          </div>
        </div>
      )}

      {connected && account && (
        <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: mobile ? "8px 16px" : "8px 40px" }}>
          <span style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: C.textMuted }}>{mobile ? fmtAddr(accountStr) : accountStr}</span>
        </div>
      )}

      <div style={{ maxWidth: 880, margin: "0 auto", padding: mobile ? "20px 12px" : "32px 24px" }}>

        {/* TABS */}
        <div style={{ display: "flex", justifyContent: "center", borderBottom: `2px solid ${C.border}`, marginBottom: 24, overflowX: "auto" as const, WebkitOverflowScrolling: "touch" as const, scrollbarWidth: "none" as const }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ flexShrink: 0, padding: mobile ? "12px 14px" : "14px 26px", fontFamily: "Arial, sans-serif", fontSize: mobile ? 11 : 13, letterSpacing: "0.05em", background: "transparent", color: tab === t.id ? C.blue : C.textMuted, border: "none", borderBottom: tab === t.id ? `3px solid ${C.blue}` : "3px solid transparent", marginBottom: "-2px", cursor: "pointer", fontWeight: tab === t.id ? 700 : 500, WebkitTapHighlightColor: "transparent", whiteSpace: "nowrap" as const, textTransform: "uppercase" as const }}>
              {mobile ? t.short : t.label}
            </button>
          ))}
        </div>

        {/* HOME */}
        {tab === "home" && (
          <div>
            {/* HERO */}
            <div style={{ textAlign: "center" as const, padding: mobile ? "48px 0 40px" : "64px 0 56px" }}>
              <div style={{ fontFamily: "Georgia, serif", fontSize: mobile ? 13 : 14, color: C.blue, letterSpacing: "0.2em", textTransform: "uppercase" as const, marginBottom: 20, fontWeight: 400 }}>
                Immutable Editions
              </div>
              <h1 style={{ fontFamily: "Georgia, serif", fontSize: mobile ? 36 : 56, fontWeight: 400, color: C.text, lineHeight: 1.1, margin: "0 0 24px", letterSpacing: "-0.02em" }}>
                Where Provenance<br/>and Interest meet<br/>
                <span style={{ color: C.blue, fontStyle: "italic" }}>Market Integrity.</span>
              </h1>
              <p style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 15 : 18, color: C.textMuted, lineHeight: 1.7, maxWidth: 600, margin: "0 auto 40px", fontWeight: 300 }}>
                The collectible space has always struggled with authenticity and fair value. We built the infrastructure to fix both — permanently, on chain, with no one in control.
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" as const }}>
                <button onClick={() => setTab("trade")} style={{ background: C.blue, color: "#FFFFFF", border: "none", borderRadius: 8, padding: "14px 32px", fontFamily: "Arial, sans-serif", fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em" }}>
                  Buy OKT
                </button>
                <button onClick={() => setTab("vault")} style={{ background: "transparent", color: C.blue, border: `2px solid ${C.blue}`, borderRadius: 8, padding: "14px 32px", fontFamily: "Arial, sans-serif", fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em" }}>
                  Verify a Piece
                </button>
              </div>
            </div>

            {/* DIVIDER */}
            <div style={{ height: 1, background: C.border, margin: "0 0 56px" }} />

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
                  title: "Origin Key Token",
                  desc: "Every physical creation is embedded with Origin Key Tokens at birth. Held tokens earn cbBTC yield each time another creation comes to life or when a trade happens. Fees from every collectable creation (and OKT trade) flow automatically to all holders — including each already (still Vaulted) creation.",
                  site: "Buy OKT",
                  url: null,
                  tab: "trade",
                },
                {
                  label: "Market Integrity",
                  title: "The Key Exchange",
                  desc: "Deployed on Base for the best performance and support. The Origin Key Token is pegged to Bitcoin (1 OKT = 1 Sat). The protocol has been audited. There is no admin. No governance. No intervention. The market is pure math.",
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
                      <>Every physical creation is embedded with Origin Key Tokens at birth. Held tokens earn <img src="/coinbase-wrapped-btc.png" width={18} height={18} alt="cbBTC" style={{ display: "inline", verticalAlign: "middle", margin: "0 1px -2px 1px" }} /> cbBTC yield each time another creation comes to life or when a trade happens. Fees from every collectable creation (and OKT trade) flow automatically to all holders — including each already (still Vaulted) creation.</>
                    ) : i === 2 ? (
                      <>Deployed on Base for the best performance and support. The Origin Key Token is pegged to Bitcoin (1 OKT = 1 Sat) so volatility in Automated Market Maker pricing <span style={{ color: "#DA3A3A", fontWeight: 700 }}>IS NOT HERE</span> to provide extractors one of their most valuable weapons. The protocol has been audited. There is no admin. No governance. No intervention. The market is pure math.</>
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
                  { n: "01", title: "Vault the Ordinal and Origin Key Tokens", desc: "Both digital assets are placed in two different digital wallets — both sharing the same Private Key within the SeedPod." },
                  { n: "02", title: "Physical Art", desc: "A finished physical collectable is embedded with the SeedPod (printed wallet Private Key) along with a programmed read-only NFC Tag. Sealed securely within the asset." },
                  { n: "03", title: "Vault Verification", desc: "The owner can scan the NFC Tag anytime to see the Ordinal and Origin Key Tokens along with the yield earned." },
                  { n: "04", title: "Physical Bitcoin Interest", desc: "" },
                  { n: "05", title: "Redemption (if necessary)", desc: "Destruction of the collectable can reveal the SeedPod one can use to sweep all digital assets out of the Vault." },
                ].map((s, i) => (
                  <div key={i} style={{ position: "relative" as const }}>
                    <div style={{ fontFamily: "Georgia, serif", fontSize: 32, color: C.border, fontWeight: 400, lineHeight: 1, marginBottom: 10 }}>{s.n}</div>
                    <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>{s.title}</div>
                    <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: C.textMuted, lineHeight: 1.6, fontWeight: 300 }}>
                      {i === 3 ? (
                        <>Every published work and trade pays <img src="/coinbase-wrapped-btc.png" width={14} height={14} alt="cbBTC" style={{ display: "inline", verticalAlign: "middle", margin: "0 1px -2px 1px" }} /> cbBTC dividends to all Immutable Editions collectable holders and Origin Key Token holders.</>
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
                <button onClick={() => setTab("trade")} style={{ background: "transparent", color: C.blue, border: `2px solid ${C.blue}`, borderRadius: 8, padding: "14px 32px", fontFamily: "Arial, sans-serif", fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em" }}>
                  Start Trading
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TRADE */}
        {tab === "trade" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, background: C.panel, borderRadius: 10, padding: 4, border: `1px solid ${C.border}` }}>
              {(["buy", "sell"] as const).map(m => (
                <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: mobile ? "12px" : "14px", fontFamily: "Arial, sans-serif", fontSize: mobile ? 14 : 16, background: mode === m ? (m === "buy" ? C.blue : C.card) : "transparent", color: mode === m ? (m === "buy" ? "#FFFFFF" : C.blue) : C.textMuted, border: mode === m && m === "sell" ? `1.5px solid ${C.blue}` : "none", borderRadius: 8, cursor: "pointer", textTransform: "uppercase" as const, fontWeight: 700, WebkitTapHighlightColor: "transparent", boxShadow: mode === m ? C.shadow : "none" }}>
                  {m === "buy" ? "▲ Buy" : "▼ Sell"}
                </button>
              ))}
            </div>

            {mode === "buy" && (
              <Panel title="Buy OKT — Fixed Price 1 Sat = 1 OKT">
                <FeeBadge mobile={mobile} />

                {/* REFERRAL LINK — shown when wallet connected */}
                {connected && accountStr && (
                  <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px", marginBottom: 20 }}>
                    <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted, letterSpacing: "0.1em", textTransform: "uppercase" as const, fontWeight: 600, marginBottom: 8 }}>
                      Your Referral Link
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted, flex: 1, wordBreak: "break-all" as const }}>
                        {`https://thekeyexchange.io/?ref=${accountStr}`}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`https://thekeyexchange.io/?ref=${accountStr}`);
                          alert("Referral link copied!");
                        }}
                        style={{ background: C.blue, color: "#FFFFFF", border: "none", borderRadius: 6, padding: "8px 14px", fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" as const }}
                      >
                        Copy Link
                      </button>
                    </div>
                    <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted, marginTop: 8 }}>
                      Share this link — earn 2.5% cbBTC on every first buy you refer
                    </div>
                  </div>
                )}

                <p style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 14 : 15, color: C.textDim, lineHeight: 1.7, marginBottom: 20 }}>
                  Enter your cbBTC amount in satoshis and tap Buy. Minimum 100 sats. First time buyers will see their wallet pop up twice — approve then buy. Future purchases are single tap.
                </p>
                {referrer !== "0x0000000000000000000000000000000000000000" && (
                  <div style={{ background: C.greenBg, border: `1px solid ${C.green}`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontFamily: "Arial, sans-serif", fontSize: 13, color: C.green, fontWeight: 600 }}>
                    ✓ Referred by {referrer.slice(0,6)}...{referrer.slice(-4)} — 2.5% referral fee applies on first buy
                  </div>
                )}
                <Input label="cbBTC amount in satoshis" value={buyAmt} onChange={setBuyAmt} placeholder="1000" type="number" tag="SATS"
                  hint={btcPrice > 0 && buyAmt ? `≈ ${fmtUsd(satsToUsd(Number(buyAmt), btcPrice))} USD` : "Minimum 100 sats · 1,000 sats = 930 OKT after 7% fee"} />
                {bPrev && (
                  <Preview rows={[
                    { label: "7% fee — paid to all OKT holders", value: bPrev.fee.toLocaleString() + " sats" },
                    { label: "OKT you receive (1 sat = 1 OKT)", value: bPrev.out.toLocaleString() + " OKT" + (btcPrice > 0 ? "  ·  " + fmtUsd(satsToUsd(bPrev.out, btcPrice)) : ""), blue: true },
                  ]} />
                )}
                <BigBtn onClick={buy} disabled={!connected}>Buy OKT</BigBtn>
                <Status state={buyS} msg={buyM} />
              </Panel>
            )}

            {mode === "sell" && (
              <Panel title="Sell OKT — Fixed Price 1 OKT = 1 Sat">
                <FeeBadge mobile={mobile} />
                <Input label="OKT amount to sell" value={sellAmt} onChange={setSellAmt} placeholder="930" type="number" tag="OKT" hint={`Your balance: ${oktNum.toLocaleString()} OKT`} />
                {sPrev && (
                  <Preview rows={[
                    { label: "7% fee — paid to all OKT holders", value: sPrev.fee.toLocaleString() + " sats" },
                    { label: "cbBTC you receive (1 OKT = 1 sat)", value: sPrev.out.toLocaleString() + " sats" + (btcPrice > 0 ? "  ·  " + fmtUsd(satsToUsd(sPrev.out, btcPrice)) : ""), blue: true },
                  ]} />
                )}
                <BigBtn onClick={sell} variant="outline" disabled={!connected}>Sell OKT for cbBTC</BigBtn>
                <Status state={sellS} msg={sellM} />
              </Panel>
            )}
          </div>
        )}

        {/* TRANSFER */}
        {tab === "transfer" && (
          <Panel title="Transfer OKT — Zero Fee">
            <p style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 14 : 15, color: C.textDim, lineHeight: 1.7, marginBottom: 20 }}>
              Send OKT to any wallet with no fee. Dividend yield moves proportionally with the tokens.
            </p>
            <Input label="Recipient wallet address" value={txTo} onChange={setTxTo} placeholder="0x..." />
            <Input label="OKT amount" value={txAmt} onChange={setTxAmt} placeholder="930" type="number" tag="OKT" hint={`Your balance: ${oktNum.toLocaleString()} OKT`} />
            <BigBtn onClick={transfer} disabled={!connected}>Transfer — Free</BigBtn>
            <Status state={txS} msg={txM} />
          </Panel>
        )}

        {/* INSCRIBE */}
        {tab === "inscribe" && isRegistrar && (
          <div>
            <Panel title="Inscribe Vault — Analog Bitcoin Art Piece">
              <p style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 14 : 15, color: C.textDim, lineHeight: 1.7, marginBottom: 16 }}>
                You spend cbBTC — 7% goes to all OKT holders as dividends, and the remaining 93% becomes OKT tokens sealed inside the vault. The Ordinal number is optional — leave blank for series pieces without an Ordinal.
              </p>
              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "16px", marginBottom: 20 }}>
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
              <Input label="Vault wallet address (sealed inside the art)" value={insVault} onChange={setInsVault} placeholder="0x..." />
              <Input label="Asset ID (max 31 characters)" value={insAsset} onChange={setInsAsset} placeholder="RWI-001" hint="e.g. RWI-001, IE-GENESIS-001, AB-001" />
              <Input label="Ordinal inscription number (optional)" value={insOrd} onChange={setInsOrd} placeholder="68743291 or leave blank" type="number" hint="Leave blank for series pieces without a linked Ordinal" />
              <Input label="cbBTC to spend (sats) — 7% fee, rest becomes OKT in vault" value={insCbbtc} onChange={setInsCbbtc} placeholder="10000" type="number" tag="SATS"
                hint={btcPrice > 0 && insCbbtc ? `≈ ${fmtUsd(satsToUsd(Number(insCbbtc), btcPrice))} USD` : `Your cbBTC: ${fmtSats(cbbtcBal)} · Minimum 100 sats`} />
              {insPrev && (
                <Preview rows={[
                  { label: "7% fee — distributed to all OKT holders", value: insPrev.fee.toLocaleString() + " sats" },
                  { label: "OKT sealed in vault (1 sat = 1 OKT)", value: insPrev.out.toLocaleString() + " OKT" + (btcPrice > 0 ? "  ·  " + fmtUsd(satsToUsd(insPrev.out, btcPrice)) : ""), blue: true },
                ]} />
              )}
              <BigBtn onClick={inscribe} disabled={!connected}>Inscribe Vault</BigBtn>
              <Status state={insS} msg={insM} />
            </Panel>

            <Panel title="Report Ordinal Moved — Bitcoin Alert">
              <p style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 14 : 15, color: C.textDim, lineHeight: 1.7, marginBottom: 20 }}>
                When you see a linked Bitcoin Ordinal has moved on ordinals.com — enter its inscription number to record the alert permanently on Base.
              </p>
              <Input label="Ordinal inscription number" value={repOrd} onChange={setRepOrd} placeholder="68743291" type="number" hint="Verify on ordinals.com before reporting — this is permanent and cannot be undone" />
              <BigBtn onClick={reportOrdinalMoved} variant="outline" disabled={!connected}>Report Ordinal Moved</BigBtn>
              <Status state={repS} msg={repM} />
            </Panel>
          </div>
        )}

        {/* VAULT */}
        {tab === "vault" && (
          <Panel title="Vault Registry — On-Chain Seal — Scan NFC or Paste Wallet Address">

            {/* INPUT AND BUTTON — always visible at top */}
            <div style={{ marginBottom: 20 }}>
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
            <BigBtn onClick={checkVault} variant="outline">Verify Vault Status</BigBtn>
            <Status state={vS} msg={vM} />

            {vResult && (
              <div style={{ marginTop: 20, padding: mobile ? 20 : 28, border: `2px solid ${!vResult.registered ? C.border : (vResult.swept || vResult.ordinalMoved) ? C.red : C.green}`, borderRadius: 12, background: !vResult.registered ? C.panel : (vResult.swept || vResult.ordinalMoved) ? C.redBg : C.greenBg }}>

                <div style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 18 : 22, fontWeight: 700, marginBottom: 16, lineHeight: 1.3 }}>
                  {!vResult.registered && <span style={{ color: C.textMuted }}>⚪ Not a Registered Vault</span>}
                  {vResult.registered && !vResult.swept && !vResult.ordinalMoved && <span style={{ color: C.green }}>🟢 Vault Intact — Never Accessed</span>}
                  {vResult.registered && vResult.swept && <span style={{ color: C.red }}>🔴 Vault Swept — OKT Has Moved</span>}
                </div>

                {/* ORDINAL LINK — centered directly under status */}
                {vResult.registered && (
                  <div style={{ textAlign: "center" as const, marginBottom: 20 }}>
                    {vResult.hasOrdinal && Number(vResult.ordinalNumber) > 0 ? (
                      <a href={`https://ordinals.com/inscription/${vResult.ordinalNumber}`} target="_blank" rel="noopener noreferrer"
                        style={{ display: "inline-block", background: C.blueBg, border: `1px solid ${C.blue}`, borderRadius: 8, padding: "12px 24px", fontFamily: "Arial, sans-serif", fontSize: 14, color: C.blue, textDecoration: "none", fontWeight: 700 }}>
                        View Ordinal #{vResult.ordinalNumber} on Ordinals.com ↗
                      </a>
                    ) : (
                      <div style={{ display: "inline-block", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 24px", fontFamily: "Arial, sans-serif", fontSize: 14, color: C.textMuted }}>
                        No Ordinal linked — OKT tokens only
                      </div>
                    )}
                  </div>
                )}

                {vResult.registered && vResult.ordinalMoved && (
                  <div style={{ marginBottom: 20, padding: "14px 18px", background: C.orangeBg, border: `1px solid ${C.orange}`, borderRadius: 8 }}>
                    <div style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 15 : 17, fontWeight: 700, color: C.orange, marginBottom: 6 }}>⚠️ Bitcoin Ordinal Has Moved</div>
                    <div style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: C.textDim, lineHeight: 1.7 }}>
                      The Bitcoin Ordinal linked to this art piece has been reported as transferred.
                      {vResult.ordinalMovedAt !== "0" && <span> Reported at: <strong style={{ color: C.orange }}>{fmtTs(vResult.ordinalMovedAt)}</strong></span>}
                    </div>
                    {Number(vResult.ordinalNumber) > 0 && (
                      <a href={`https://ordinals.com/inscription/${vResult.ordinalNumber}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: C.orange, display: "block", marginTop: 8, fontWeight: 700 }}>
                        Verify on Ordinals.com ↗
                      </a>
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
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 22 : 26, color: C.text, fontWeight: 700 }}>{Number(vResult.balance).toLocaleString()} OKT</div>
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

                    <div>
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: C.textMuted, letterSpacing: "0.1em", marginBottom: 6, textTransform: "uppercase" as const, fontWeight: 600 }}>Asset ID</div>
                      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 15, color: C.blue, wordBreak: "break-all" as const, fontWeight: 700 }}>{vResult.assetId}</div>
                    </div>

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
          <Panel title="Learn — Video Guides">
            <p style={{ fontFamily: "Arial, sans-serif", fontSize: mobile ? 14 : 15, color: C.textDim, lineHeight: 1.7, marginBottom: 20 }}>
              Everything you need to understand Origin Key Token, Analog Bitcoin, and how to participate.
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
