import { PublicKey } from "@solana/web3.js";

export const findConfigPda = (pid: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("config")], pid)[0];

export const findHospitalPda = (pid: PublicKey, auth: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("hospital"), auth.toBuffer()],
    pid
  )[0];

export const findGrantPda = (
  pid: PublicKey,
  patientPda: PublicKey,
  grantee: PublicKey,
  scope: number
) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("grant"),
      patientPda.toBuffer(),
      grantee.toBuffer(),
      Buffer.from([scope & 0xff]),
    ],
    pid
  )[0];

export const findPatientPda = (pid: PublicKey, patientPk: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("patient"), patientPk.toBuffer()],
    pid
  )[0];

// ✅ FIXED: must use the *Patient PDA* as seed, not patient’s wallet pubkey
export const findPatientSeqPda = (pid: PublicKey, patientPda: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("patient_seq"), patientPda.toBuffer()],
    pid
  )[0];

export function findTrusteePda(
  programId: PublicKey,
  patientWallet: PublicKey,
  trusteeWallet: PublicKey
) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("trustee"),
      patientWallet.toBuffer(),
      trusteeWallet.toBuffer(),
    ],
    programId
  )[0];
}
