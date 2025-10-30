"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "./ui/button";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { QRCodeCanvas } from "qrcode.react";
import { GeneralModal } from "@/components/general-modal";
import { QrCode } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function NavBar() {
  const { publicKey } = useWallet();
  const [showQR, setShowQR] = useState(false);

  const qrData = publicKey ? publicKey.toBase58() : "";

  return (
    <>
      <nav className="sticky top-0 border-b dark:bg-background bg-white z-50">
        <main className="max-w-[1400px] mx-auto flex items-center justify-between py-4 px-6">
          {/* ─── Logo Section ─── */}
          <Link className="flex items-center gap-x-3" href="/">
            <Image
              src="/MainLogo_White.svg"
              alt="CareChain Logo"
              width={50}
              height={50}
              className="object-contain select-none"
              priority
            />
            <h1 className="text-2xl font-architekt font-bold">CARECHAIN</h1>
          </Link>

          {/* ─── Wallet and QR Section ─── */}
          <div className="flex items-center gap-x-5">
            <Button
              onClick={() => {
                if (!publicKey) {
                  return toast.error("Connect to wallet first.");
                }
                setShowQR(true);
              }}
              variant="secondary"
              size="icon"
              className="rounded-lg"
            >
              <QrCode className="w-5 h-5" />
            </Button>
            <WalletMultiButton className="min-w-[160px]" />
          </div>
        </main>
      </nav>

      <GeneralModal
        open={showQR}
        onOpenChange={setShowQR}
        title="Wallet Address"
        desc={qrData}
        copyable
      >
        {qrData && (
          <div className="border rounded-lg p-3 bg-white dark:bg-card">
            <QRCodeCanvas value={qrData} size={200} includeMargin />
          </div>
        )}
      </GeneralModal>
    </>
  );
}
