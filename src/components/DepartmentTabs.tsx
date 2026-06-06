import { Link } from "@tanstack/react-router";
import { departments } from "./departments";

interface Props {
  active: string;
}

export function DepartmentTabs({ active }: Props) {
  return (
    <div className="sticky top-16 z-30 -mx-4 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6">
      <nav
        className="-mb-px flex gap-1 overflow-x-auto py-1"
        aria-label="Departments"
      >
        {departments.map((d) => {
          const isActive = d.code === active;
          return (
            <Link
              key={d.code}
              to="/$dept"
              params={{ dept: d.code }}
              className={`whitespace-nowrap rounded-t-md px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border-b-2 border-primary text-foreground"
                  : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              {d.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
