import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title:       "Immutable Editions",
  description: "Original handmade works of fine-art luminism with authenticity, participation and ownership verified in your hands.",
  verification: {
    google: "dGgCyYoAZ7uXR6Hybs5qr5INLZyp9zM4CUzfJ61j_eA",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}