// src/app/read-record/dec/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import sodium from "libsodium-wrappers";
import { VaultKmsAdapter } from "@/lib/vaultKmsAdapter";

export const runtime = "nodejs";

const toU8 = (b64: string) => Uint8Array.from(Buffer.from(b64, "base64"));

function deriveNonce(base: Uint8Array, idx: number) {
  const out = new Uint8Array(base);
  out[out.length - 4] = idx & 0xff;
  out[out.length - 3] = (idx >> 8) & 0xff;
  out[out.length - 2] = (idx >> 16) & 0xff;
  out[out.length - 1] = (idx >> 24) & 0xff;
  return out;
}

function gatewayUrl(cid: string) {
  const gw = process.env.PINATA_GATEWAY?.trim();
  if (gw) {
    const host = gw.startsWith("http") ? gw : `https://${gw}`;
    return `${host}/ipfs/${cid}`;
  }
  return `https://ipfs.io/ipfs/${cid}`;
}

type DecReq = {
  encCid: string;      // CID of record.enc
  metaCid: string;     // CID of meta.json
  granteeId: string;   // "patient" or whatever id was used in meta.dek_for
  ed25519Sk_b64: string;
  ed25519Pk_b64: string; // optional but recommended
  // optional filename override
  outName?: string;
};

export async function POST(req: Request) {
  try {
    await sodium.ready;

    const body: DecReq = await req.json();
    const { encCid, metaCid, granteeId, ed25519Sk_b64, ed25519Pk_b64, outName } = body;

    if (!encCid || !metaCid) {
      return NextResponse.json({ error: "encCid and metaCid are required" }, { status: 400 });
    }
    if (!granteeId) {
      return NextResponse.json({ error: "granteeId is required (e.g., 'patient' or 'rs_creator')" }, { status: 400 });
    }
    if (!ed25519Sk_b64 || !ed25519Pk_b64) {
      return NextResponse.json({ error: "ed25519Sk_b64 and ed25519Pk_b64 are required (base64)" }, { status: 400 });
    }

    // --- fetch meta.json ---
    const metaRes = await fetch(gatewayUrl(metaCid), { cache: "no-store" });
    if (!metaRes.ok) return NextResponse.json({ error: `fetch meta failed ${metaRes.status}` }, { status: 502 });
    const meta = await metaRes.json();

    // Expected fields in meta (as produced by your enc-upload)
    // - alg: "xchacha20-poly1305"
    // - chunk_size
    // - chunks
    // - chunk_lengths: number[]
    // - nonce_base: b64
    // - aad: string
    // - cipher_hash: hex
    // - kms_key_ref
    // - wrapped_dek: b64 (Wkms)
    // - dek_for: { [id]: { type: "x25519-sealedbox", edek: b64 } }
    // - original_content_type

    if (meta.alg !== "xchacha20-poly1305") {
      return NextResponse.json({ error: "Unsupported alg" }, { status: 400 });
    }
    if (!meta.dek_for || !meta.dek_for[granteeId]) {
      return NextResponse.json({ error: `No grant for granteeId='${granteeId}' in meta.dek_for` }, { status: 400 });
    }
    const entry = meta.dek_for[granteeId];
    if (entry.type !== "x25519-sealedbox") {
      return NextResponse.json({ error: "Unsupported grant type" }, { status: 400 });
    }

    // --- open sealed-box (Wkms) with the grantee Ed25519 keys ---
    const sk = toU8(ed25519Sk_b64);
    const pk = toU8(ed25519Pk_b64);
    const curveSk = sodium.crypto_sign_ed25519_sk_to_curve25519(sk);
    const curvePk = sodium.crypto_sign_ed25519_pk_to_curve25519(pk);
    const Wkms_bytes = sodium.crypto_box_seal_open(toU8(entry.edek), curvePk, curveSk);
    if (!Wkms_bytes) {
      return NextResponse.json({ error: "Sealed-box open failed (wrong keys for granteeId)" }, { status: 401 });
    }

    // --- unwrap DEK via Vault KMS ---
    const kms = await VaultKmsAdapter.init();
    // Context must match the one used at encrypt time; we used { recordId: meta.aad }
    const DEK = await kms.decryptKey(Wkms_bytes, { recordId: meta.aad });

    // --- fetch encrypted bytes (record.enc) ---
    const encRes = await fetch(gatewayUrl(encCid), { cache: "no-store" });
    if (!encRes.ok) return NextResponse.json({ error: `fetch enc failed ${encRes.status}` }, { status: 502 });
    const encBuf = Buffer.from(await encRes.arrayBuffer());

    // --- decrypt chunk by chunk ---
    const chunkLens: number[] = meta.chunk_lengths ?? [];
    const nonceBase = toU8(meta.nonce_base);
    const aad = meta.aad ? new TextEncoder().encode(meta.aad) : null;

    let offset = 0;
    const plains: Buffer[] = [];
    for (let i = 0; i < chunkLens.length; i++) {
      const clen = chunkLens[i] ?? 0;
      const cipher = encBuf.subarray(offset, offset + clen);
      offset += clen;

      const nonce = deriveNonce(nonceBase, i);
      const plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null, cipher, aad, nonce, DEK
      );
      plains.push(Buffer.from(plain));
    }

    const out = Buffer.concat(plains);
    const contentType = meta.original_content_type || "application/octet-stream";
    const fileName = outName || "record.decrypted";

    const res = new NextResponse(out, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(out.length),
      },
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
