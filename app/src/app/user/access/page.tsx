/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useEffect, useMemo, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  Search,
  Loader2,
  ChevronsUpDown,
  ClipboardCopyIcon,
  BookCheck,
} from "lucide-react"; // Import icons
import idl from "../../../../anchor.json";
import {
  findGrantPda,
  findHospitalPda,
  findPatientPda,
  findConfigPda,
  findTrusteePda,
} from "@/lib/pda";

// Import shadcn/ui components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { toast } from "sonner";
import { StatusBanner } from "@/components/status-banner";

// --- Type definitions (unchanged) ---
type HospitalUi = {
  pubkey: string;
  authority: string;
  name: string;
  kmsRef: string;
  createdAt: number;
} | null;

type GrantUi = {
  pubkey: string;
  scope: number;
  patient: string; // PDA
  grantee: string; // hospital authority
  createdBy: string;
  createdAt: number;
  expiresAt?: number | null;
  revoked: boolean;
  revokedAt?: number | null;
};

// --- CONSTANTS ---
const GRANTS_PER_PAGE = 5;

export default function Page() {
  const { connection } = useConnection();
  // Check if a given account exists on-chain
  async function accountExists(pubkey: PublicKey): Promise<boolean> {
    const info = await connection.getAccountInfo(pubkey);
    return !!info;
  }

  const wallet = useAnchorWallet();

  // --- State for inputs ---
  const [filterGranteeStr, setFilterGranteeStr] = useState("");
  const [activeGranteeStr, setActiveGranteeStr] = useState("");
  // const [expiresStr, setExpiresStr] = useState(""); // User commented out

  // --- State for UI feedback ---
  const [err, setErr] = useState("");
  const [sig, setSig] = useState("");
  const [hospital, setHospital] = useState<HospitalUi>(null);
  const [patientExists, setPatientExists] = useState<boolean | null>(null);
  const [grants, setGrants] = useState<GrantUi[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState("");

  // --- NEW STATE ---
  // Map of hospital authority pubkey -> hospital name
  const [hospitalMap, setHospitalMap] = useState<Record<string, string>>({});

  // --- Pagination State ---
  const [currentPage, setCurrentPage] = useState(1);

  // --- Anchor/Program setup (unchanged) ---
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

  // --- PDAs and PubKeys (unchanged) ---
  const patientPk = wallet?.publicKey ?? null;
  const patientPda = useMemo(
    () => (patientPk ? findPatientPda(programId, patientPk) : null),
    [programId, patientPk]
  );

  // --- Grantee parsing (unchanged) ---
  const grantee = useMemo(() => {
    try {
      const t = activeGranteeStr.trim();
      return t ? new PublicKey(t) : null;
    } catch {
      return null;
    }
  }, [activeGranteeStr]);

  // --- Patient check (unchanged) ---
  useEffect(() => {
    (async () => {
      setPatientExists(null);
      if (!program || !patientPda) return;
      try {
        // @ts-expect-error anchor account typing
        const acc = await program.account.patient.fetchNullable(patientPda);
        setPatientExists(!!acc);
      } catch {
        setPatientExists(false);
      }
    })();
  }, [program, patientPda]);

  // --- NEW: Load all hospitals for the name map ---
  useEffect(() => {
    (async () => {
      if (!program) return;
      try {
        // @ts-expect-error Node File type mismatch with Web File
        const allHospitals = await program.account.hospital.all();
        const map: Record<string, string> = {};
        for (const h of allHospitals as any[]) {
          map[h.account.authority.toBase58()] = h.account.name as string;
        }
        setHospitalMap(map);
      } catch (e) {
        console.error("Failed to load all hospitals:", e);
        // Not critical, can just fallback to pubkeys
      }
    })();
  }, [program]);

  // --- Load hospital preview (for searched hospital) (unchanged) ---
  useEffect(() => {
    (async () => {
      setHospital(null);
      if (!program || !grantee) return;
      try {
        const hospitalPda = findHospitalPda(program.programId, grantee);
        // @ts-expect-error anchor account typing
        const acc = await program.account.hospital.fetchNullable(hospitalPda);
        if (!acc) {
          setHospital(null);
          return;
        }
        setHospital({
          pubkey: hospitalPda.toBase58(),
          authority: grantee.toBase58(),
          name: acc.name as string,
          kmsRef: acc.kmsRef as string,
          createdAt: Number(acc.createdAt),
        });
      } catch {
        setHospital(null);
      }
    })();
  }, [program, grantee]);

  // --- Load GRANTS (unchanged) ---
  const loadGrants = async () => {
    setLoading(true);
    setLoadErr("");
    setCurrentPage(1); // Reset to first page on new load
    try {
      if (!program || !patientPda) {
        setGrants([]);
        setLoading(false);
        return;
      }
      const filters: anchor.web3.GetProgramAccountsFilter[] = [
        { memcmp: { offset: 8, bytes: patientPda.toBase58() } },
      ];
      if (grantee) {
        filters.push({ memcmp: { offset: 8 + 32, bytes: grantee.toBase58() } });
      }
// @ts-expect-error Node File type mismatch with Web File
      const raw = await program.account.grant.all(filters as any);
      const rows: GrantUi[] = raw.map((r: any) => ({
        pubkey: r.publicKey.toBase58(),
        scope: r.account.scope as number,
        patient: r.account.patient.toBase58(),
        grantee: r.account.grantee.toBase58(),
        createdBy: r.account.createdBy.toBase58?.() ?? r.account.createdBy,
        createdAt: Number(r.account.createdAt),
        expiresAt: r.account.expiresAt ? Number(r.account.expiresAt) : null,
        revoked: !!r.account.revoked,
        revokedAt: r.account.revokedAt ? Number(r.account.revokedAt) : null,
      }));

      rows.sort((a, b) => b.createdAt - a.createdAt);
      setGrants(rows);
    } catch (e: any) {
      setLoadErr(e?.message ?? String(e));
      setGrants([]);
    } finally {
      setLoading(false);
    }
  };

  // --- Auto-load grants (unchanged) ---
  useEffect(() => {
    void loadGrants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, patientPda?.toBase58(), grantee?.toBase58()]);

  // --- Handle filter submit (unchanged) ---
  const handleFilterSubmit = () => {
    setActiveGranteeStr(filterGranteeStr);
  };

  // --- UI state for toggles (unchanged) ---
  const current: Record<number, boolean> = useMemo(() => {
    const m: Record<number, boolean> = {};
    for (const g of grants) if (!g.revoked) m[g.scope] = true;
    return m;
  }, [grants]);

  // --- Validation (unchanged) ---
  const ensureReady = () => {
    if (!program || !wallet) throw new Error("Program/wallet not ready");
    if (!patientPk) throw new Error("Connect wallet first");
    if (!patientExists)
      throw new Error("You have not registered as a patient yet");
    if (!grantee)
      throw new Error("Invalid grantee (hospital authority) pubkey");
  };

  const assertHospitalRegistered = async () => {
    if (!grantee) throw new Error("Invalid grantee (hospital authority)");
    const hospitalPda = findHospitalPda(programId, grantee);
    // @ts-expect-error anchor typing
    const acc = await program!.account.hospital.fetchNullable(hospitalPda);
    if (!acc)
      throw new Error(
        "Hospital not registered (no Hospital account for this authority)"
      );
  };

  // --- TX functions (unchanged) ---
  const upsertOne = async (scopeByte: number) => {
    setErr("");
    setSig("");
    ensureReady();
    await assertHospitalRegistered();

    const grantPda = findGrantPda(programId, patientPda!, grantee!, scopeByte);
    const configPda = findConfigPda(programId);
    const trusteePda = findTrusteePda(programId, patientPk!, wallet!.publicKey);
    const trusteeExists = await accountExists(trusteePda);
    console.log(
      "Including trustee account:",
      trusteeExists ? trusteePda.toBase58() : "none"
    );

    // Construct and send transaction
    
  const tx = await program!.methods
    .grantAccess(scopeByte)
    .accounts({
      authority: wallet!.publicKey,
      config: configPda,
      patient: patientPda!,
      grant: grantPda,
      grantee: grantee!,
      ...(trusteeExists
        ? { trusteeAccount: trusteePda }
        : { trusteeAccount: null as any }), // 👈 suppress TS type error only
      systemProgram: SystemProgram.programId,
    })
    .rpc();


    setSig(tx);
  };

  const revokeOne = async (scopeByte: number) => {
    setErr("");
    setSig("");
    ensureReady();
    await assertHospitalRegistered();

    const grantPda = findGrantPda(programId, patientPda!, grantee!, scopeByte);

    const tx = await program!.methods
      .revokeGrant()
      .accounts({
        patient: patientPda!,
        grant: grantPda,
        grantee: grantee!,
        authority: wallet!.publicKey,
      })
      .rpc();

    setSig(tx);
  };

  // --- Revoke all (User commented out) ---
  // const revokeAll = async () => { ... };

  const canAct = !!program && !!patientPk && patientExists !== false;

  // --- Pagination Logic ---
  const totalPages = Math.ceil(grants.length / GRANTS_PER_PAGE);
  const paginatedGrants = grants.slice(
    (currentPage - 1) * GRANTS_PER_PAGE,
    currentPage * GRANTS_PER_PAGE
  );

  const goToNextPage = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setCurrentPage((p) => Math.min(p + 1, totalPages));
  };
  const goToPrevPage = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setCurrentPage((p) => Math.max(p - 1, 1));
  };
  const goToPage = (
    e: React.MouseEvent<HTMLAnchorElement>,
    pageNum: number
  ) => {
    e.preventDefault();
    setCurrentPage(pageNum);
  };

  // --- Helper to get scope text ---
  const getScopeText = (scope: number) => {
    if (scope === 1) return "Read";
    if (scope === 2) return "Write";
    return `Unknown (${scope})`;
  };

  // --- JSX (No Cards) ---
  return (
    <main className="mx-auto my-5">
      <header className="font-architekt p-2 border rounded-xs">
        <div className="flex font-bold gap-x-2 items-center">
          <Search size={20} /> Search for Hospitals
        </div>
      </header>

      <div className="flex w-full items-center space-x-2 mt-2">
        <Input
          type="text"
          placeholder="grantee (hospital authority pubkey)"
          className="font-mono"
          value={filterGranteeStr}
          onChange={(e) => setFilterGranteeStr(e.target.value)}
          disabled={!canAct}
        />
        <Button
          type="button"
          size="icon"
          onClick={handleFilterSubmit}
          disabled={!canAct}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {/* Patient registration status */}
      {patientExists === false && (
        <Alert variant="destructive">
          <AlertTitle>Patient Record Not Found</AlertTitle>
          <AlertDescription>
            You haven&apos;t registered as a patient yet. Go to{" "}
            <b>Patients (Upsert)</b> and create your patient record first.
          </AlertDescription>
        </Alert>
      )}

      {/* Grantee Selection Section */}
      {hospital && (
        <section className="border roudned-xs p-6 space-y-6 bg-card mt-5">
          <main className="space-y-6">
            {/* Hospital Verification Card */}
            <div className="border roudned-xs p-5 bg-card">
              <div className="flex items-start gap-4">
                <div className="p-2 roudned-xs bg-secondary flex items-center justify-center">
                  <BookCheck className="w-5 h-5 text-secondary-foreground" />
                </div>

                <div className="flex-1 space-y-2">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      Hospital Verified
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Authority confirmed and active
                    </p>
                  </div>

                  <div className="grid gap-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground/70">Name</span>
                      <span className="text-foreground font-medium">
                        {hospital.name}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground/70">
                        Authority
                      </span>
                      <span className="font-mono break-all text-muted-foreground text-right">
                        {hospital.authority}
                      </span>
                    </div>
                    <div className="flex justify-between items-start">
                      <span className="text-muted-foreground/70">
                        Hospital PDA
                      </span>
                      <span className="font-mono break-all text-muted-foreground text-right">
                        {hospital.pubkey}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Manage Access Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text font-semibold text-foreground">
                  Manage Access
                </h2>
                <p className="text-xs text-muted-foreground">
                  Direct permission actions for this hospital.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                {/* === Grant Write Button === */}
                <Button
                  onClick={async () => {
                    try {
                      // If only READ active → revoke read, grant write
                      if (current[1] && !current[2]) {
                        await revokeOne(1);
                        await upsertOne(2);
                      } else if (!current[2] && !current[1]) {
                        // If neither active → just grant write
                        await upsertOne(2);
                      }
                      await loadGrants();
                    } catch (e: any) {
                      setErr(e?.message ?? String(e));
                    }
                  }}
                  disabled={
                    !canAct ||
                    !grantee ||
                    (current[1] && current[2]) || // both active
                    (current[2] && !current[1]) // already write only
                  }
                  variant={
                    (current[1] && !current[2]) || (!current[1] && !current[2])
                      ? "default"
                      : "outline"
                  }
                >
                  {current[1] && !current[2]
                    ? "Revoke Read → Grant Write"
                    : current[2] && !current[1]
                    ? "Write Granted"
                    : current[1] && current[2]
                    ? "All Active"
                    : "Grant Write"}
                </Button>

                {/* === Grant Read Button === */}
                <Button
                  onClick={async () => {
                    try {
                      // If only WRITE active → revoke write, grant read
                      if (current[2] && !current[1]) {
                        await revokeOne(2);
                        await upsertOne(1);
                      } else if (!current[1] && !current[2]) {
                        // If neither active → just grant read
                        await upsertOne(1);
                      }
                      await loadGrants();
                    } catch (e: any) {
                      setErr(e?.message ?? String(e));
                    }
                  }}
                  disabled={
                    !canAct ||
                    !grantee ||
                    (current[1] && current[2]) || // both active
                    (current[1] && !current[2]) // already read only
                  }
                  variant={
                    (current[2] && !current[1]) || (!current[1] && !current[2])
                      ? "default"
                      : "outline"
                  }
                >
                  {current[2] && !current[1]
                    ? "Revoke Write → Grant Read"
                    : current[1] && !current[2]
                    ? "Read Granted"
                    : current[1] && current[2]
                    ? "All Active"
                    : "Grant Read"}
                </Button>

                {/* === Revoke All Button === */}
                <Button
                  onClick={async () => {
                    try {
                      if (current[1]) await revokeOne(1);
                      if (current[2]) await revokeOne(2);
                      await loadGrants();
                    } catch (e: any) {
                      setErr(e?.message ?? String(e));
                    }
                  }}
                  disabled={!canAct || !grantee || (!current[1] && !current[2])}
                  variant="destructive"
                >
                  Revoke All
                </Button>

                {/* === Grant All Button === */}
                <Button
                  onClick={async () => {
                    try {
                      // If neither active → grant both
                      if (!current[1] && !current[2]) {
                        await upsertOne(1);
                        await upsertOne(2);
                      }
                      // If one active → grant missing one
                      else if (current[1] && !current[2]) {
                        await upsertOne(2);
                      } else if (!current[1] && current[2]) {
                        await upsertOne(1);
                      }
                      await loadGrants();
                    } catch (e: any) {
                      setErr(e?.message ?? String(e));
                    }
                  }}
                  disabled={!canAct || !grantee || (current[1] && current[2])}
                  variant={
                    (!current[1] && !current[2]) || current[1] !== current[2]
                      ? "default"
                      : "outline"
                  }
                >
                  {current[1] && current[2]
                    ? "All Granted"
                    : !current[1] && !current[2]
                    ? "Grant All"
                    : "Grant Remaining"}
                </Button>
              </div>
            </div>
          </main>
          {/* Transaction Status */}
          {sig && (
            <StatusBanner type="success">
              ✅ Transaction confirmed: {""}
              {sig}
            </StatusBanner>
          )}

          {err && <StatusBanner type="error">❌ {err}</StatusBanner>}
        </section>
      )}

      {/* Grants List Section */}
      <section className="space-y-4 mt-5">
        <h2 className="text font-semibold">Current Grants</h2>
        <p className="text-sm text-muted-foreground">
          {grantee
            ? "Grants for the selected hospital."
            : "All grants for your patient record."}
        </p>

        {loadErr && (
          <Alert variant="destructive">
            <AlertDescription>{loadErr}</AlertDescription>
          </Alert>
        )}
        {loading && (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2">Loading grants...</span>
          </div>
        )}

        {/* Grant List - Collapsible */}
        {!loading && paginatedGrants.length > 0 && (
          <div className="flex flex-col gap-y-3">
            {paginatedGrants.map((g) => (
              <Collapsible key={g.pubkey} className="border p-4 roudned-xs">
                <CollapsibleTrigger className="w-full flex justify-between text-left items-center gap-4 hover:cursor-pointer">
                  <div className="flex-1 min-w-0">
                    {/* --- UPDATED --- */}
                    <div className="font-semibold truncate text-sm">
                      {/* Show hospital name from map, or fallback to grantee pubkey */}
                      {hospitalMap[g.grantee] ?? g.grantee}
                    </div>
                    <div className="text-sm text-muted-foreground space-x-2">
                      <span>{getScopeText(g.scope)}</span>
                      <span>&bull;</span>
                      <span
                        className={
                          g.revoked ? "text-red-600" : "text-green-600"
                        }
                      >
                        {g.revoked ? "Revoked" : "Active"}
                      </span>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground text-right whitespace-nowrap">
                    {new Date(g.createdAt * 1000).toLocaleDateString()}
                  </div>
                  <ChevronsUpDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </CollapsibleTrigger>

                <CollapsibleContent className="mt-4 pt-4 border-t space-y-3">
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div>
                      <div className="font-semibold uppercase text-[10px]">
                        Hospital Pubkey (Grantee)
                      </div>
                      <div className="flex gap-x-2">
                        <div className="font-mono roudned-xs border bg-muted p-2 break-all text-foreground flex-1">
                          {g.grantee}
                        </div>
                        {/* Copy button */}
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="hover:cursor-pointer"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(g.grantee);
                              toast.success(
                                `Copied Hospital Pubkey: ${g.grantee}`
                              );
                            } catch {
                              console.error("Clipboard copy failed");
                            }
                          }}
                        >
                          <ClipboardCopyIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          className="hover:cursor-pointer"
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            setFilterGranteeStr(g.grantee);
                            setActiveGranteeStr(g.grantee);
                          }}
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div>
                      <div className="font-semibold uppercase text-[10px]">
                        Grant PDA (TX)
                      </div>
                      <div className="font-mono roudned-xs border bg-muted p-2 break-all text-foreground">
                        {g.pubkey}
                      </div>
                    </div>

                    <div>
                      <div className="font-semibold uppercase text-[10px]">
                        Created By
                      </div>
                      <div className="font-mono roudned-xs border bg-muted p-2 break-all text-foreground">
                        {g.createdBy}
                      </div>
                    </div>
                  </div>

                  {/* Revoke button (only shows if a grantee is selected) */}
                  {!g.revoked && grantee && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={async () => {
                        try {
                          await revokeOne(g.scope);
                          await loadGrants();
                        } catch (e: any) {
                          setErr(e?.message ?? String(e));
                        }
                      }}
                    >
                      Revoke this grant
                    </Button>
                  )}
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        )}

        {/* No grants found */}
        {!loading && grants.length === 0 && (
          <p className="text-sm text-muted-foreground pt-4">No grants found.</p>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <Pagination className="pt-4">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={goToPrevPage}
                  aria-disabled={currentPage === 1}
                  className={
                    currentPage === 1 ? "pointer-events-none opacity-50" : ""
                  }
                />
              </PaginationItem>

              {Array.from({ length: totalPages }).map((_, i) => (
                <PaginationItem key={i}>
                  <PaginationLink
                    href="#"
                    isActive={currentPage === i + 1}
                    onClick={(e) => goToPage(e, i + 1)}
                  >
                    {i + 1}
                  </PaginationLink>
                </PaginationItem>
              ))}

              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={goToNextPage}
                  aria-disabled={currentPage === totalPages}
                  className={
                    currentPage === totalPages
                      ? "pointer-events-none opacity-50"
                      : ""
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </section>
    </main>
  );
}
