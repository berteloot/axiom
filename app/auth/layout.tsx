import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Asset Organizer",
  openGraph: {
    title: "Asset Organizer",
    siteName: "Asset Organizer",
  },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
