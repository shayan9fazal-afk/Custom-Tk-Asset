import { Switch, Route, Router as WouterRouter, Link, useRoute } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/home";
import Downloader from "@/pages/downloader";
import TikTokScraper from "@/pages/tiktok-scraper";
import NotFound from "@/pages/not-found";
import { Youtube, Download, Music2 } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const [active] = useRoute(href);
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
        active
          ? "bg-primary/15 text-primary border border-primary/30"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
    >
      {children}
    </Link>
  );
}

function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 p-3 bg-background/80 backdrop-blur-xl border-b border-border/50">
      <NavLink href="/">
        <Youtube className="w-4 h-4" />
        Channel Analyzer
      </NavLink>
      <NavLink href="/downloader">
        <Download className="w-4 h-4" />
        YT Downloader
      </NavLink>
      <NavLink href="/tiktok">
        <Music2 className="w-4 h-4" />
        TikTok Scraper
      </NavLink>
    </nav>
  );
}

function Router() {
  return (
    <>
      <Nav />
      <div className="pt-14">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/downloader" component={Downloader} />
          <Route path="/tiktok" component={TikTokScraper} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
