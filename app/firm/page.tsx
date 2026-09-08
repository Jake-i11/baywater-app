import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCoachContext } from '@/lib/firm/context';

async function OrganizationsList() {
  const result = await getCoachContext();
if (!result.ok) {
  redirect('/login');
}
const { context } = result;
  
  if (!result.ok) {
    redirect('/login');
  }
  
  if (context.organizations.length === 0) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Your Organizations</h1>
        <p className="mb-4">You're not part of any firm yet.</p>
        <Link
          href="/firm/new"
          className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Create New Organization
        </Link>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Your Organizations</h1>
      <div className="space-y-4">
        {context.organizations.map((org) => (
          <Link
            key={org.organization_id}
            href={`/firm/${org.organization_id}`}
            className="block p-4 border rounded-md hover:bg-gray-50"
          >
            <h2 className="text-lg font-medium">{org.organization_name}</h2>
            <p className="text-sm text-gray-500">Joined: {new Date(org.joined_at).toLocaleDateString()}</p>
          </Link>
        ))}
        <Link
          href="/firm/new"
          className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Create New Organization
        </Link>
      </div>
    </div>
  );
}

export default async function OrganizationsPage() {
  return <OrganizationsList />;
}
