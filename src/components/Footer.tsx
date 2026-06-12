export function Footer() {
  return (
    <footer className="mt-16 flex flex-col items-start justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
      <div className="max-w-2xl">
        Charts marked &ldquo;Official data&rdquo; show statistics fetched at
        build time from ONS, World Bank and other official sources; charts
        marked &ldquo;Illustrative&rdquo; show indicative trajectories only.
      </div>
      <a
        href="https://github.com/egly443/govviz"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-foreground"
      >
        Source on GitHub ↗
      </a>
    </footer>
  );
}
