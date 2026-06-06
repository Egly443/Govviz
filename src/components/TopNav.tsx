import { Link } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";

export function TopNav() {
  return (
    <header className="sticky top-0 z-40 h-16 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/overview" className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 text-primary">
            <BarChart3 className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Govviz</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            UK government performance
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-xs text-muted-foreground">
          <a href="#" className="hover:text-foreground">
            Methodology
          </a>
          <a href="#" className="hidden hover:text-foreground sm:inline">
            About
          </a>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Live
          </span>
        </nav>
      </div>
    </header>
  );
}
