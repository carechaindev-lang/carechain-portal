/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { QrCodeIcon, X } from "lucide-react";
import { Scanner, useDevices } from "@yudiel/react-qr-scanner";
import { StatusBanner } from "@/components/status-banner";
import { toast } from "sonner";

export default function Page() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const params = useSearchParams();

  const [b64, setB64] = useState("");
  const [status, setStatus] = useState("");
  const [scanning, setScanning] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);

  // list all available cameras
  const devices = useDevices();

  // auto-fill from link param ?tx=
  useEffect(() => {
    const q = params.get("tx");
    if (q) setB64(q);
  }, [params]);

  const canSign = useMemo(
    () => !!publicKey && !!signTransaction,
    [publicKey, signTransaction]
  );

  // --- handle transaction signing ---
  const coSignAndSend = async () => {
    try {
      if (!canSign) throw new Error("Connect patient wallet first.");
      if (!b64.trim()) throw new Error("No transaction provided.");

      setStatus("Decoding transaction...");
      const tx = Transaction.from(Buffer.from(b64.trim(), "base64"));

      setStatus("Signing...");
      const signed = await signTransaction!(tx);

      setStatus("Sending...");
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      setStatus(`✅ Submitted: ${sig}`);
      toast.success("Transaction Sent");
    } catch (e: any) {
      setStatus(`❌ ${e?.message || String(e)}`);
      toast.error("Transaction Failed");
    }
  };

  // --- QR code decode handler ---
  const handleScan = (result: unknown) => {
    if (!result) return;
    // if result is array or object, normalize it to string
    const text =
      typeof result === "string"
        ? result
        : Array.isArray(result)
          ? result[0]?.rawValue
          : (result as any)?.rawValue;

    if (text) {
      setB64(text);
      setScanning(false);
      setStatus("✅ QR decoded successfully.");
    }
  };

  return (
    <main className="my-5">
      <div className="flex flex-col">
        <h1 className="text-xl font-bold mb-5">CO-SIGN RECORD</h1>

        {/* ─────────────── QR MODAL SCANNER ─────────────── */}
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

            {/* Device selector */}
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

        {/* ─────────────── TEXTAREA + BUTTONS ─────────────── */}
        <Textarea
          className="w-full p-2 text-xs font-mono h-92"
          placeholder="Paste or scan the base64 transaction..."
          value={b64}
          onChange={(e) => setB64(e.target.value)}
        />

        <div className="flex justify-between gap-x-5 my-5 w-full">
          <Button
            className="flex-1"
            variant="outline"
            onClick={() => setScanning(true)}
          >
            Scan QR <QrCodeIcon className="ml-2 w-4 h-4" />
          </Button>

          <Button
            className="flex-1"
            variant="default"
            disabled={!canSign}
            onClick={coSignAndSend}
          >
            Sign & Submit
          </Button>
        </div>
        {status && (
          <StatusBanner
            type={
              status.startsWith("❌")
                ? "error"
                : status.startsWith("✅")
                  ? "success"
                  : status.startsWith("⚠️")
                    ? "warning"
                    : "info" // Defaults to info (blue) for processing messages
            }
          >
            {status}
          </StatusBanner>
        )}
      </div>
    </main>
  );
}
