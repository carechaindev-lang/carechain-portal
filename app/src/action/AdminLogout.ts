"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function AdminLogout() {
  const supabase = await createServerClient();

  // Sign out from Supabase
  await supabase.auth.signOut();

  // Redirect to admin login
  redirect("/auth/admin");
}
