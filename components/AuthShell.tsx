import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

/**
 * Shared visual shell for the auth pages (login, forgot password, reset
 * password). Renders the dark glassmorphism background, ambient orbs, and
 * the Baywater brand header, then renders the page's card as children.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#05070d] text-white">
      {/* orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 left-[8%] h-[500px] w-[500px] rounded-full bg-blue-500 opacity-20 blur-[120px]" />
        <div className="absolute -bottom-48 right-[8%] h-[500px] w-[500px] rounded-full bg-purple-500 opacity-20 blur-[140px]" />
        <div className="absolute top-[28%] left-[42%] h-[400px] w-[400px] rounded-full bg-cyan-500 opacity-10 blur-[160px]" />
      </div>

      <div className="w-full max-w-sm px-6">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-white/50">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
