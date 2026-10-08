import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Account from "@/pages/Account";
import Home from "@/pages/Home";
import Library from "@/pages/Library";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { trpc } from "@/lib/trpc";

function AccountGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = trpc.auth.me.useQuery();
  if (isLoading) {
    return (
      <main className="auth-loading" aria-live="polite">
        <span className="loader-mark" aria-hidden="true" />
        <span>Opening your studio…</span>
      </main>
    );
  }
  if (!user) return <Redirect to="/login" />;
  return children;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <AccountGuard>
          <Home />
        </AccountGuard>
      </Route>
      <Route path="/library">
        <AccountGuard>
          <Library />
        </AccountGuard>
      </Route>
      <Route path="/account">
        <AccountGuard>
          <Account />
        </AccountGuard>
      </Route>
      <Route path="/404" component={NotFound} />
      <Route>
        <NotFound />
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
