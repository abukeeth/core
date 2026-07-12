import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { serverFetch } from "@/lib/server-api";

export default async function SetupLayout({ children }: { children: ReactNode }) {
  const result = await serverFetch<{ user: unknown }>("/api/auth/me");
  if (!result.ok) {
    redirect("/login");
  }
  return <>{children}</>;
}
