"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, ChangeEvent, useMemo } from "react";
import JSZip from "jszip";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GetHospitalData } from "@/action/GetHospitalData";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";

// --- SOLANA IMPORTS ---
import * as anchor from "@coral-xyz/anchor";
import {
  useConnection,
  useAnchorWallet,
  useWallet,
} from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import idl from "../../../../anchor.json";
import {
  findPatientPda,
  findConfigPda,
  findPatientSeqPda,
  findHospitalPda,
  findGrantPda,
} from "@/lib/pda";
import bs58 from "bs58";
import { Textarea } from "@/components/ui/textarea";
import { StatusBanner } from "@/components/status-banner";
import { GeneralModal } from "@/components/general-modal";

interface MedicalRecord {
  patient_pubkey: string;
  hospital_pubkey: string | null;
  hospital_name: string | null;
  doctor_name: string;
  diagnosis: string;
  keywords: string;
  description: string;
}

interface HospitalData {
  name: string;
  authority_pubkey: string;
}

export default function Page() {
  const [record, setRecord] = useState<MedicalRecord | null>(null);
  const [original, setOriginal] = useState<MedicalRecord | null>(null);
  const [zipName, setZipName] = useState<string | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [images, setImages] = useState<{ name: string; blob: Blob }[]>([]);
  const [hospitalData, setHospitalData] = useState<HospitalData | null>(null);
  const [view, setView] = useState<"form" | "loading" | "qr">("form");

  // --- SOLANA STATE & HOOKS ---
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { signTransaction: waSignTx } = useWallet(); // <-- ADDED
  const [status, setStatus] = useState("");

  // --- LIVE CHECKS STATE ---
  const [hospitalOk, setHospitalOk] = useState<boolean | null>(null);
  const [patientAccountOk, setPatientAccountOk] = useState<boolean | null>(
    null
  );
  const [grantOk, setGrantOk] = useState<boolean | null>(null);
  const [grantErr, setGrantErr] = useState<string>("");

  // --- CO-SIGN STATE (COPIED) ---
  const [lastIx, setLastIx] = useState<TransactionInstruction | null>(null);
  const [coSignBase64, setCoSignBase64] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const patientPk = useMemo(() => {
    if (!record?.patient_pubkey) return null;
    try {
      return new PublicKey(record.patient_pubkey.trim());
    } catch {
      return null;
    }
  }, [record?.patient_pubkey]);

  // ==================== HELPERS (COPIED) ====================
  const u8ToB64 = (u8: Uint8Array) => Buffer.from(u8).toString("base64");
  const hexToU8 = (hex: string) => new Uint8Array(Buffer.from(hex, "hex"));
  const b64ToU8 = (b64: string) => new Uint8Array(Buffer.from(b64, "base64"));

  // ==================== ENC UPLOAD (MODIFIED) ====================
  async function encUpload(
    file: File,
    patientPk_b64: string,
    hospitalPk_b64: string
  ): Promise<{
    cidEnc: string;
    metaCid: string;
    sizeBytes: number;
    cipherHashHex: string;
    edekRoot_b64: string;
    edekPatient_b64: string;
    edekHospital_b64: string;
    kmsRef: string;
  }> {
    if (!file) throw new Error("No file provided for upload");

    const fd = new FormData();
    fd.append("file", file);
    fd.append("contentType", file.type || "application/octet-stream");
    fd.append("patientPk_b64", patientPk_b64);
    fd.append("rsCreatorPk_b64", hospitalPk_b64);

    if (record) {
      fd.append("hospital_name", record.hospital_name || "");
      fd.append("doctor_name", record.doctor_name || "");
      fd.append("diagnosis", record.diagnosis || "");
      fd.append("keywords", record.keywords || "");
      fd.append("description", record.description || "");
    }

    const r = await fetch("/api/enc-upload", { method: "POST", body: fd });

    const text = await r.text();
    if (!r.ok) throw new Error(text);
    return JSON.parse(text);
  }

  // ==================== LIVE CHECKERS (COPIED & ADAPTED) ====================
  // Check 1: Is connected wallet a registered hospital?
  useEffect(() => {
    (async () => {
      if (!program || !wallet?.publicKey) {
        setHospitalOk(null);
        return;
      }
      try {
        const hospitalPda = findHospitalPda(
          program.programId,
          wallet.publicKey
        );
        // @ts-expect-error anchor typing
        const hAcc = await program.account.hospital.fetchNullable(hospitalPda);
        setHospitalOk(!!hAcc);
      } catch {
        setHospitalOk(false);
      }
    })();
  }, [program, wallet?.publicKey]);

  // Check 2: Does the patient pubkey exist?
  useEffect(() => {
    (async () => {
      if (!program || !wallet?.publicKey) {
        setHospitalOk(null);
        return;
      }
      try {
        const hospitalPda = findHospitalPda(program.programId, wallet.publicKey);
        // @ts-expect-error anchor typing
        const hAcc = await program.account.hospital.fetchNullable(hospitalPda);
        setHospitalOk(!!hAcc);
      } catch {
        setHospitalOk(false);
      }
    })();
  }, [program, wallet?.publicKey, patientPk]); // ✅ add patientPk



  // Check 3: Does this hospital have a Write Grant from this patient?
  useEffect(() => {
    (async () => {
      setGrantErr("");
      if (!program || !wallet?.publicKey || !patientPk) {
        setGrantOk(null);
        return;
      }

      try {
        const patientPda = findPatientPda(program.programId, patientPk);
        const grantWritePda = findGrantPda(
          program.programId,
          patientPda,
          wallet.publicKey,
          2
        );
        // @ts-expect-error anchor typing
        const gAcc = await program.account.grant.fetchNullable(grantWritePda);
        if (!gAcc || gAcc.revoked) return setGrantOk(false);
        setGrantOk(true);
      } catch (e: any) {
        setGrantOk(false);
        setGrantErr(e?.message ?? "Grant check failed");
      }
    })();
  }, [program, wallet?.publicKey, patientPk]); 



  // ==================== FETCH HOSPITAL INFO ====================
  useEffect(() => {
    const fetchHospital = async () => {
      try {
        const data = await GetHospitalData();
        setHospitalData(data);
      } catch (err: unknown) {
        if (err instanceof Error)
          console.error("Failed to fetch hospital data:", err.message);
      }
    };
    fetchHospital();
  }, []);

  // ==================== LOAD ZIP ====================
  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    // ... (This function remains unchanged) ...
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const zip = await JSZip.loadAsync(file);
      const jsonFile = zip.file("medical_record.json");
      if (!jsonFile) {
        alert("medical_record.json not found");
        return;
      }

      const jsonText = await jsonFile.async("string");
      const data: MedicalRecord = JSON.parse(jsonText);
      setRecord(data);
      setOriginal(data);
      setZipName(file.name);

      // Extract images
      const imgs = await Promise.all(
        Object.values(zip.files)
          .filter((f) => /\.(jpe?g|png|webp|bmp)$/i.test(f.name) && !f.dir)
          .map(async (f) => ({ name: f.name, blob: await f.async("blob") }))
      );
      setImages(imgs);
      setPreviews(imgs.map((i) => URL.createObjectURL(i.blob)));

      // Auto-fill hospital info if available
      if (hospitalData) {
        setRecord((prev) =>
          prev
            ? {
                ...prev,

                hospital_pubkey: hospitalData.authority_pubkey,
                hospital_name: hospitalData.name,
              }
            : prev
        );
      }
    } catch (err: unknown) {
      console.error("Error reading zip:", err);
      alert("Failed to parse zip");
    }
  };

  // ==================== HELPERS ====================
  const handleChange = (key: keyof MedicalRecord, value: string) =>
    record && setRecord({ ...record, [key]: value });

  const handleReset = (key: keyof MedicalRecord) =>
    record && original && setRecord({ ...record, [key]: original[key] });

  const handleFill = () => {
    // ... (This function remains unchanged) ...
    if (!record || !hospitalData) return;
    setRecord({
      ...record,

      hospital_pubkey: hospitalData.authority_pubkey,
      hospital_name: hospitalData.name,
    });
  };

  const handleDownloadZip = async () => {
    // ... (This function remains unchanged) ...
    if (!record) return;

    const zip = new JSZip();
    zip.file("medical_record.json", JSON.stringify(record, null, 2));
    images.forEach((img) => zip.file(img.name, img.blob));

    const blob = await zip.generateAsync({ type: "blob" });

    // --- Filename structure: patient_pubkey + hospital_pubkey + date ---
    const patientKey =
      record.patient_pubkey?.replace(/[^a-zA-Z0-9_-]/g, "") ||
      "unknown_patient";
    const hospitalKey =
      record.hospital_pubkey?.replace(/[^a-zA-Z0-9_-]/g, "") ||
      "unknown_hospital";

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace("T", "_")
      .split(".")[0];

    const filename = `${patientKey}_${hospitalKey}_${timestamp}.zip`;

    // --- Download trigger ---
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // ==================== REFRESH TX (COPIED) ====================
  const refreshCosignTx = async () => {
    try {
      if (!wallet || !lastIx) return;
      setStatus("Refreshing co-sign transaction...");
      const { blockhash } = await connection.getLatestBlockhash("finalized");
      const ltx = new Transaction({
        feePayer: wallet.publicKey,
        recentBlockhash: blockhash,
      }).add(lastIx);

      if (!waSignTx) throw new Error("Wallet cannot sign transactions.");
      const signedByHospital = await waSignTx(ltx);

      const b64 = Buffer.from(
        signedByHospital.serialize({ requireAllSignatures: false })
      ).toString("base64");

      setCoSignBase64(b64);
      setStatus("Share the new link/base64 with the patient.");
      toast.success("Transaction refreshed.");
    } catch (e: any) {
      const msg = e?.message || String(e);
      setStatus(`❌ ${msg}`);
      toast.error(`Failed to refresh: ${msg}`);
    }
  };

  // ==================== MAIN SUBMIT (IMPLEMENTED) ====================
  const handleSubmitOnChain = async () => {
    setCoSignBase64("");
    setIsSubmitting(true);
    setView("loading"); // 🔄 switch to spinner view immediately

    try {
      setStatus("Checking preconditions...");
      if (!program || !wallet || !patientPk || !record)
        throw new Error("Program, wallet, patient, or record missing");
      if (!hospitalOk)
        throw new Error("Hospital not registered for this wallet.");
      if (!patientAccountOk)
        throw new Error("Patient not registered. Ask them to upsert first.");
      if (!grantOk)
        throw new Error(
          grantErr || "Write access not granted by this patient."
        );

      // --- existing logic (unchanged) ---
      const configPda = findConfigPda(programId);
      const patientPda = findPatientPda(programId, patientPk);
      const patientSeqPda = findPatientSeqPda(programId, patientPda);
      const hospitalPda = findHospitalPda(programId, wallet.publicKey);
      const grantWritePda = findGrantPda(
        programId,
        patientPda,
        wallet.publicKey,
        2
      );

      const patientPk_b64 = u8ToB64(bs58.decode(record.patient_pubkey.trim()));
      const hospitalPk_b64 = u8ToB64(wallet.publicKey.toBytes());

      setStatus("Zipping record...");
      const zip = new JSZip();
      zip.file("medical_record.json", JSON.stringify(record, null, 2));
      images.forEach((img) => zip.file(img.name, img.blob));
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const finalZipFile = new File([zipBlob], zipName || "record.zip", {
        type: "application/zip",
      });

      setStatus("Encrypting & uploading zip...");
      const {
        cidEnc,
        metaCid,
        sizeBytes,
        cipherHashHex,
        edekRoot_b64,
        edekPatient_b64,
        edekHospital_b64,
        kmsRef,
      } = await encUpload(finalZipFile, patientPk_b64, hospitalPk_b64);

      setStatus("Deriving PDAs & sequence...");
      // @ts-expect-error anchor typing
      const patientSeq = await program.account.patientSeq.fetch(patientSeqPda);
      const seq = new anchor.BN(patientSeq.value);

      const metaMime = "application/zip";
      const sizeBn = new anchor.BN(sizeBytes);
      const hash32 = Array.from(hexToU8(cipherHashHex));
      const edekRoot = Buffer.from(b64ToU8(edekRoot_b64));
      const edekForPatient = Buffer.from(b64ToU8(edekPatient_b64));
      const edekForHospital = Buffer.from(b64ToU8(edekHospital_b64));

      const method = program.methods
        .createRecord(
          seq,
          cidEnc,
          metaMime,
          metaCid,
          sizeBn,
          hash32,
          edekRoot,
          edekForPatient,
          edekForHospital,
          { kms: {} },
          { kms: {} },
          { kms: {} },
          kmsRef,
          1,
          { xChaCha20: {} },

          // ✅ Correct: Only 17 arguments total
          record.hospital_name || "",
          record.doctor_name || ""
        )
        .accounts({
          uploader: wallet.publicKey,
          payer: patientPk,
          config: configPda,
          patient: patientPda,
          patientSeq: patientSeqPda,
          hospital: hospitalPda,
          grantWrite: grantWritePda,
          record: PublicKey.findProgramAddressSync(
            [
              Buffer.from("record"),
              patientPda.toBuffer(),
              seq.toArrayLike(Buffer, "le", 8),
            ],
            programId
          )[0],
          systemProgram: SystemProgram.programId,
        });

      if (wallet.publicKey.equals(patientPk)) {
        setStatus("Submitting (single-signer test path)...");
        const sig = await method.rpc();
        toast.success(`Transaction confirmed: ${sig}`);
        setView("form");
        return;
      }

      setStatus("Building instruction...");
      const ix = await method.instruction();
      setLastIx(ix);

      const { blockhash } = await connection.getLatestBlockhash("finalized");
      const ltx = new Transaction({
        feePayer: wallet.publicKey,
        recentBlockhash: blockhash,
      }).add(ix);

      if (!waSignTx)
        throw new Error(
          "This wallet cannot sign transactions. Use Phantom/Backpack/Solflare."
        );

      const signedByHospital = await waSignTx(ltx);
      const b64 = Buffer.from(
        signedByHospital.serialize({ requireAllSignatures: false })
      ).toString("base64");

      setCoSignBase64(b64);
      setView("qr"); // ✅ show QR code page
      toast.success(
        "Transaction created successfully. Awaiting patient co-sign."
      );
    } catch (e: any) {
      const msg = e?.message || e?.toString?.() || "Unknown error";
      setStatus(`❌ ${msg}`);
      setView("form"); // ⏪ re-render form
      toast.error("Failed to initialize transaction.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- READY STATE ---
  const readyToSubmit =
    !!program &&
    !!wallet?.publicKey &&
    !!patientPk &&
    !!record &&
    hospitalOk === true &&
    patientAccountOk === true &&
    grantOk === true;

  // ==================== CLEAR ALL STATE ====================
  const handleClearUpload = () => {
    setRecord(null);
    setOriginal(null);
    setZipName(null);
    setImages([]);
    setPreviews([]);
    setStatus("");
    setHospitalOk(null);
    setPatientAccountOk(null);
    setGrantOk(null);
    setGrantErr("");
    setCoSignBase64("");
    setLastIx(null);

    // Reset the file input value
    const input = document.getElementById(
      "zip-input"
    ) as HTMLInputElement | null;
    if (input) input.value = "";

    console.log("Upload cleared and all states reset.");
  };

  // ==================== RENDER ====================
  return (
    <main className="my-6 min-h-[70vh] flex items-center justify-center">
      {/* ========== LOADING VIEW ========== */}
      {view === "loading" && (
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          <div className="w-10 h-10 border-4 border-t-transparent border-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">
            Submitting encrypted record to blockchain...
          </p>
        </div>
      )}

      {/* ========== QR VIEW ========== */}
      {view === "qr" && coSignBase64 && (
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-muted-foreground">
            Scan this QR to load the transaction on the patient&apos;s device:
          </p>

          <div className="p-3 border rounded bg-white dark:bg-black">
            <QRCodeCanvas
              value={coSignBase64}
              size={256}
              level="L"
              includeMargin
            />
          </div>

          {/* --- MODIFIED: Added Refresh Button k --- */}
          <div className="flex flex-col items-center gap-3">
            <p className="text-xs text-muted-foreground break-all max-w-[90%] text-center">
              {coSignBase64.slice(0, 64)}...
            </p>
            <div className="flex gap-2 items-center justify-center flex-wrap w-full">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(coSignBase64);
                    toast.success("Copied QR payload to clipboard");
                  } catch {
                    toast.error("Failed to copy to clipboard");
                  }
                }}
                className="flex-1"
              >
                Copy Payload
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshCosignTx}
                className="flex-1"
              >
                Refresh TX
              </Button>
            </div>
          </div>
          {/* --- END MODIFICATION --- */}

          <Button variant="outline" onClick={() => setView("form")}>
            Back to Form
          </Button>
        </div>
      )}

      {/* ========== FORM VIEW ========== */}
      {view === "form" && (
        <div className="w-full mx-auto">
          {/* <header className="flex mb-5">
            <h1 className="text-2xl font-architekt font-bold">
              Edit & Submit Record
            </h1>
          </header> */}

          <Input
            id="zip-input"
            type="file"
            accept=".zip"
            onChange={handleFileUpload}
            className="mb-4"
          />

          {/* --- STATUS BANNERS --- */}
          <div className="space-y-2 mb-4">
            {hospitalOk === false ? (
              <StatusBanner type="error">
                ❌ This wallet is not a registered hospital authority.
              </StatusBanner>
            ) : patientAccountOk === false && record?.patient_pubkey ? (
              <StatusBanner type="error">
                ⚠️ Patient not registered. Ask them to upsert on the Patients
                page.
              </StatusBanner>
            ) : grantOk === false ? (
              <StatusBanner type="warning">
                ⚠️ Write grant missing:{" "}
                {grantErr ||
                  "Patient must grant Write access to this hospital."}
              </StatusBanner>
            ) : hospitalOk && patientAccountOk && grantOk ? (
              <StatusBanner type="success">All Verified</StatusBanner>
            ) : null}
          </div>

          {/* --- RECORD FORM --- */}
          {record && zipName && (
            <section className="flex flex-col gap-y-3 border p-3 mt-5 rounded-xs">
              <h1 className="text-2xl font-bold font-architekt">{zipName}</h1>

              <div className="flex flex-col gap-8 mt-6">
                {/* ──────────────── 🧩 PATIENT SECTION ──────────────── */}
                <section>
                  <h2 className="font-bold mb-3 text-lg">
                    Patient Information
                  </h2>

                  <div>
                    <label className="font-medium">Patient Pubkey</label>
                    <div className="flex gap-2">
                      <Input
                        value={record.patient_pubkey ?? ""}
                        onChange={(e) =>
                          handleChange("patient_pubkey", e.target.value)
                        }
                      />
                      <Button
                        variant="outline"
                        onClick={() => handleReset("patient_pubkey")}
                      >
                        Revert
                      </Button>
                    </div>

                    {/* {patientCheckStatus && (
                      <p
                        className={`mt-1 text-sm ${
                          patientCheckStatus.startsWith("✅")
                            ? "text-emerald-600"
                            : patientCheckStatus.startsWith("❌")
                            ? "text-red-600"
                            : "text-gray-500"
                        }`}
                      >
                        {patientCheckStatus}
                      </p>
                    )} */}
                  </div>
                </section>

                {/* ──────────────── 🏥 DOCTOR & HOSPITAL SECTION ──────────────── */}
                <section>
                  <h2 className="font-bold mb-3 text-lg">
                    Doctor & Hospital Details
                  </h2>

                  <div className="flex flex-col gap-y-5">
                    {/* Doctor Name */}
                    <div>
                      <label className="font-medium">Doctor Name</label>
                      <div className="flex gap-2">
                        <Input
                          value={record.doctor_name ?? ""}
                          onChange={(e) =>
                            handleChange("doctor_name", e.target.value)
                          }
                        />
                        <Button
                          variant="outline"
                          onClick={() => handleReset("doctor_name")}
                        >
                          Revert
                        </Button>
                      </div>
                    </div>

                    {/* Hospital Pubkey */}
                    <div>
                      <label className="font-medium">Hospital Pubkey</label>
                      <div className="flex gap-2">
                        <Input
                          value={record.hospital_pubkey ?? ""}
                          onChange={(e) =>
                            handleChange("hospital_pubkey", e.target.value)
                          }
                        />
                        <Button
                          variant="outline"
                          onClick={() => handleReset("hospital_pubkey")}
                        >
                          Revert
                        </Button>
                        <Button onClick={handleFill} variant="secondary">
                          Fill
                        </Button>
                      </div>
                    </div>

                    {/* Hospital Name */}
                    <div>
                      <label className="font-medium">Hospital Name</label>
                      <div className="flex gap-2">
                        <Input
                          value={record.hospital_name ?? ""}
                          onChange={(e) =>
                            handleChange("hospital_name", e.target.value)
                          }
                        />
                        <Button
                          variant="outline"
                          onClick={() => handleReset("hospital_name")}
                        >
                          Revert
                        </Button>
                        <Button onClick={handleFill} variant="secondary">
                          Fill
                        </Button>
                      </div>
                    </div>
                  </div>
                </section>

                {/* ──────────────── 📋 RECORD SECTION ──────────────── */}
                <section>
                  <h2 className="font-bold mb-3 text-lg">Record Details</h2>

                  <div className="flex flex-col gap-4">
                    {/* Diagnosis */}
                    <div>
                      <label className="font-medium">Diagnosis</label>
                      <div className="flex gap-2">
                        <Textarea
                          value={record.diagnosis ?? ""}
                          onChange={(e) =>
                            handleChange("diagnosis", e.target.value)
                          }
                          className="min-h-[80px] w-full"
                        />
                        <Button
                          variant="outline"
                          onClick={() => handleReset("diagnosis")}
                        >
                          Revert
                        </Button>
                      </div>
                    </div>

                    {/* Keywords */}
                    <div>
                      <label className="font-medium">Keywords</label>
                      <div className="flex gap-2">
                        <Textarea
                          value={record.keywords ?? ""}
                          onChange={(e) =>
                            handleChange("keywords", e.target.value)
                          }
                          className="min-h-[80px] w-full"
                        />
                        <Button
                          variant="outline"
                          onClick={() => handleReset("keywords")}
                        >
                          Revert
                        </Button>
                      </div>
                    </div>

                    {/* Description */}
                    <div>
                      <label className="font-medium">Description</label>
                      <div className="flex gap-2">
                        <Textarea
                          value={record.description ?? ""}
                          onChange={(e) =>
                            handleChange("description", e.target.value)
                          }
                          className="min-h-[120px] w-full"
                        />
                        <Button
                          variant="outline"
                          onClick={() => handleReset("description")}
                        >
                          Revert
                        </Button>
                      </div>
                    </div>
                  </div>
                </section>

                {/* ──────────────── 🖼️ PREVIEW SECTION ──────────────── */}
                {previews.length > 0 && (
                  <section>
                    <h2 className="font-bold mb-3">Attached Preview</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {previews.map((src, i) => (
                        <ImagePreview key={i} src={src} />
                      ))}
                    </div>
                  </section>
                )}

                {/* ──────────────── ⚙️ ACTION BUTTONS ──────────────── */}
                <section className="mt-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      onClick={handleDownloadZip}
                      className="flex-1"
                      disabled={isSubmitting}
                      variant="outline"
                    >
                      Download Updated ZIP
                    </Button>
                    <Button
                      onClick={handleSubmitOnChain}
                      disabled={!readyToSubmit || isSubmitting}
                      className="flex-1"
                      variant="outline"
                    >
                      {isSubmitting ? "Submitting..." : "Submit On-Chain"}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleClearUpload}
                      disabled={isSubmitting}
                    >
                      Clear
                    </Button>
                  </div>
                </section>
              </div>

              {status && (
                <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">
                  {status}
                </p>
              )}
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function ImagePreview({ src }: { src: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className="relative w-full aspect-square border rounded-xs overflow-hidden cursor-pointer group"
      >
        <Image
          src={src}
          alt="Preview"
          fill
          className="object-cover transition-transform duration-200 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-sm font-medium">
          View
        </div>
      </div>

      <GeneralModal
        open={open}
        onOpenChange={setOpen}
        disablePadding
        size="lg"
        image={src}
      />
    </>
  );
}
