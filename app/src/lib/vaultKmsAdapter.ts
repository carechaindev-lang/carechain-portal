/* eslint-disable @typescript-eslint/no-explicit-any */
import { KmsAdapter, KmsContext } from "./kmsAdapter";

function stableJson(obj: any) {
  const keys = Object.keys(obj || {}).sort();
  const out: any = {};
  for (const k of keys) out[k] = obj[k];
  return JSON.stringify(out);
}

function b64encode(u8: Uint8Array) {
  return Buffer.from(u8).toString("base64");
}
function b64decodeToU8(b64: string) {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

export class VaultKmsAdapter implements KmsAdapter {
  public readonly keyRef: string;   // nama key transit, mis. "medrec-kek"
  private readonly addr: string;    // VAULT_ADDR
  private readonly token: string;   // VAULT_TOKEN

  private constructor(keyRef: string, addr: string, token: string) {
    this.keyRef = keyRef;
    this.addr = addr.replace(/\/+$/, ""); // trim trailing slash
    this.token = token;
  }

  static async init(
    keyRef = process.env.VAULT_TRANSIT_KEY || "carechain-transit",
    addr   = process.env.VAULT_ADDR || "http://127.0.0.1:8200",
    token  = process.env.VAULT_TOKEN || "root"
  ): Promise<VaultKmsAdapter> {
    if (!token) throw new Error("VAULT_TOKEN kosong");
    return new VaultKmsAdapter(keyRef, addr, token);
  }

  // ------- helper internal -------
  private mount() {
    return (process.env.VAULT_TRANSIT_MOUNT || "transit").replace(/^\/|\/$/g, "");
  }
  private nsHeader(): Record<string,string> {
    const ns = process.env.VAULT_NAMESPACE;
    return ns ? { "X-Vault-Namespace": ns } : {};
  }
  private ctxB64(ctx?: KmsContext): string | undefined {
    if (!ctx) return undefined;
    const json = stableJson({ keyRef: this.keyRef, ...ctx });
    return Buffer.from(json).toString("base64");
  }

  // ------- API KmsAdapter -------
  async encryptKey(dek: Uint8Array, ctx?: KmsContext): Promise<Uint8Array> {
    const plaintext = b64encode(dek);   // DEK → base64
    const context   = this.ctxB64(ctx); // context → base64(JSON stabil)

    const url = `${this.addr}/v1/${this.mount()}/encrypt/${encodeURIComponent(this.keyRef)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Vault-Token": this.token,
        "Content-Type": "application/json",
        ...this.nsHeader(),
      },
      body: JSON.stringify({
        plaintext,
        ...(context ? { context } : {}),
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Vault encryptKey gagal: ${res.status} ${txt}`);
    }
    const body = await res.json();
    const ciphertext: string = body?.data?.ciphertext; // "vault:v1:...."
    if (!ciphertext) throw new Error("Vault encryptKey: ciphertext kosong");

    // Kembalikan sebagai bytes UTF-8 agar konsisten dengan DevKmsAdapter (Uint8Array)
    return new TextEncoder().encode(ciphertext);
  }

  async decryptKey(wrapped: Uint8Array, ctx?: KmsContext): Promise<Uint8Array> {
    // wrapped = bytes UTF-8 dari string ciphertext Vault ("vault:v1:...")
    const ciphertext = new TextDecoder().decode(wrapped);
    const context    = this.ctxB64(ctx);

    const url = `${this.addr}/v1/${this.mount()}/decrypt/${encodeURIComponent(this.keyRef)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Vault-Token": this.token,
        "Content-Type": "application/json",
        ...this.nsHeader(),
      },
      body: JSON.stringify({
        ciphertext,
        ...(context ? { context } : {}),
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Vault decryptKey gagal: ${res.status} ${txt}`);
    }
    const body = await res.json();
    const plaintextB64: string = body?.data?.plaintext;
    if (!plaintextB64) throw new Error("Vault decryptKey: plaintext kosong");

    return b64decodeToU8(plaintextB64); // DEK (Uint8Array)
  }
}