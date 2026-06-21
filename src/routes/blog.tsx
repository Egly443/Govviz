import { createFileRoute } from "@tanstack/react-router";

// Component lives in blog.lazy.tsx so react-markdown + the essay text are
// code-split out of the main bundle and only load when /blog is visited.
export const Route = createFileRoute("/blog")({});
