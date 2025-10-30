import ClientLayout from "./client-layout";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main>
      <ClientLayout>{children}</ClientLayout>
    </main>
  );
}
