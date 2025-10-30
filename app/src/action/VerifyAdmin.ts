"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";

export async function VerifyAdmin(userId: string) {
  const supabaseServer = await createServerClient();

  const { data: adminRow, error: adminErr } = await supabaseServer
    .from("admin")
    .select("*")
    .eq("admin_id", userId)
    .maybeSingle();

  if (adminErr) {
    throw adminErr;
  }

  if (!adminRow) {
    if (!adminRow) throw new Error("User is not a verified admin");
  }

  return adminRow;
}
