"use client";

import { ethers } from "ethers";

export const BASE_CHAIN_ID       = 8453n;
export const BASE_HEX            = "0x2105";
export const BASE_SEPOLIA_CHAIN_ID = 84532n;
export const BASE_SEPOLIA_HEX    = "0x14a34";

export const IS_TESTNET           = true;
export const ACTIVE_CHAIN_HEX    = IS_TESTNET ? BASE_SEPOLIA_HEX : BASE_HEX;
export const BLOCK_EXPLORER      = IS_TESTNET ? "https://sepolia.basescan.org" : "https://basescan.org";

export function getBrowserProvider() {
  if (!window.ethereum) throw new Error("MetaMask not found");
  return new ethers.BrowserProvider(window.ethereum);
}

export async function ensureBase() {
  if (!window.ethereum) return;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ACTIVE_CHAIN_HEX }],
    });
  } catch (err: any) {
    if (err.code === 4902) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId:           BASE_SEPOLIA_HEX,
            chainName:         "Base Sepolia",
            nativeCurrency:    { name: "ETH", symbol: "ETH", decimals: 18 },
            rpcUrls:           ["https://sepolia.base.org"],
            blockExplorerUrls: ["https://sepolia.basescan.org"],
          }],
        });
      } catch (addErr) {
        console.warn("Could not add Base Sepolia:", addErr);
      }
    } else {
      console.warn("Chain switch failed:", err);
    }
  }
}