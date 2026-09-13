import { redirect } from 'next/navigation';
import { firmCreateOrganization } from '@/lib/firm/rpc';
import { getCoachContext } from '@/lib/firm/context';

async function createOrganization(formData: FormData): Promise<void> {
  'use server'
  
  const name = formData.get('name') as string;
  
  if (!name || name.trim() === '') {
    throw new Error('Organization name is required');
  }
  
  const result = await firmCreateOrganization(name);
  
  if (result.error) {
    throw new Error(result.error.message);
  }
  
  redirect(`/firm/${result.data.id}`);
}

export default async function NewOrganizationPage() {
  const result = await getCoachContext();
  
  if (!result.ok) {
    redirect('/login');
  }
  
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Create New Organization</h1>
      <form action={createOrganization} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">
            Organization Name
          </label>
          <input
            type="text"
            id="name"
            name="name"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>
        <button
          type="submit"
          className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Create Organization
        </button>
      </form>
    </div>
  );
}