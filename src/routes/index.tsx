import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/$dept", params: { dept: "dhsc" } });
  },
  component: () => null,
});
