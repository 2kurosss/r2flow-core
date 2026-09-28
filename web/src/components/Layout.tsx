import { Link, NavLink } from "react-router-dom";
import { useState } from "react";
import {
  Bot,
  Cpu,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Menu,
  Play,
  Timer,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type NavItem = { to: string; label: string; icon: typeof Play };

const items: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/runs", label: "Runs", icon: Play },
  { to: "/triggers", label: "Triggers", icon: Timer },
  { to: "/workers", label: "Workers", icon: Cpu },
  { to: "/assets", label: "Assets", icon: KeyRound },
  { to: "/queues", label: "Queues", icon: Inbox },
];

function linkClass({ isActive }: { isActive: boolean }) {
  return cn(
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
    isActive
      ? "bg-secondary text-foreground"
      : "text-foreground/75 hover:bg-muted hover:text-foreground",
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-md md:hidden">
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Bot className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-bold tracking-tight">
            R2Flow <span className="text-primary">Core</span>
          </span>
        </Link>
      </header>

      {/* Overlay for mobile drawer */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-background transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
          "md:translate-x-0",
        )}
      >
        <div className="flex items-center gap-2.5 px-4 pt-5">
          <Link
            to="/"
            className="flex flex-1 items-center gap-2.5"
            onClick={() => setOpen(false)}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Bot className="h-5 w-5" />
            </span>
            <span className="leading-tight">
              <span className="block text-[15px] font-bold tracking-tight">
                R2Flow <span className="text-primary">Core</span>
              </span>
              <span className="block text-[11px] font-medium text-muted-foreground">
                ready to flow
              </span>
            </span>
          </Link>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 pt-4">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={linkClass}
              onClick={() => setOpen(false)}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto px-4 pb-5">
          <div className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-card p-2.5">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-secondary text-xs font-bold text-primary">
                OP
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-semibold">Operator</span>
              <span className="block text-[11px] font-semibold text-primary">
                local
              </span>
            </span>
          </div>
        </div>
      </aside>

      <div className="min-h-screen bg-[#f8faf8] md:ml-60">
        <main className="max-w-6xl animate-enter px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
