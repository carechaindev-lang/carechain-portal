/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useCallback } from "react";
import AppSidebar from "@/components/app-sidebar";
import {
  Building2,
  FileText,
  ShieldCheck,
  Handshake,
  KeySquare,
  FileSignature,
} from "lucide-react";
import Navbar from "@/components/navbar";
import dynamic from "next/dynamic";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { useMemo, useState, useEffect } from "react";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";

import idl from "../../../anchor.json";
import { findPatientPda, findPatientSeqPda } from "@/lib/pda";
import { MAX_DID_LEN } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SIDEBAR_ITEMS = [
  {
    label: "Overview",
    href: "/user/overview",
    icon: <Building2 className="w-5 h-5" />,
  },
  {
    label: "Records",
    href: "/user/records",
    icon: <FileText className="w-5 h-5" />,
  },
  {
    label: "Trustees",
    href: "/user/trustees",
    icon: <ShieldCheck className="w-5 h-5" />, // symbolizes verified / trusted entities
  },
  {
    label: "Trustee Grant",
    href: "/user/trustee-grant",
    icon: <Handshake className="w-5 h-5" />, // represents delegation / partnership
  },
  {
    label: "Access",
    href: "/user/access",
    icon: <KeySquare className="w-5 h-5" />, // signifies access control / permissions
  },
  {
    label: "Co-Sign",
    href: "/user/co-sign",
    icon: <FileSignature className="w-5 h-5" />, // better than FilePen for signing
  },
];

const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

// --- New Registration Component ---
function RegistrationForm({
  program,
  wallet,
  patientPda,
  seqPda,
  onRegistered,
}: {
  program: anchor.Program;
  wallet: anchor.Wallet;
  patientPda: PublicKey;
  seqPda: PublicKey;
  onRegistered: () => void;
}) {
  const [did, setDid] = useState("");
  const [err, setErr] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Helper: useWalletDid (from PatientsPage) ---
  const deriveWalletDid = useCallback(() => {
    try {
      if (!wallet?.publicKey) throw new Error("Wallet not connected");
      const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet";
      const didStr = `did:pkh:solana:${network}:${wallet.publicKey.toBase58()}`;
      if (didStr.length > MAX_DID_LEN)
        throw new Error("Derived DID exceeds max length");
      setDid(didStr);
      setErr("");
    } catch (e: any) {
      setDid("");
      setErr(e?.message ?? String(e));
    }
  }, [wallet]);



  // Auto-set DID from wallet public key
  useEffect(() => {
    if (wallet?.publicKey) deriveWalletDid();
  }, [wallet, deriveWalletDid]);



  // --- Upsert logic ---
  const handleSubmit = async () => {
    setErr("");
    setIsSubmitting(true);
    try {
      if (!program || !wallet || !patientPda || !seqPda)
        throw new Error("Wallet/Program not ready");

      const d = did.trim();
      if (!d) throw new Error("DID could not be derived from wallet");
      if (d.length > MAX_DID_LEN)
        throw new Error(`DID max ${MAX_DID_LEN} chars`);
      // We already have the hash bytes, just need to parse them again

      await program.methods
        .upsertPatient(d)
        .accounts({
          patientSigner: wallet.publicKey,
          patient: patientPda,
          patientSeq: seqPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      onRegistered(); // Tell layout to update
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen text-center gap-4 font-architekt">
      <p className="text-lg font-bold tracking-wide">
        Welcome! Please Register
      </p>
      <p className="text-sm text-gray-500">
        To use the app, you need to create a patient profile.
      </p>
      <WalletMultiButton />
      <div className="w-full max-w-sm space-y-3">
        {/* DID Input (Auto-filled from wallet) */}
        <div className="text-left">
          <label className="text-sm font-medium">DID (from Wallet)</label>
          <Input
            type="text"
            placeholder="Your Decentralized ID (DID)"
            value={did}
            readOnly
            disabled
          />
        </div>

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !did}
          variant={"outline"}
        >
          {isSubmitting ? "Registering..." : "Register Profile"}
        </Button>
      </div>

      {/* Error Display */}
      {err && (
        <pre className="text-sm text-red-600 whitespace-pre-wrap max-w-sm text-left">
          {err}
        </pre>
      )}
    </div>
  );
}

// --- Main Layout Component ---
export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const wallet = useAnchorWallet();
  const { connection } = useConnection(); // Added

  // State to track registration
  const [isRegistered, setIsRegistered] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // --- Anchor Setup (from PatientsPage) ---
  const programId = useMemo(
    () => new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID!),
    []
  );

  const provider = useMemo(
    () =>
      wallet
        ? new anchor.AnchorProvider(connection, wallet, {
            commitment: "confirmed",
          })
        : null,
    [connection, wallet]
  );

  const program = useMemo(
    () => (provider ? new anchor.Program(idl as anchor.Idl, provider) : null),
    [provider]
  );

  // --- PDA Derivation (from PatientsPage) ---
  const patientPk = wallet?.publicKey ?? null;
  const patientPda = useMemo(
    () => (patientPk ? findPatientPda(programId, patientPk) : null),
    [programId, patientPk]
  );
  const seqPda = useMemo(
    () => (patientPda ? findPatientSeqPda(programId, patientPda) : null),
    [programId, patientPda]
  );

  // --- Registration Check Effect ---
  useEffect(() => {
    // Don't check if wallet isn't connected or program/pda isn't ready
    if (!wallet || !program || !patientPda) {
      setIsLoading(false); // Not loading a check
      setIsRegistered(false); // Can't be registered if not connected
      return;
    }

    const checkRegistration = async () => {
      setIsLoading(true);
      try {
        // Try to fetch the patient account. This is the check.
        // @ts-expect-error anchor account typing
        await program.account.patient.fetch(patientPda);
        // If fetch succeeds, the account exists.
        setIsRegistered(true);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error: any) {
        // If it fails (e.g., "Account not found"), they are not registered.
          console.warn("Patient account not found, user is not registered.");
          setIsRegistered(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkRegistration();
  }, [program, patientPda, wallet]); // Re-run when wallet or program is ready

  // --- Render Logic ---

  // 1. Wallet Not Connected
  if (!wallet) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-center gap-4 font-architekt">
        <p className="text-lg font-bold tracking-wide">Access Restricted</p>
        <p className="text-sm text-gray-500">
          Connect your Solana wallet to continue.
        </p>
        <WalletMultiButton />
      </div>
    );
  }

  // 2. Wallet Connected, Checking Registration
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen font-architekt">
        <p className="text-lg">Loading user profile...</p>
      </div>
    );
  }

  // 3. Wallet Connected, Not Registered
  
  if (!isRegistered) {
    return (
      <RegistrationForm
        program={program!}
        wallet={wallet as any} // ✅ suppress NodeWallet type requirement
        patientPda={patientPda!}
        seqPda={seqPda!}
        onRegistered={() => setIsRegistered(true)}
      />
    );
  }

  // 4. Wallet Connected and Registered
  return (
    <main>
      <Navbar />
      <div className="grid grid-cols-12 min-w-[1400px] max-w-[1400px] mx-auto gap-x-5">
        <div className="sticky top-[6rem] h-[calc(100vh_-_6rem)] max-h-screen col-span-3">
          <AppSidebar dynamicItems={SIDEBAR_ITEMS} isAdmin={false} />
        </div>

        <div className="col-span-8">{children}</div>
        <div className="sticky top-[4rem] h-fit col-span-1"></div>
      </div>
    </main>
  );
}
