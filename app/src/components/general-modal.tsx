"use client";

import * as React from "react";
import Image from "next/image";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface GeneralModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  desc?: string;
  image?: string;
  copyable?: boolean;
  children?: React.ReactNode;
  size?: "sm" | "md" | "lg"; // new
  disablePadding?: boolean; // new (for full-width image display)
}

export function GeneralModal({
  open,
  onOpenChange,
  title = "Information",
  desc,
  image,
  copyable = false,
  children,
  size = "sm",
  disablePadding = false,
}: GeneralModalProps) {
  const handleCopy = async () => {
    if (!desc) return;
    await navigator.clipboard.writeText(desc);
    toast.success("Copied to clipboard");
  };

  const sizeClass =
    size === "lg"
      ? "sm:max-w-[800px]"
      : size === "md"
      ? "sm:max-w-[500px]"
      : "sm:max-w-[400px]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${sizeClass} ${
          disablePadding ? "p-0" : "p-6"
        } flex flex-col items-center text-center gap-y-4`}
      >
        {!disablePadding && (
          <DialogHeader className="w-full">
            <div className="flex justify-between items-center">
              <DialogTitle className="font-semibold text-lg">
                {title}
              </DialogTitle>
            </div>
          </DialogHeader>
        )}

        {image && (
          <div className="relative w-full h-[70vh] bg-black">
            <Image
              src={image}
              alt="modal image"
              fill
              className="object-contain select-none"
            />
          </div>
        )}

        {children && <div className="my-2">{children}</div>}

        {desc && (
          <DialogDescription className="flex items-center gap-x-2 justify-center">
            <span className="break-all max-w-[300px]">{desc}</span>
            {copyable && (
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-muted"
                onClick={handleCopy}
              >
                <Copy className="w-4 h-4" />
              </Button>
            )}
          </DialogDescription>
        )}
      </DialogContent>
    </Dialog>
  );
}
