"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, Globe, Mail, LineChart, LogOut, Bug } from "lucide-react";
import { AdminLogout } from "@/action/AdminLogout";
import { Button } from "@/components/ui/button";

interface SidebarItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
}

interface AppSidebarProps {
  dynamicItems: SidebarItem[];
  isAdmin?: boolean;
}

export default function AppSidebar({
  dynamicItems,
  isAdmin = false,
}: AppSidebarProps) {
  const pathname = usePathname();
  const prefix = isAdmin ? "/hospital" : "";

  const fixedMain: SidebarItem[] = [
    ...(isAdmin
      ? [
          {
            label: "Settings",
            href: "/settings",
            icon: <Settings className="w-4 h-4" />,
          },
        ]
      : []),
    {
      label: "Support",
      href: "/support",
      icon: <Mail className="w-4 h-4" />,
    },
    {
      label: "Analytics",
      href: "/analytics",
      icon: <LineChart className="w-4 h-4" />,
    },
    {
      label: "Website",
      href: "/website",
      icon: <Globe className="w-4 h-4" />,
    },
  ];

  const fixedBottom: SidebarItem[] = [
    {
      label: "Bug Report",
      href: "/bug-report",
      icon: <Bug className="w-4 h-4" />,
    },
  ];

  const isActive = (href: string) => pathname === `${prefix}${href}`;

  return (
    <aside className="sticky top-[6rem] flex h-[calc(100vh-6rem)] flex-col justify-between py-5 text-sm">
      {/* ==================== Dynamic Section ==================== */}
      <div className="flex flex-col">
        {dynamicItems.map((item, index) => {
          const active = isActive(item.href);
          return (
            <Link key={`dynamic-${index}`} href={`${prefix}${item.href}`}>
              <Button
                variant="ghost"
                className={`
                  w-full justify-start gap-x-2 px-4 text-muted-foreground
                  ${
                    active
                      ? "text-primary font-medium bg-card dark:text-sidebar-accent-foreground "
                      : "hover:text-foreground dark:hover:text-white"
                  }
                `}
              >
                {item.icon}
                {item.label}
              </Button>
            </Link>
          );
        })}
      </div>

      {/* ==================== Fixed Section ==================== */}
      <div className="flex flex-col gap-y-20">
        {/* --- Main fixed items --- */}
        <div className="flex flex-col gap-y-10">
          <div className="flex flex-col">
            {fixedMain.map((item, index) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={`fixed-main-${index}`}
                  href={`${prefix}${item.href}`}
                >
                  <Button
                    variant="ghost"
                    className={`
                      w-full justify-start gap-x-2 px-4 text-muted-foreground
                      ${
                        active
                          ? "text-primary font-medium bg-card  dark:text-sidebar-accent-foreground"
                          : "hover:text-foreground dark:hover:text-white"
                      }
                    `}
                  >
                    {item.icon}
                    {item.label}
                  </Button>
                </Link>
              );
            })}

            {/* Logout (admin only) */}
            {isAdmin && (
              <form action={AdminLogout}>
                <Button
                  type="submit"
                  variant="ghost"
                  className="w-full justify-start gap-x-2 px-4 text-muted-foreground hover:text-foreground dark:hover:text-white"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </Button>
              </form>
            )}
          </div>

          {/* --- Bottom section --- */}
          <div className="flex flex-col gap-y-2">
            {fixedBottom.map((item, index) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={`fixed-bottom-${index}`}
                  href={`${prefix}${item.href}`}
                >
                  <Button
                    variant="ghost"
                    className={`
                      w-full justify-start gap-x-2 px-4 text-muted-foreground
                      ${
                        active
                          ? "text-primary font-medium bg-card  dark:text-sidebar-accent-foreground"
                          : "hover:text-foreground dark:hover:text-white"
                      }
                    `}
                  >
                    {item.icon}
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="text-xs px-4 py-1.5 text-muted-foreground">
          2025 CareChain - Org
        </div>
      </div>
    </aside>
  );
}
