"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-comment */
import { useState, useMemo, useEffect } from "react";
import {
  Search,
  ChevronsUpDown,
  ExternalLink,
  QrCodeIcon,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Separator } from "@/components/ui/separator";
import { StatusBanner } from "@/components/status-banner";
import { useProgram } from "@/hooks/useProgram";
import { useWallet } from "@solana/wallet-adapter-react";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import sodium from "libsodium-wrappers";

import { findPatientPda, findPatientSeqPda } from "@/lib/pda";
import { Scanner, useDevices } from "@yudiel/react-qr-scanner";
import { toast } from "sonner";
import { FilterButton } from "@/components/filter-button";

const SEED_RECORD = Buffer.from("record");
const SEED_GRANT = Buffer.from("grant");
const SCOPE_READ = 1;

const findGrantReadPda = (
  pid: PublicKey,
  patientPda: PublicKey,
  reader: PublicKey
) =>
  PublicKey.findProgramAddressSync(
    [
      SEED_GRANT,
      patientPda.toBuffer(),
      reader.toBuffer(),
      Buffer.from([SCOPE_READ]),
    ],
    pid
  )[0];

const pinataGateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY?.trim();
const ipfsGateway = (cid: string) =>
  pinataGateway
    ? `${
        pinataGateway.startsWith("http")
          ? pinataGateway
          : `https://${pinataGateway}`
      }/ipfs/${cid}`
    : `https://ipfs.io/ipfs/${cid}`;

function deriveNonce(b: Uint8Array, idx: number) {
  const out = new Uint8Array(b);
  out[out.length - 4] = idx & 0xff;
  out[out.length - 3] = (idx >> 8) & 0xff;
  out[out.length - 2] = (idx >> 16) & 0xff;
  out[out.length - 1] = (idx >> 24) & 0xff;
  return out;
}

type Rec = {
  seq: number;
  pda: string;
  cidEnc: string;
  metaCid: string;
  hospital: string;
  sizeBytes: number;
  createdAt: string;
  hospital_id: string;
  hospital_name: string;
  doctor_name: string;
  doctor_id: string;
  diagnosis: string;
  keywords: string;
  description: string;
  txSignature?: string;
};

