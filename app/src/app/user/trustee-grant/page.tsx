/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/ban-ts-comment */
"use client";

import { useEffect, useMemo, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "../../../../anchor.json";
import dynamic from "next/dynamic";
import {
  findConfigPda,
  findGrantPda,
  findHospitalPda,
  findPatientPda,
  findTrusteePda,
} from "@/lib/pda";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, QrCode } from "lucide-react";
import { GeneralModal } from "@/components/general-modal";
import { Scanner, useDevices } from "@yudiel/react-qr-scanner";
import { StatusBanner } from "@/components/status-banner";

const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

const SCOPE_READ = 1;

export default function TrusteeGrantPage() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  const [patientStr, setPatientStr] = useState("");
  const [granteeStr, setGranteeStr] = useState("");
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("");
  const [sig, setSig] = useState("");

  const [hospital, setHospital] = useState<any>(null);
  const [trusteeOfPatient, setTrusteeOfPatient] = useState<boolean | null>(
    null
  );

  // === QR Scanner State ===
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanTarget, setScanTarget] = useState<"patient" | "hospital" | null>(
    null
  );
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const devices = useDevices();

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

  const trusteePk = wallet?.publicKey ?? null;

  // ---- Verify trustee relationship to patient ----
  useEffect(() => {
    (async () => {
      setTrusteeOfPatient(null);
      if (!program || !patientStr.trim() || !trusteePk) return;

      try {
        const patientPk = new PublicKey(patientStr.trim());
        const trusteePda = findTrusteePda(programId, patientPk, trusteePk);
        // @ts-expect-error
        const acc = await program.account.trustee.fetchNullable(trusteePda);
        if (!acc || acc.revoked) setTrusteeOfPatient(false);
        else setTrusteeOfPatient(true);
      } catch {
        setTrusteeOfPatient(false);
      }
    })();
  }, [program, programId, patientStr, trusteePk]);

  // ---- Verify hospital authority ----
  useEffect(() => {
    (async () => {
      setHospital(null);
      if (!program || !granteeStr.trim()) return;
      try {
        const granteePk = new PublicKey(granteeStr.trim());
        const hospitalPda = findHospitalPda(program.programId, granteePk);
        // @ts-expect-error
        const acc = await program.account.hospital.fetchNullable(hospitalPda);
        if (!acc) return;
        setHospital({
          authority: granteePk.toBase58(),
          name: acc.name,
          createdAt: Number(acc.createdAt),
        });
      } catch {
        setHospital(null);
      }
    })();
  }, [program, granteeStr]);

  const ensureReady = () => {
    if (!program || !wallet) throw new Error("Wallet/program not ready");
    if (!trusteePk) throw new Error("Connect trustee wallet first");
    if (!patientStr.trim()) throw new Error("Enter patient wallet address");
    if (!granteeStr.trim()) throw new Error("Enter hospital authority pubkey");
  };

  // === Trustee directly creates READ grant ===
  const submitGrantDirect = async () => {
    try {
      setErr("");
      setSig("");
      setStatus("");
      ensureReady();
      if (!trusteeOfPatient)
        throw new Error("You are not a valid trustee of this patient.");

      const patientPk = new PublicKey(patientStr.trim());
      const granteePk = new PublicKey(granteeStr.trim());
      const patientPda = findPatientPda(programId, patientPk);
      const grantPda = findGrantPda(
        programId,
        patientPda,
        granteePk,
        SCOPE_READ
      );
      const configPda = findConfigPda(programId);
      const trusteePda = findTrusteePda(
        programId,
        patientPk,
        wallet!.publicKey
      );

      setStatus("Submitting transaction...");

      const txSig = await program!.methods
        .grantAccess(SCOPE_READ)
        .accounts({
          authority: wallet!.publicKey,
          config: configPda,
          patient: patientPda,
          grant: grantPda,
          grantee: granteePk,
          trusteeAccount: trusteePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setSig(txSig);
      setStatus("✅ Grant successfully created and submitted.");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  // === Handle QR scan results ===
  const handleScanResult = (result: any) => {
    if (!result?.[0]?.rawValue) return;
    const text = result[0].rawValue.trim();

    if (scanTarget === "patient") {
      setPatientStr(text);
      setStatus("✅ Patient address filled from QR");
    } else if (scanTarget === "hospital") {
      setGranteeStr(text);
      setStatus("✅ Hospital address filled from QR");
    }

    setScanModalOpen(false);
  };

  return (
    <main className="mx-auto mt-5">
      <header className="font-architekt p-2 border rounded-xs">
        <div className="flex font-bold gap-x-2 items-center">
          <Search size={20} /> Trustee Grant Access (READ only)
        </div>
      </header>

      {/* ─── Patient Wallet Input + Scan ─── */}
      <div className="flex items-center gap-x-2 mt-2">
        <Input
          placeholder="Patient wallet address"
          value={patientStr}
          onChange={(e) => setPatientStr(e.target.value)}
        />
        <Button
          variant="outline"
          onClick={() => {
            setScanTarget("patient");
            setScanModalOpen(true);
          }}
        >
          <QrCode className="w-4 h-4 mr-2" /> Scan
        </Button>
      </div>

      <div className="mt-2">
        {trusteeOfPatient === false && (
          <StatusBanner type="error">
            ❌ You are not a registered trustee for this patient.
          </StatusBanner>
        )}

        {trusteeOfPatient === true && (
          <StatusBanner type="success">
            ✅ You are an active trustee for this patient.
          </StatusBanner>
        )}
      </div>

      {/* ─── Hospital Input + Scan ─── */}
      <div className="flex items-center gap-x-2 mt-2">
        <Input
          placeholder="Hospital authority pubkey"
          value={granteeStr}
          onChange={(e) => setGranteeStr(e.target.value)}
        />
        <Button
          variant="outline"
          onClick={() => {
            setScanTarget("hospital");
            setScanModalOpen(true);
          }}
        >
          <QrCode className="w-4 h-4 mr-2" /> Scan
        </Button>
      </div>

      {/* ─── Hospital Verification Banner ─── */}
      <div className="mt-2">
        {hospital && (
          <StatusBanner type="success">
            <span className="font-medium font-mono">
              ✅ Hospital is verified on chain .
            </span>
          </StatusBanner>
        )}

        {!hospital && granteeStr.trim() && (
          <StatusBanner type="warning">
            ⚠️ No hospital found for this authority.
          </StatusBanner>
        )}
      </div>

      {/* ─── Submit Grant ─── */}
      <div className="space-x-2">
        <Button
          onClick={submitGrantDirect}
          disabled={!patientStr || !granteeStr || trusteeOfPatient !== true}
          variant={"outline"}
          className="mt-2"
        >
          Create Grant (Trustee direct)
        </Button>

        <Button
          variant="destructive"
          onClick={() => {
            setPatientStr("");
            setGranteeStr("");
            setHospital(null);
            setTrusteeOfPatient(null);
            setErr("");
            setStatus("");
            setSig("");
          }}
        >
          Clear Inputs
        </Button>
      </div>

      <div className="mt-2">
        {status && (
          <StatusBanner type={status.startsWith("✅") ? "success" : "info"}>
            {status}
          </StatusBanner>
        )}

        <div className="mt-2">
          {sig && (
            <StatusBanner type="info">
              <span className="font-medium">Tx Signature:</span>{" "}
              <span className="font-mono">{sig}</span>
            </StatusBanner>
          )}
        </div>
      </div>

      {err && <StatusBanner type="error">⚠️ {err}</StatusBanner>}

      {/* ─── QR Scanner Modal ─── */}
      <GeneralModal
        open={scanModalOpen}
        onOpenChange={setScanModalOpen}
        title={
          scanTarget === "patient"
            ? "Scan Patient Wallet QR"
            : "Scan Hospital Authority QR"
        }
        size="md"
        disablePadding
      >
        <div className="flex flex-col items-center justify-center p-4 gap-4">
          <p className="text-sm text-muted-foreground text-center">
            {scanTarget === "patient"
              ? "Scan a QR code containing the patient's wallet address."
              : "Scan a QR code containing the hospital authority's pubkey."}
          </p>

          <div className="relative w-full aspect-square bg-black rounded overflow-hidden">
            <Scanner
              allowMultiple={false}
              constraints={{
                facingMode: "environment",
                deviceId: selectedDevice || undefined,
              }}
              onScan={handleScanResult}
              onError={(error) => {
                console.error(error);
                setStatus("⚠️ Camera error or permission denied");
              }}
            />
          </div>

          {devices.length > 1 && (
            <select
              className="mt-2 text-sm bg-white dark:bg-gray-800 p-2 rounded border"
              onChange={(e) => setSelectedDevice(e.target.value || null)}
              value={selectedDevice ?? ""}
            >
              <option value="">Default Camera</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${d.deviceId}`}
                </option>
              ))}
            </select>
          )}
        </div>
      </GeneralModal>
    </main>
  );
}
