import { BillingGuard } from "@/components/BillingGuard";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <BillingGuard>{children}</BillingGuard>;
}