export default function Page() {
  const { publicKey: hospitalWallet } = useWallet();
  const { program, programId, ready } = useProgram();

  const [patientInput, setPatientInput] = useState("");
  const [records, setRecords] = useState<Rec[]>([]);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasGrant, setHasGrant] = useState<boolean | null>(null);
  const [downloadAllowed, setDownloadAllowed] = useState<
    Record<string, boolean>
  >({});

  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const perPage = 5;
  const totalPages = Math.ceil(records.length / perPage);
  const paginated = useMemo(
    () => records.slice((page - 1) * perPage, page * perPage),
    [records, page]
  );

  const disabled = !ready || !program || !hospitalWallet;
  const [scanning, setScanning] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const devices = useDevices();

  // --- NEW: Run attachment check as soon as records are loaded ---
  useEffect(() => {
    // This effect runs once when records are loaded.
    // It uses a size heuristic to guess if attachments exist.
    if (records.length === 0) {
      setDownloadAllowed({});
      return;
    }

    // 5KB threshold. A zip with only a JSON file will likely be smaller.
    const THRESHOLD_NO_ATTACHMENT = 5120; // 5 KB
    const newDownloadAllowed: Record<string, boolean> = {};

    for (const rec of records) {
      // If size is very small, assume NO attachments.
      if (rec.sizeBytes < THRESHOLD_NO_ATTACHMENT) {
        newDownloadAllowed[rec.pda] = false;
      } else {
        // Otherwise, assume YES attachments.
        newDownloadAllowed[rec.pda] = true;
      }
    }
    // Set the state for all buttons at once.
    setDownloadAllowed(newDownloadAllowed);
  }, [records]); // Dependency: run when records change

  const handleScan = (result: unknown) => {
    if (!result) return;
    const text =
      typeof result === "string"
        ? result
        : Array.isArray(result)
        ? result[0]?.rawValue
        : (result as any)?.rawValue;
    if (text) {
      setPatientInput(text.trim());
      setScanning(false);
      setStatus("✅ QR decoded successfully.");
    }
  };

  async function fetchPatientRecords() {
    try {
      setRecords([]);
      setErr("");
      setStatus("⏳ Loading...");
      setLoading(true);
      setHasGrant(null);
      setDownloadAllowed({}); // Reset download permissions on new search

      const patientWalletPk = new PublicKey(patientInput.trim());
      const patientPda = findPatientPda(programId, patientWalletPk);
      // @ts-expect-error
      const pAcc = await program!.account.patient.fetchNullable(patientPda);
      if (!pAcc) throw new Error("Patient not registered.");

      const grantReadPda = findGrantReadPda(
        programId,
        patientPda,
        hospitalWallet!
      );
      // @ts-expect-error
      const grantAcc = await program!.account.grant.fetchNullable(grantReadPda);
      if (
        !grantAcc ||
        grantAcc.revoked ||
        (Number(grantAcc.expiresAt) !== 0 &&
          Number(grantAcc.expiresAt) <= Math.floor(Date.now() / 1000))
      ) {
        setHasGrant(false);
        throw new Error("No active read grant for this patient.");
      }
      setHasGrant(true);

      const patientSeqPda = findPatientSeqPda(programId, patientPda);
      // @ts-expect-error
      const seqAcc = await program!.account.patientSeq.fetch(patientSeqPda);
      const total = Number(seqAcc.value);

      const out: Rec[] = [];
      for (let i = 0; i < total; i++) {
        const recordPda = PublicKey.findProgramAddressSync(
          [
            SEED_RECORD,
            patientPda.toBuffer(),
            new anchor.BN(i).toArrayLike(Buffer, "le", 8),
          ],
          programId
        )[0];
        // @ts-expect-error
        const rec = await program!.account.record.fetch(recordPda);
        const meta = await (await fetch(ipfsGateway(rec.metaCid))).json();

        out.push({
          seq: i,
          pda: recordPda.toBase58(),
          cidEnc: rec.cidEnc,
          metaCid: rec.metaCid,
          hospital: rec.hospital.toBase58(),
          sizeBytes: Number(rec.sizeBytes),
          createdAt: new Date(Number(rec.createdAt) * 1000).toISOString(),
          hospital_id: rec.hospitalId,
          hospital_name: rec.hospitalName,
          doctor_name: rec.doctorName,
          doctor_id: rec.doctorId,
          diagnosis: meta.diagnosis || "",
          keywords: meta.keywords || "",
          description: meta.description || "",
          txSignature: rec.txSignature ?? undefined,
        });
      }

      setRecords(out.reverse());
      setStatus("✅ Records fetched successfully.");
      toast.success("Records fetched successfully.");
    } catch (e: any) {
      const message = e.message || String(e);
      setErr(message);
      toast.error(message);
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  // --- MODIFIED: Simplified download function ---
  async function handleDecryptAndDownload(rec: Rec) {
    // Check against the state set by the useEffect
    if (downloadAllowed[rec.pda] === false) {
      toast.info("This record only contains metadata and no file attachments.");
      return;
    }

    try {
      setStatus("Decrypting...");
      await sodium.ready;
      const meta = await (await fetch(ipfsGateway(rec.metaCid))).json();
      const res = await fetch(ipfsGateway(rec.cidEnc));
      if (!res.ok) throw new Error("Failed to fetch encrypted data.");
      const encBuf = new Uint8Array(await res.arrayBuffer());
      const chunkSize = meta.chunk_size ?? 1024 * 1024;
      const nonceBase = Uint8Array.from(Buffer.from(meta.nonce_base, "base64"));
      const aad = new TextEncoder().encode(meta.aad || "");

      const unwrap = await (
        await fetch("/api/unwrap-dek", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            wrapped_dek_b64: meta.wrapped_dek,
            recordId: meta.aad,
          }),
        })
      ).json();

      if (!unwrap?.dek_b64) throw new Error("Failed to unwrap DEK.");
      const DEK = Uint8Array.from(Buffer.from(unwrap.dek_b64, "base64"));

      const TAG = sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES;
      const chunks: Uint8Array[] = [];
      let off = 0,
        idx = 0;
      while (off < encBuf.length) {
        const clen = Math.min(chunkSize + TAG, encBuf.length - off);
        const cipher = encBuf.subarray(off, off + clen);
        off += clen;
        const nonce = deriveNonce(nonceBase, idx++);
        const plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
          null,
          cipher,
          aad,
          nonce,
          DEK
        );
        chunks.push(plain);
      }

      const merged = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let p = 0;
      for (const c of chunks) {
        merged.set(c, p);
        p += c.length;
      }

      // The check is no longer needed here, we just proceed to download.
      setStatus("✅ Attachments found. Preparing download...");

      const blob = new Blob([merged], { type: meta.original_content_type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date(rec.createdAt).toISOString().split("T")[0];
      a.download = `record_${rec.seq}_${date}.zip`;
      a.click();
      URL.revokeObjectURL(url); // Clean up

      setStatus("✅ Download complete.");
      toast.success("Decrypted file downloaded.");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setStatus("");
      toast.error(e?.message ?? String(e));
    }
  }

  return (
    <main className="mt-5 mx-auto ">
      <header className="font-architekt p-2 border rounded-xs">
        <div className="flex font-bold gap-x-2 items-center">
          <Search size={20} /> Search for Patients
        </div>
      </header>

      <div className="space-y-2 my-2">
        {err && <StatusBanner type="error">❌ {err}</StatusBanner>}
        {status && !err && status.toLowerCase().includes("loading") && (
          <StatusBanner type="info">⏳ {status}</StatusBanner>
        )}
        {status && !err && status.startsWith("✅") && (
          <StatusBanner type="success">{status}</StatusBanner>
        )}
        {status && !err && status.startsWith("ℹ️") && (
          <StatusBanner type="info">{status}</StatusBanner>
        )}
        {hasGrant === false && (
          <StatusBanner type="warning">
            ⚠️ No active read grant. Ask patient to authorize this hospital.
          </StatusBanner>
        )}
      </div>

      <div className="mt-2 flex gap-x-3 mb-5">
        <Input
          placeholder="Enter patient wallet (base58)"
          value={patientInput}
          onChange={(e) => setPatientInput(e.target.value)}
        />
        <Button
          onClick={fetchPatientRecords}
          disabled={disabled || loading || !patientInput.trim()}
          variant="outline"
        >
          {loading ? "Loading..." : "Search"}
        </Button>
        <Button
          onClick={() => {
            setPatientInput("");
            setRecords([]);
            setErr("");
            setStatus("");
            setHasGrant(null);
            setDownloadAllowed({}); // Clear download state
            toast.info("Search cleared.");
          }}
          variant="secondary"
        >
          Clear
        </Button>
        <FilterButton
          options={[
            { label: "All", value: null },
            { label: "Doctor Name", value: "doctor_name" },
            { label: "Hospital Name", value: "hospital_name" },
            { label: "Diagnosis", value: "diagnosis" },
          ]}
          selected={selectedFilter}
          onChange={(v) => setSelectedFilter(v)}
        />
        <Button variant="outline" onClick={() => setScanning(true)}>
          <QrCodeIcon />
        </Button>
      </div>

      {hasGrant && records.length > 0 && (
        <div className="flex flex-col gap-y-4 mb-5">
          {paginated.map((rec) => (
            <Collapsible key={rec.pda} className="border p-4 rounded-xs">
              <CollapsibleTrigger className="w-full flex justify-between text-left items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate text-sm">
                    {rec.diagnosis || "Untitled Diagnosis"}
                  </div>
                  {rec.keywords && (
                    <div className="text-sm text-muted-foreground space-x-2">
                      <span>{rec.keywords}</span>
                    </div>
                  )}
                </div>
                <div className="text-sm text-muted-foreground text-right whitespace-nowrap">
                  {new Date(rec.createdAt).toLocaleDateString()}
                </div>
                <ChevronsUpDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </CollapsibleTrigger>

              <CollapsibleContent className="mt-4 space-y-4 text-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-medium">Hospital Name</div>
                    <div className="font-mono border p-2 rounded-xs">
                      {rec.hospital_name || "N/A"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium">Doctor Name</div>
                    <div className="font-mono border p-2 rounded-xs">
                      {rec.doctor_name || "N/A"}
                    </div>
                  </div>
                </div>

                <Separator className="my-2" />
                {rec.description && (
                  <div>
                    <div className="text-xs font-medium">Description</div>
                    <p className="whitespace-pre-wrap border p-2 rounded-xs min-h-52 max-h-52">
                      {rec.description}
                    </p>
                  </div>
                )}

                {rec.txSignature && (
                  <div>
                    <div className="text-xs font-medium">
                      Transaction Signature
                    </div>
                    <a
                      href={`https://solscan.io/tx/${rec.txSignature}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-blue-600 hover:text-blue-800 underline"
                    >
                      View on Solscan <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                )}

                <Separator className="my-2" />
                <div className="pt-3 border-t mt-3">
                  {/* --- This button now uses the state from useEffect --- */}
                  <Button
                    onClick={() => handleDecryptAndDownload(rec)}
                    variant="secondary"
                    disabled={downloadAllowed[rec.pda] === false}
                  >
                    {downloadAllowed[rec.pda] === false
                      ? "No Attachments"
                      : "Download & Decrypt"}
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}

      {records.length > perPage && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (page > 1) setPage(page - 1);
                }}
              />
            </PaginationItem>
            {Array.from({ length: totalPages }).map((_, i) => (
              <PaginationItem key={i}>
                <PaginationLink
                  href="#"
                  isActive={page === i + 1}
                  onClick={(e) => {
                    e.preventDefault();
                    setPage(i + 1);
                  }}
                >
                  {i + 1}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (page < totalPages) setPage(page + 1);
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      {scanning && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center">
          <div className="w-[320px] aspect-square bg-black rounded-lg overflow-hidden border-4 border-white relative">
            <Scanner
              constraints={{
                facingMode: selectedDevice ? undefined : "environment",
                deviceId: selectedDevice || undefined,
              }}
              onScan={handleScan}
              onError={(err) => {
                console.error(err);
                setStatus("⚠️ Camera error or permission denied.");
              }}
            />
          </div>
          {devices.length > 1 && (
            <select
              className="mt-3 text-sm bg-white dark:bg-gray-800 p-2 rounded"
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
          <Button
            variant="destructive"
            className="mt-4"
            onClick={() => setScanning(false)}
          >
            <X className="w-4 h-4 mr-2" /> Close Scanner
          </Button>
        </div>
      )}
    </main>
  );
}
