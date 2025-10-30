"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { VerifyAdmin } from "./VerifyAdmin";
import { GetCurrentUser } from "./GetUser";
import { revalidatePath } from "next/cache";

// ─── Fetch hospital data for logged-in admin ───
export async function GetHospitalData() {
  const user = await GetCurrentUser();
  const admin = await VerifyAdmin(user.id);

  const supabase = await createServerClient();
  const { data: hospitalInfo, error } = await supabase
    .from("hospital_org")
    .select("*")
    .eq("hospital_id", admin.hospital_id)
    .maybeSingle();

  if (error) throw error;
  if (!hospitalInfo) throw new Error("Hospital not found");

  return hospitalInfo;
}

// ─── Update hospital address ───
export async function updateAddress(formData: FormData) {
  const hospital_id = formData.get("hospital_id") as string;
  const hospital_address = formData.get("hospital_address") as string;

  if (!hospital_id || !hospital_address) throw new Error("Missing form data");

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("hospital_org")
    .update({ address: hospital_address })
    .eq("hospital_id", hospital_id);

  if (error) throw error;

  // Force revalidation of the page to reflect updated data
  revalidatePath("/hospital/info");
}
