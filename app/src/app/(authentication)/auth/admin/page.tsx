/* eslint-disable react/jsx-no-comment-textnodes */
"use client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { AdminLoginPassword } from "@/action/AdminLogin";
import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";

export default function Page() {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      setLoading(true);
      await AdminLoginPassword(formData);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error);
      }
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center font-architekt">
      <form onSubmit={handleSubmit} className="min-w-md max-w-md font-bold">
        <div className="p-5 border text-xl">// ADMIN LOGIN</div>
        <div className="flex flex-col gap-y-5 p-5 border-b border-l border-r">
          <div>
            <Label htmlFor="email" className="mb-2 font-bold">
              EMAIL ADDRESS
            </Label>
            <Input
              name="email"
              type="email"
              id="email"
              className="font-inter font-normal"
            />
          </div>
          <div>
            <Label htmlFor="password" className="mb-2 font-bold">
              Password
            </Label>
            <Input
              name="password"
              type="password"
              id="password"
              className="font-inter font-normal"
            />
          </div>
          <div className="flex flex-col gap-y-5">
            {/* <Button variant={"outline"} className="font-bold">
              Passwordless Login
            </Button> */}
            <Button
              className={`font-bold`}
              type="submit"
              disabled={loading}
              variant={"outline"}
            >
              {loading ? (
                <>
                  <Spinner />
                  Logging in...
                </>
              ) : (
                <>Login</>
              )}
            </Button>
          </div>
          <div className="font-inter text-sm text-muted-foreground font-normal">
            Want to become apart of CareChain?{" "}
            <Link href={"#"} className="text-white font-bold">
              Register.
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
