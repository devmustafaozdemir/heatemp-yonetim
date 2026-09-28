import { Eye } from "lucide-react";
import { cookies } from "next/headers";
import { AppShell, SIDEBAR_COOKIE } from "@/components/shell/AppShell";
import { UserMenu } from "@/components/shell/UserMenu";
import { FxBadge } from "@/components/FxBadge";
import { Toaster } from "@/components/Toaster";
import { requireMember } from "@/lib/auth";
import { ensureFreshFx } from "@/lib/fx/service";
import { signOut } from "@/app/giris/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireMember();
  const [fx, cookieStore] = await Promise.all([ensureFreshFx(ctx), cookies()]);
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "dar";

  return (
    <>
      <AppShell
        initialCollapsed={collapsed}
        notice={
          ctx.role === "viewer" ? (
            <span className="hidden items-center gap-1.5 rounded-md bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 md:inline-flex">
              <Eye className="size-3.5" aria-hidden />
              Salt okunur erişim — kayıt ekleyemez veya değiştiremezsiniz
            </span>
          ) : null
        }
        topbarEnd={
          <>
            <FxBadge suggestion={fx.suggestion} warning={fx.warning} />
            <UserMenu email={ctx.email} role={ctx.role} signOut={signOut} />
          </>
        }
      >
        {children}
      </AppShell>
      <Toaster />
    </>
  );
}
