"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { SlidersHorizontal } from "lucide-react";

interface FilterButtonProps {
  options: { label: string; value: string | null }[];
  selected: string | null;
  onChange: (value: string | null) => void;
}

export function FilterButton({
  options,
  selected,
  onChange,
}: FilterButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon">
          <SlidersHorizontal className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-2 space-y-1">
        {options.map((opt) => (
          <Button
            key={opt.label}
            variant={opt.value === selected ? "default" : "ghost"}
            className="w-full justify-start"
            onClick={() => {
              onChange(opt.value);
              setOpen(false);
            }}
          >
            {opt.label}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
