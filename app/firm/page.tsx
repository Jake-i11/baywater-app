import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  getCoachContext,
  isGlobalAdminUser,
  listAdminOrganizations,
} from '@/lib/firm/context';
import type { FirmAdminOrgSummary, FirmCoachOrgSummary } from '@/lib/firm/types';

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{title}</h1>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

/** Global admin: every firm, each linking to its coach management page. */
function AdminFirms({ organizations }: { organizations: FirmAdminOrgSummary[] }) {
  return (
    <Shell title="Manage firms (global admin)">
      <p className="text-sm text-gray-500">
        You are the Baywater global admin. Select a firm to manage its coaches.
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

/** Coach: the firms this user coaches. */
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
      {organizations.length === 0 && (
        <Link
          href="/firm/new"
          className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Create New Organization
        </Link>
      )}
    </Shell>
  );
}

async function FirmDirectory() {
  const result = await getCoachContext();

  if (!result.ok) {
    // Not a coach anywhere — only the global admin may still see a directory.
    const admin = await isGlobalAdminUser();
    if (!admin) {
      redirect('/login');
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

  return <CoachFirms organizations={context.organizations} />;
}

export default async function OrganizationsPage() {
  return <FirmDirectory />;
}
