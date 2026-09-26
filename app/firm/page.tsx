import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  getCoachContext,
  getStudentOrganizations,
  isActiveStudentAnywhere,
  isGlobalAdminUser,
  listAdminOrganizations,
} from '@/lib/firm/context';
import type { FirmAdminOrgSummary, FirmCoachOrgSummary } from '@/lib/firm/types';
import type { FirmStudentOrgSummary } from '@/lib/firm/context';
import { ModeToggle } from '@/components/ModeToggle';

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="container mx-auto p-4">
      {/* Firm side of the Trader ⇄ Firm switch, so this page links back to the
          trader home page as well as being reachable from it. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{title}</h1>
        <ModeToggle theme="light" />
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

/** Global admin: every firm, each linking to its coach management page. */
function AdminFirms({ organizations }: { organizations: FirmAdminOrgSummary[] }) {
  return (
    <Shell title="Manage firms (global admin)">
      <p className="text-sm text-gray-500">
        You are the Precept Solutions global admin. Select a firm to manage its coaches.
      </p>
      {organizations.length === 0 ? (
        <p className="text-sm text-gray-500">No firms exist yet.</p>
      ) : (
        organizations.map((org) => (
          <Link
            key={org.organization_id}
            href={`/firm/${org.organization_id}/coaches`}
            className="block p-4 border rounded-md hover:bg-gray-50"
          >
            <h2 className="text-lg font-medium">{org.organization_name}</h2>
            <p className="text-sm text-gray-500">
              Manage coaches · Created {new Date(org.created_at).toLocaleDateString()}
            </p>
          </Link>
        ))
      )}
    </Shell>
  );
}

/** Coach: the firms this user coaches. Coaches may always create a firm here. */
function CoachFirms({ organizations }: { organizations: FirmCoachOrgSummary[] }) {
  return (
    <Shell title="Your Organizations">
      {organizations.length === 0 ? (
        <p className="mb-4">You&apos;re not part of any firm yet.</p>
      ) : (
        organizations.map((org) => (
          <Link
            key={org.organization_id}
            href={`/firm/${org.organization_id}`}
            className="block p-4 border rounded-md hover:bg-gray-50"
          >
            <h2 className="text-lg font-medium">{org.organization_name}</h2>
            <p className="text-sm text-gray-500">
              Joined: {new Date(org.joined_at).toLocaleDateString()}
            </p>
          </Link>
        ))
      )}
      <Link
        href="/firm/new"
        className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        Create New Firm
      </Link>
    </Shell>
  );
}

/**
 * Student: ONLY the firms they have joined via accepted invitations.
 * The list comes from the server (RLS-scoped); no create affordance exists
 * for students anywhere on this page, and the creation RPC rejects them
 * server-side regardless.
 */
function StudentFirms({ organizations }: { organizations: FirmStudentOrgSummary[] }) {
  return (
    <Shell title="Your Firms">
      {organizations.length === 0 ? (
        <p className="text-sm text-gray-500">You haven&apos;t joined any firms yet.</p>
      ) : (
        organizations.map((org) => (
          <Link
            key={org.organization_id}
            href={`/firm/${org.organization_id}`}
            className="block p-4 border rounded-md hover:bg-gray-50"
          >
            <h2 className="text-lg font-medium">{org.organization_name}</h2>
            <p className="text-sm text-gray-500">
              Joined: {new Date(org.joined_at).toLocaleDateString()}
            </p>
          </Link>
        ))
      )}
    </Shell>
  );
}

async function FirmDirectory() {
  const result = await getCoachContext();

  if (!result.ok) {
    // Not a coach anywhere (no orgId here, so this is effectively 401) —
    // only the global admin may still see a directory.
    const admin = await isGlobalAdminUser();
    if (!admin) {
      // Preserve the destination so "Firm" from the home page returns here
      // after signing in (same convention as app/firm/[orgId]/layout.tsx).
      redirect(`/login?next=${encodeURIComponent('/firm')}`);
    }
    return <AdminFirms organizations={await listAdminOrganizations()} />;
  }

  const { context } = result;

  if (context.is_global_admin) {
    return (
      <>
        <AdminFirms organizations={await listAdminOrganizations()} />
        {context.organizations.length > 0 && (
          <CoachFirms organizations={context.organizations} />
        )}
      </>
    );
  }

  // Authenticated non-admin with zero ACTIVE coach memberships: this is where
  // students land (they were previously indistinguishable from brand-new
  // coaches here). Students see ONLY firms joined via accepted invitations —
  // never a create affordance. Truly unaffiliated users keep the legacy
  // coach path (creating a firm is what makes a coach).
  if (context.organizations.length === 0) {
    const studentOrganizations = await getStudentOrganizations();
    if (studentOrganizations.length > 0 || (await isActiveStudentAnywhere())) {
      return <StudentFirms organizations={studentOrganizations} />;
    }
  }

  return <CoachFirms organizations={context.organizations} />;
}

export default async function OrganizationsPage() {
  return <FirmDirectory />;
}
