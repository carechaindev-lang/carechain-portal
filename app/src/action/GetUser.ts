"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";

export async function GetCurrentUser() {
  const supabaseServer = await createServerClient();

  const {
    data: { user },
  } = await supabaseServer.auth.getUser();

  if (!user) {
    if (!user) throw new Error("No authenticated user found");
  }

  return user;
}
