import Navbar from "@/components/navbar";
import AppSidebar from "@/components/app-sidebar";
import { Building2, FileText, Users } from "lucide-react";

const SIDEBAR_ITEMS = [
  {
    label: "Overview",
    href: "/overview",
    icon: <Building2 className="w-4 h-4" />,
  },
  {
    label: "Record intake",
    href: "/record-intake",
    icon: <FileText className="w-4 h-4" />,
  },
  { label: "Patients", href: "/patients", icon: <Users className="w-4 h-4" /> },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main>
      <Navbar />
      <div className="grid grid-cols-12 min-w-[1400px] max-w-[1400px] mx-auto gap-x-5">
        <div className="sticky top-[6rem] h-[calc(100vh_-_6rem)] max-h-screen col-span-3">
          <AppSidebar dynamicItems={SIDEBAR_ITEMS} isAdmin={true} />
        </div>

        <div className="col-span-8">{children}</div>
        <div className="sticky top-[4rem] h-fit col-span-1"></div>
      </div>
    </main>
  );
}
