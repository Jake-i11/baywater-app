import { notFound, redirect } from "next/navigation";
import { getOrgAccessContext } from "@/lib/firm/context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Server-side authorization for every nested firm route.
 *
 * The requested `orgId` is validated against the authenticated caller BEFORE
 * any firm page renders: an active coach membership of that exact firm, or the
 * global admin. Client components never receive the route otherwise, so page
 * authorization does not depend on client-side hiding.
 */
export default async function FirmOrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const access = await getOrgAccessContext(orgId);

  if (!access.ok) {
    if (access.status === 401) {
      redirect(`/login?next=${encodeURIComponent(`/firm/${orgId}`)}`);
    }
    notFound();
  }

  return <>{children}</>;
}
