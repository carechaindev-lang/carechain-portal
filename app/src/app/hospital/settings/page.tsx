import { GetHospitalData, updateAddress } from "@/action/GetHospitalData";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default async function Page() {
  // ─── Fetch hospital data directly on the server ───
  const hospitalData = await GetHospitalData();

  return (
    <main className="my-5 space-y-6">
      <header>
        <h1 className="text-2xl font-bold font-architekt">
          Hospital Information
        </h1>
        <p className="text-sm text-muted-foreground">
          Only the hospital address can be updated. Other details are immutable.
        </p>
      </header>

      {/* ─── Server Action Form ─── */}
      <form action={updateAddress} className="flex flex-col gap-y-5">
        <input
          type="hidden"
          name="hospital_id"
          value={hospitalData.hospital_id}
        />

        {/* ─── Read-only Fields ─── */}
        <div>
          <label className="text-sm font-medium">Hospital ID</label>
          <Input value={hospitalData.hospital_id} disabled />
        </div>

        <div>
          <label className="text-sm font-medium">Hospital Name</label>
          <Input value={hospitalData.name ?? ""} disabled />
        </div>

        {/* ─── Editable Address ─── */}
        <div>
          <label className="text-sm font-medium">Hospital Address</label>
          <Input
            name="hospital_address"
            defaultValue={hospitalData.address ?? ""}
            required
          />
        </div>

        <div>
          <label className="text-sm font-medium">Authority Pubkey</label>
          <Input value={hospitalData.authority_pubkey ?? ""} disabled />
        </div>

        <div>
          <label className="text-sm font-medium">Verified TX Signature</label>
          <Input value={hospitalData.verified_tx_sig ?? ""} disabled />
        </div>

        <div>
          <label className="text-sm font-medium">Created At</label>
          <Input
            value={
              hospitalData.created_at
                ? new Date(hospitalData.created_at).toLocaleString()
                : "—"
            }
            disabled
          />
        </div>

        <Button type="submit" className="w-full mt-2" variant="outline">
          Save Changes
        </Button>
      </form>
    </main>
  );
}
