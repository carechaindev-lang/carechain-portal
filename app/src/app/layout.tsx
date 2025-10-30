import SolanaProvider from "@/components/solana-provider";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <meta name="apple-mobile-web-app-title" content="CARECHAIN" />
      <body className="font-sans">
        <SolanaProvider>{children}</SolanaProvider>
        <Toaster />
      </body>
    </html>
  );
}
