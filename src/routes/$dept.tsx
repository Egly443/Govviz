import { createFileRoute, Link } from "@tanstack/react-router";
import { DepartmentPage } from "../components/DepartmentPage";
import { getDepartment } from "../components/departments";

export const Route = createFileRoute("/$dept")({
  component: DeptRoute,
});

function DeptRoute() {
  const { dept } = Route.useParams();
  const department = getDepartment(dept);

  if (!department) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6 text-center text-foreground">
        <div>
          <div className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            404
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Unknown department
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No department matches{" "}
            <code className="rounded bg-surface px-1.5 py-0.5">{dept}</code>.
          </p>
          <Link
            to="/$dept"
            params={{ dept: "dhsc" }}
            className="mt-5 inline-block rounded-full bg-primary/15 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/25"
          >
            Go to Health &amp; Social Care
          </Link>
        </div>
      </div>
    );
  }

  return <DepartmentPage department={department} />;
}
