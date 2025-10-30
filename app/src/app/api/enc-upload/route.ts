/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import sodium from "libsodium-wrappers";
import { VaultKmsAdapter } from "@/lib/vaultKmsAdapter";
import { PinataSDK } from "pinata";
import { Blob, File } from "buffer";


export const runtime = "nodejs";

const CHUNK_SIZE = 1024 * 1024; // 1 MB
const toHex = (u8: Uint8Array) => Buffer.from(u8).toString("hex");
const b64 = (u8: Uint8Array) => Buffer.from(u8).toString("base64");

function deriveNonce(base: Uint8Array, idx: number) {
  const out = new Uint8Array(base); // copy
  out[out.length - 4] = idx & 0xff;
  out[out.length - 3] = (idx >> 8) & 0xff;
  out[out.length - 2] = (idx >> 16) & 0xff;
  out[out.length - 1] = (idx >> 24) & 0xff;
  return out;
}

export async function GET() {
  console.log("[enc-upload] GET hit");
  return NextResponse.json({ ok: true, route: "/create-record/enc-upload" });
}

export async function POST(req: Request) {
const fail = (where: string, e: unknown, status = 500) => {
  console.error(`[enc-upload] ${where}:`, e);
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === "string"
      ? e
      : JSON.stringify(e);
  return NextResponse.json({ error: `${where}: ${msg}` }, { status });
};


  console.log("[enc-upload] POST hit");

  // =========================
  // A) Parse multipart form
  // =========================
  let file: File | null;
  let contentType = "application/octet-stream";
  let patientPk_b64: string | null;
  let rsCreatorPk_b64: string | null;
  let hospital_name: string = "";
  let doctor_name: string = "";
  let diagnosis: string = "";
  let keywords: string = "";
  let description: string = "";

  try {
    const form = await req.formData();
    file = form.get("file") as File | null;
    contentType = (form.get("contentType") as string) || contentType;
    patientPk_b64 = (form.get("patientPk_b64") as string) || null;
    rsCreatorPk_b64 = (form.get("rsCreatorPk_b64") as string) || null;

    hospital_name = (form.get("hospital_name") as string) || "";
    doctor_name = (form.get("doctor_name") as string) || "";
    diagnosis = (form.get("diagnosis") as string) || "";
    keywords = (form.get("keywords") as string) || "";
    description = (form.get("description") as string) || "";

    if (!file) return fail("A: file missing", new Error("file missing"), 400);
    if (!patientPk_b64)
      return fail(
        "A: patientPk_b64 missing",
        new Error("patientPk_b64 missing"),
        400
      );
    if (!rsCreatorPk_b64)
      return fail(
        "A: rsCreatorPk_b64 missing",
        new Error("rsCreatorPk_b64 missing"),
        400
      );

    console.log("[enc-upload] A ok");
  } catch (e) {
    return fail("A parse formData", e);
  }

  // ======================================
  // B) Read file & init crypto (libsodium)
  // ======================================
  let plainBuf: Buffer;
  try {
    await sodium.ready;
    plainBuf = Buffer.from(await file.arrayBuffer());
    console.log("[enc-upload] B ok size =", plainBuf.length);
  } catch (e) {
    return fail("B read/crypto init", e);
  }

  // ===========================
  // C) Encrypt + BLAKE2b hash
  // ===========================
  let cipherHash!: Uint8Array;
  let recordEnc!: Buffer;
  let nonceBase!: Uint8Array;
  let aadStr!: string;
  let DEK!: Uint8Array;

  try {
    DEK = sodium.randombytes_buf(32);
    nonceBase = sodium.randombytes_buf(
      sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
    );
    aadStr = `record_id=${Date.now()}`;
    const aad = new TextEncoder().encode(aadStr);

    const gh = sodium.crypto_generichash_init(null, 32);
    const chunks: Buffer[] = [];

    for (let off = 0, i = 0; off < plainBuf.length; i++) {
      const end = Math.min(off + CHUNK_SIZE, plainBuf.length);
      const nonce = deriveNonce(nonceBase, i);
      const cipher = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        plainBuf.subarray(off, end),
        aad,
        null,
        nonce,
        DEK
      );
      const cbuf = Buffer.from(cipher);
      chunks.push(cbuf);
      sodium.crypto_generichash_update(gh, cipher);
      off = end;
    }

    cipherHash = sodium.crypto_generichash_final(gh, 32);
    recordEnc = Buffer.concat(chunks);
    console.log("[enc-upload] C ok encBytes =", recordEnc.length);
  } catch (e) {
    return fail("C encrypt/hash", e);
  }

  // ==========================================
  // D) KMS wrap DEK + sealed-box (per grantee)
  // ==========================================
  let Wkms_bytes!: Uint8Array;
  let edekPatient_b64!: string;
  let edekHospital_b64!: string;
  let kmsRef!: string;

  try {
    const kms = await VaultKmsAdapter.init(); // needs VAULT_ADDR, VAULT_TOKEN, VAULT_TRANSIT_KEY
    kmsRef = kms.keyRef;

    // Wrap the DEK inside KMS (opaque bytes "vault:vN:...")
    Wkms_bytes = await kms.encryptKey(DEK, { recordId: aadStr });
    // wipe plaintext DEK
    DEK.fill(0);

    const seal = (pk_b64: string) => {
      const edPk = Buffer.from(pk_b64, "base64");
      const curvePk = sodium.crypto_sign_ed25519_pk_to_curve25519(edPk);
      const sealed = sodium.crypto_box_seal(Wkms_bytes, curvePk);
      return b64(sealed); // base64 for JSON
    };

    edekPatient_b64 = seal(patientPk_b64!);
    edekHospital_b64 = seal(rsCreatorPk_b64!);

    console.log("[enc-upload] D ok");
  } catch (e) {
    return fail("D kms/sealed-box", e);
  }

  // ============================
  // E) Upload to Pinata (SDK v4+)
  // ============================
  let cidEnc = "", metaCid = "";
  try {
    const pinata = new PinataSDK({
      pinataJwt: process.env.PINATA_JWT!,
      pinataGateway: process.env.PINATA_GATEWAY ?? "example-gateway.mypinata.cloud",
    });

    // ciphertext → Blob → File (SDK requires Web File interface)
    const blob = new Blob([recordEnc], { type: "application/octet-stream" });
    const file = new File([blob], "record.enc", { type: "application/octet-stream" });

    // Upload encrypted file (public network)
   // @ts-expect-error Node File type mismatch with Web File
    const uploadFile = await pinata.upload.public.file(file).name("record.enc");


    // The new response schema uses `cid` not `IpfsHash`
    cidEnc = uploadFile.cid;

    // --- Metadata JSON Upload ---
    const meta = {
      alg: "xchacha20-poly1305",
      chunk_size: CHUNK_SIZE,
      nonce_base: b64(nonceBase),
      aad: aadStr,
      cipher_hash: toHex(cipherHash),
      kms_key_ref: kmsRef,
      wrapped_dek: b64(Wkms_bytes),
      dek_for: {
        patient: { type: "x25519-sealedbox", edek: edekPatient_b64 },
        rs_creator: { type: "x25519-sealedbox", edek: edekHospital_b64 },
      },
      original_content_type: contentType,
      created_at: Math.floor(Date.now() / 1000),
      hospital_name,
      doctor_name,
      diagnosis,
      keywords,
      description,
    };

    const uploadMeta = await pinata.upload.public.json(meta).name("meta.json");
    metaCid = uploadMeta.cid;

    console.log("[enc-upload] E ok", { cidEnc, metaCid });
  } catch (e) {
    return fail("E pinata upload", e);
  }


  // ============================
  // F) Return plain JSON result
  // ============================
  try {
    return NextResponse.json({
      cidEnc,
      metaCid,
      sizeBytes: recordEnc.length,
      cipherHashHex: toHex(cipherHash),

      edekRoot_b64: b64(Wkms_bytes),
      edekPatient_b64,
      edekHospital_b64,

      kmsRef, // string
    });
  } catch (e) {
    return fail("F build response", e);
  }
}
