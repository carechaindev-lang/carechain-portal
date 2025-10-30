"use client";
import { useMemo } from "react";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import idl from "../../anchor.json";

export function useProgram() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  const programId = useMemo(
    () => new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID!),
    []
  );

  const provider = useMemo(() => {
    if (!wallet) return null;
    return new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  }, [connection, wallet]);

  const program = useMemo(() => {
    if (!provider) return null;
    return new anchor.Program(idl as anchor.Idl, provider);
  }, [provider]);

  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "localnet";
  return { program, programId, cluster, ready: !!program };
}
