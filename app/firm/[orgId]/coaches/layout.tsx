import { notFound, redirect } from "next/navigation";
import { getGlobalAdminContext } from "@/lib/firm/context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Coach management is GLOBAL-ADMIN-ONLY.
 *
 * This nested layout re-checks the stricter requirement server-side, so even a
 * coach of this firm cannot reach the page (it 404s) — the API and the
 * firm_coach_list RPC enforce the same rule independently.
 */
export default async function FirmCoachesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const admin = await getGlobalAdminContext(orgId);

  if (!admin.ok) {
    if (admin.status === 401) {
      redirect(`/login?next=${encodeURIComponent(`/firm/${orgId}/coaches`)}`);
    }
    notFound();
  }

  return <>{children}</>;
}
