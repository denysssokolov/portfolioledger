import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, ArrowLeftRight, CalendarRange, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SafetyModeToggle } from "@/components/SafetyModeToggle";
import { ServiceSwitcher } from "@/components/ServiceSwitcher";
import { useRecurringMaterialiser } from "@/hooks/useRecurringMaterialiser";

const tabs = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/transactions", label: "Tx", icon: ArrowLeftRight },
  { to: "/snapshot", label: "Snapshot", icon: CalendarRange },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

const AppLayout = () => {
  useRecurringMaterialiser();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <ServiceSwitcher />
      <SafetyModeToggle />
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

export default AppLayout;
