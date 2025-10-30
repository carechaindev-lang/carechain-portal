"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { VerifyAdmin } from "./VerifyAdmin";
import { redirect } from "next/navigation";

export async function AdminLoginPassword(formData: FormData) {
  // 1. Get email and password
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    throw new Error("Missing email or password");
  }

  // 2. Create Supabase client
  const supabaseServer = await createServerClient();

  // 3. Sign in user
  const { data, error } = await supabaseServer.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    throw new Error(error?.message || "Invalid credentials");
  }

  // 4. Verify admin
  const admin = await VerifyAdmin(data.user.id);

  // 5. If not admin, sign out and throw
  if (!admin) {
    await supabaseServer.auth.signOut();
    throw new Error("You are not an admin");
  }

  // 6. Return admin info + redirects
  redirect("/hospital/overview");
}

export async function AdminLoginPasswordless() {}
