export type KmsContext = {
  patientPubkey?: string;
  recordId?: string;
  requester?: string;
  extra?: Record<string, string | number | boolean>;
};

export interface KmsAdapter {
  readonly keyRef: string;
  encryptKey(dek: Uint8Array, ctx?: KmsContext): Promise<Uint8Array>;
  decryptKey(wrapped: Uint8Array, ctx?: KmsContext): Promise<Uint8Array>;
}