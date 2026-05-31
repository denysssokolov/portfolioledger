import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/usePortfolioData";
import { useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Snapshot from "./pages/Snapshot";
import SnapshotEditor from "./pages/SnapshotEditor";
import Settings from "./pages/Settings";
import AccountsManagement from "./pages/AccountsManagement";
import SwingTrades from "./pages/SwingTrades";
import SwingPnL from "./pages/SwingPnL";
import SwingData from "./pages/SwingData";
import SwingSettings from "./pages/SwingSettings";
import SwingTradesLayout from "./components/SwingTradesLayout";
import { QuotesProvider } from "@/hooks/useQuotes";
import NotFound from "./pages/NotFound.tsx";
import { ScrollToTop } from "./components/ScrollToTop";
import { CookieBanner } from "./components/CookieBanner";

const queryClient = new QueryClient();

const Gate = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { data: profile, isLoading: pl } = useProfile(user?.id);
  if (loading) return <div className="min-h-screen bg-background" />;
  if (!user) return <Navigate to="/auth" replace />;
  if (pl) return <div className="min-h-screen bg-background" />;
  if (!profile || !profile.onboarded) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
};

const RequireOnboarding = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { data: profile, isLoading: pl } = useProfile(user?.id);
  if (loading) return <div className="min-h-screen bg-background" />;
  if (!user) return <Navigate to="/auth" replace />;
  if (pl) return <div className="min-h-screen bg-background" />;
  if (profile?.onboarded) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ScrollToTop />
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route
              path="/onboarding"
              element={
                <RequireOnboarding>
                  <Onboarding />
                </RequireOnboarding>
              }
            />
            <Route
              element={
                <Gate>
                  <AppLayout />
                </Gate>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/snapshot" element={<Snapshot />} />
              <Route path="/snapshot/:month" element={<SnapshotEditor />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/accounts" element={<AccountsManagement />} />
            </Route>
            <Route
              element={
                <Gate>
                  <QuotesProvider>
                    <SwingTradesLayout />
                  </QuotesProvider>
                </Gate>
              }
            >
              <Route path="/swing-trades" element={<SwingTrades />} />
              <Route path="/swing-trades/pnl" element={<SwingPnL />} />
              <Route path="/swing-trades/data" element={<SwingData />} />
              <Route path="/swing-trades/settings" element={<SwingSettings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          <CookieBanner />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
