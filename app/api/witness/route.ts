// app/api/witness/route.ts
//
// Receives a signed Witness attestation, verifies the signature server-side,
// then emails it. The signature is the evidence — the email is just the pipe.
//
// Required env vars in Vercel:
//   RESEND_API_KEY   — from resend.com (free tier: 100/day, 3000/month)
//   WITNESS_EMAIL_TO — where attestations land

import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "ethers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { address, message, signature } = await req.json();

    if (!address || !message || !signature) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // ─── Verify the signature ────────────────────────────────────────────
    // Recover the signer from the message + signature. If it doesn't match
    // the claimed address, someone is forging a registration. Reject.
    let recovered: string;
    try {
      recovered = verifyMessage(message, signature);
    } catch {
      return NextResponse.json({ error: "Bad signature" }, { status: 400 });
    }

    if (recovered.toLowerCase() !== String(address).toLowerCase()) {
      return NextResponse.json({ error: "Signature does not match address" }, { status: 400 });
    }

    // ─── Email it ────────────────────────────────────────────────────────
    const apiKey = process.env.RESEND_API_KEY;
    const to     = process.env.WITNESS_EMAIL_TO;

    if (!apiKey || !to) {
      console.error("Witness registry: missing RESEND_API_KEY or WITNESS_EMAIL_TO");
      return NextResponse.json({ error: "Registry not configured" }, { status: 500 });
    }

    const stamp = new Date().toISOString();

    const body = [
      "NEW WITNESS ATTESTATION",
      "",
      `Wallet:    ${recovered}`,
      `Recorded:  ${stamp}`,
      "",
      "--- SIGNED MESSAGE ---",
      message,
      "",
      "--- SIGNATURE ---",
      signature,
      "",
      "--- VERIFY ---",
      "Signature verified server-side before this email was sent.",
      "To re-verify independently, recover the signer from the message",
      "and signature above; it must equal the wallet address.",
    ].join("\n");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Glass Vault <onboarding@resend.dev>",
        to: [to],
        subject: `Witness attestation — ${recovered.slice(0, 10)}…`,
        text: body,
      }),
    });

    // Only confirm to the browser once the send actually succeeded.
    // A silent failure here would lose the record with nobody knowing.
    if (!res.ok) {
      const detail = await res.text();
      console.error("Witness registry: email send failed", detail);
      return NextResponse.json({ error: "Could not record attestation" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, address: recovered, recorded: stamp });
  } catch (e: any) {
    console.error("Witness registry error:", e?.message || e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
