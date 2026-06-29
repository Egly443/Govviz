import { createFileRoute } from "@tanstack/react-router";
import { DataPage } from "../components/DataPage";

export const Route = createFileRoute("/data")({
  component: DataPage,
});
