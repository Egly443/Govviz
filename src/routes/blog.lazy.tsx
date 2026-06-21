import { createLazyFileRoute } from "@tanstack/react-router";
import { BlogPage } from "../components/BlogPage";

export const Route = createLazyFileRoute("/blog")({
  component: BlogPage,
});
