import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";

export default function Page() {
  return (
    <main className="flex min-h-screen justify-center items-center flex-col max-w-xl min-w-xl mx-auto">
      <h1 className="text-4xl font-architekt font-bold">
        BE APART OF CARECHAIN
      </h1>
      <div className="flex w-full gap-x-5 mt-10">
        <Button
          className="flex-1"
          variant={"outline"}
          onClick={redirect("/user/overview")}
        >
          BECOME A USER
        </Button>
        <Button
          className="flex-1"
          variant={"outline"}
          onClick={redirect("/auth/admin")}
        >
          REGISTER YOUR HOSPITAL
        </Button>
      </div>
    </main>
  );
}
