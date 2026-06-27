import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Footer } from "./Footer";
import { TopNav } from "./TopNav";
import blogMarkdown from "../../docs/blog-open-data-for-ai.md?raw";

export function BlogPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6">
        <article className="prose-blog">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {blogMarkdown}
          </ReactMarkdown>
        </article>
        <div className="mt-10 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Built and maintained in the open. Prefer the machine-readable version?
          Grab the{" "}
          <a
            href={`${import.meta.env.BASE_URL}blog.md`}
            className="text-primary hover:underline"
          >
            raw Markdown
          </a>{" "}
          (also served as a static, no-JavaScript page). If this is useful, you
          can{" "}
          <a
            href="https://github.com/Egly443/Govviz#support-this-work"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            support the work
          </a>{" "}
          or read the source on{" "}
          <a
            href="https://github.com/Egly443/Govviz/blob/main/docs/blog-open-data-for-ai.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            GitHub
          </a>
          .
        </div>
        <Footer />
      </main>
    </div>
  );
}
