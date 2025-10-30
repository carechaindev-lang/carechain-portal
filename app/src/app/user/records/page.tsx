/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-comment */
"use client";

import { useEffect, useMemo, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import sodium from "libsodium-wrappers";
import { useProgram } from "@/hooks/useProgram";
import { useWallet } from "@solana/wallet-adapter-react";
import { findPatientPda, findPatientSeqPda } from "@/lib/pda";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { FilterButton } from "@/components/filter-button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { ChevronsUpDown, ExternalLink, Search } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner"; // ✅ for user feedback
import { StatusBanner } from "@/components/status-banner";

type Rec = {
  seq: number;
  pda: string;
  cidEnc: string;
  metaCid: string;
  hospital: string;
  sizeBytes: number;
  createdAt: string;
  hospital_name: string;
  doctor_name: string;
  diagnosis: string;
  keywords: string;
  description: string;
  txSignature?: string;
};

const pinataGateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY?.trim();
const ipfsGateway = (cid: string) =>
  pinataGateway
    ? `${pinataGateway.startsWith("http")
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

export default function Page() {
  const { publicKey } = useWallet();
  const { program, programId, ready } = useProgram();

  const [records, setRecords] = useState<Rec[]>([]);
  const [patientOk, setPatientOk] = useState<boolean | null>(null);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const perPage = 5;

  // Track which record is currently downloading
  const [downloading, setDownloading] = useState<string | null>(null);

  // State to track if record likely has attachment
  const [attachmentStatus, setAttachmentStatus] = useState<
    Record<string, boolean>
  >({});

  // ================== FETCH ON-CHAIN RECORDS ==================
  useEffect(() => {
    (async () => {
      setErr("");
      setRecords([]);
      setPatientOk(null);
      if (!ready || !program || !publicKey) return;

      try {
        const patientPda = findPatientPda(programId, publicKey);
        // @ts-expect-error anchor typing
        const pAcc = await program.account.patient.fetchNullable(patientPda);
        if (!pAcc) {
          setPatientOk(false);
          return;
        }
        setPatientOk(true);

        const seqPda = findPatientSeqPda(programId, patientPda);
        // @ts-expect-error
        const seqAcc = await program.account.patientSeq.fetch(seqPda);
        const total = Number(seqAcc.value);

        const out: Rec[] = [];
        for (let i = 0; i < total; i++) {
          const recordPda = PublicKey.findProgramAddressSync(
            [
              Buffer.from("record"),
              patientPda.toBuffer(),
              new anchor.BN(i).toArrayLike(Buffer, "le", 8),
            ],
            programId
          )[0];
          // @ts-expect-error
          const rec = await program.account.record.fetch(recordPda);

          let meta: any = {};
          try {
            const metaRes = await fetch(ipfsGateway(rec.metaCid), {
              cache: "no-store",
            });
            meta = await metaRes.json();
          } catch { }

          out.push({
            seq: i,
            pda: recordPda.toBase58(),
            cidEnc: rec.cidEnc,
            metaCid: rec.metaCid,
            hospital: rec.hospital.toBase58(),
            sizeBytes: Number(rec.sizeBytes),
            createdAt: new Date(Number(rec.createdAt) * 1000).toLocaleString(),
            hospital_name: meta.hospital_name || rec.hospitalName || "",
            doctor_name: meta.doctor_name || rec.doctorName || "",
            diagnosis: meta.diagnosis || "",
            keywords: meta.keywords || "",
            description: meta.description || "",
            txSignature: rec.txSignature ?? "",
          });
        }

        setRecords(out.reverse());
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      }
    })();
  }, [ready, program, programId, publicKey]);

  // ================== CHECK ATTACHMENTS ==================
  useEffect(() => {
    if (records.length === 0) {
      setAttachmentStatus({});
      return;
    }
    const THRESHOLD_NO_ATTACHMENT = 5120;
    const newStatus: Record<string, boolean> = {};
    for (const rec of records)
      newStatus[rec.pda] = rec.sizeBytes > THRESHOLD_NO_ATTACHMENT;
    setAttachmentStatus(newStatus);
  }, [records]);

  // ================== DECRYPT & DOWNLOAD ==================
  async function decryptAndDownload(rec: Rec) {
    if (attachmentStatus[rec.pda] === false) return;

    try {
      setDownloading(rec.pda);
      toast.loading("Decrypting and preparing file...", {
        id: rec.pda,
      });

      await sodium.ready;
      const meta = await (
        await fetch(ipfsGateway(rec.metaCid), { cache: "no-store" })
      ).json();

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

      if (!unwrap?.dek_b64) throw new Error("Failed to unwrap DEK");
      const DEK = Uint8Array.from(Buffer.from(unwrap.dek_b64, "base64"));

      const chunkSize = meta.chunk_size ?? 1024 * 1024;
      const nonceBase = Uint8Array.from(Buffer.from(meta.nonce_base, "base64"));
      const aad = new TextEncoder().encode(meta.aad || "");
      const res = await fetch(ipfsGateway(rec.cidEnc));
      const encBuf = new Uint8Array(await res.arrayBuffer());

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

      const total = chunks.reduce((n, c) => n + c.length, 0);
      const merged = new Uint8Array(total);
      let p = 0;
      for (const c of chunks) {
        merged.set(c, p);
        p += c.length;
      }

      const blob = new Blob([merged], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${rec.diagnosis || "medical_record"}_${rec.seq}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Decrypted and downloaded successfully!", {
        id: rec.pda,
      });
    } catch (e: any) {
      console.error(e);
      toast.error(`Error: ${e?.message ?? "Decryption failed"}`, {
        id: rec.pda,
      });
      setErr(e?.message ?? String(e));
    } finally {
      setDownloading(null);
    }
  }

  // ================== FILTERING + PAGINATION ==================
  const filteredRecords = useMemo(() => {
    const filtered = records.filter((r) =>
      (r.diagnosis + r.keywords + r.description)
        .toLowerCase()
        .includes(search.toLowerCase())
    );

    if (filterMode === "doctor")
      filtered.sort((a, b) => a.doctor_name.localeCompare(b.doctor_name));
    else if (filterMode === "hospital")
      filtered.sort((a, b) => a.hospital_name.localeCompare(b.hospital_name));
    else if (filterMode === "dateAsc")
      filtered.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    else if (filterMode === "dateDesc")
      filtered.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

    return filtered;
  }, [records, search, filterMode]);

  const totalPages = Math.ceil(filteredRecords.length / perPage);
  const startIndex = (page - 1) * perPage;
  const paginated = filteredRecords.slice(startIndex, startIndex + perPage);

  // ================== UI ==================
  return (
    <main className=" my-5">
      <header className="font-architekt p-2 border rounded-xs mt-5">
        <div className="flex font-bold gap-x-2 items-center">
          <Search size={20} /> Search for Records
        </div>
      </header>

      <div className="mt-2">
        {!publicKey && (
          <StatusBanner type="warning">
            ⚠️ Connect wallet to load your records.
          </StatusBanner>
        )}

        {publicKey && patientOk === false && (
          <StatusBanner type="error">
            ❌ This wallet is not registered as a patient yet.
          </StatusBanner>
        )}

        {err && <StatusBanner type="error">⚠️ {err}</StatusBanner>}

        {patientOk && records.length > 0 && (
          <StatusBanner type="success">
            ✅ Successfully fetched {records.length} record
            {records.length > 1 ? "s" : ""}.
          </StatusBanner>
        )}
      </div>

      <div className="flex gap-2  mt-2">
        <Input
          placeholder="Search records..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />

        <FilterButton
          options={[
            { label: "Default", value: null },
            { label: "Doctor (A-Z)", value: "doctor" },
            { label: "Hospital (A-Z)", value: "hospital" },
            { label: "Date ↑", value: "dateAsc" },
            { label: "Date ↓", value: "dateDesc" },
          ]}
          selected={filterMode}
          onChange={(val) => {
            setFilterMode(val);
            setPage(1);
          }}
        />
      </div>

      <div className="flex flex-col gap-y-4 mt-5 mb-5">
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

              <div className="pt-3 border-t mt-3">
                <Button
                  onClick={() => decryptAndDownload(rec)}
                  disabled={
                    attachmentStatus[rec.pda] === false ||
                    downloading === rec.pda
                  }
                  variant={"secondary"}
                >
                  {attachmentStatus[rec.pda] === false
                    ? "No Attachments"
                    : downloading === rec.pda
                      ? "Decrypting..."
                      : "Download & Decrypt"}
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>

      {filteredRecords.length > perPage && (
        <Pagination className="mb-5">
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
    </main>
  );
}
