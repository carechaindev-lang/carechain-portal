"use client";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { UnsafeBurnerWalletAdapter } from "@solana/wallet-adapter-unsafe-burner";
import { useMemo } from "react";
import "@solana/wallet-adapter-react-ui/styles.css";

export default function SolanaProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL!;
  const wallets = useMemo(() => [new UnsafeBurnerWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
