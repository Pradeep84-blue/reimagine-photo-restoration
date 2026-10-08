import { Aperture, LogOut } from "lucide-react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

type ActivePage = "studio" | "library" | "account";

export default function AppHeader({ active }: { active: ActivePage }) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: user } = trpc.auth.me.useQuery();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      await utils.library.list.invalidate();
      setLocation("/login");
    },
  });

  return (
    <header className="topbar">
      <Link className="brand" href="/" aria-label="Reimagine home">
        <span className="brand-symbol" aria-hidden="true">
          <Aperture size={23} strokeWidth={1.7} />
          <i />
        </span>
        <span className="brand-name">
          re<span>imagine</span>
        </span>
      </Link>
      <nav className="top-nav" aria-label="Account navigation">
        <Link
          className={`nav-link ${active === "studio" ? "active" : ""}`}
          href="/"
        >
          Studio
        </Link>
        <Link
          className={`nav-link ${active === "library" ? "active" : ""}`}
          href="/library"
        >
          History
        </Link>
        <Link
          className={`nav-link ${active === "account" ? "active" : ""}`}
          href="/account"
        >
          Account
        </Link>
        <button
          className="nav-link logout-link"
          type="button"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
          aria-label="Sign out"
          title={user?.email ? `Sign out ${user.email}` : "Sign out"}
        >
          <LogOut size={15} />
        </button>
      </nav>
      <div className="top-note" title={user?.email ?? "Signed in"}>
        {user?.email ?? "Your private studio"}
      </div>
    </header>
  );
}
