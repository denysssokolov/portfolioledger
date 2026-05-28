import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { BarChart3, LineChart, Database, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ServiceSwitcher } from "@/components/ServiceSwitcher";
import { SafetyModeToggle } from "@/components/SafetyModeToggle";
import { ClearAllToasts, NotificationCenter } from "@/components/NotificationCenter";

const tabs = [
  { to: "/swing-trades", label: "Trades", icon: BarChart3, end: true },
  { to: "/swing-trades/pnl", label: "PnL", icon: LineChart },
  { to: "/swing-trades/data", label: "Data", icon: Database },
  { to: "/swing-trades/settings", label: "Settings", icon: SettingsIcon },
];

const SwingTradesLayout = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <ServiceSwitcher />
      <SafetyModeToggle />
      <NotificationCenter />
      <ClearAllToasts />
      <main className="mx-auto max-w-2xl pb-28">
        <Outlet />
      </main>
      <nav
        className="fixed bottom-0 inset-x-0 z-40 glass border-t border-border safe-bottom"
        aria-label="Primary"
      >
        <div className="mx-auto max-w-2xl grid grid-cols-4 px-2 pt-2">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-all",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      "h-5 w-5 transition-transform",
                      isActive && "scale-110"
                    )}
                    strokeWidth={isActive ? 2.4 : 2}
                  />
                  <span className="text-[10px] font-medium tracking-wide uppercase">
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default SwingTradesLayout;
