import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

const components = {
  h1: (props) => <h1 className="mt-6 text-2xl font-semibold first:mt-0" {...props} />,
  h2: (props) => <h2 className="mt-5 text-xl font-semibold first:mt-0" {...props} />,
  h3: (props) => <h3 className="mt-4 text-lg font-semibold first:mt-0" {...props} />,
  p: (props) => <p className="mt-3 text-base leading-relaxed text-foreground/90 first:mt-0" {...props} />,
  ul: (props) => <ul className="mt-3 list-disc space-y-1 pl-6 text-base leading-relaxed text-foreground/90" {...props} />,
  ol: (props) => <ol className="mt-3 list-decimal space-y-1 pl-6 text-base leading-relaxed text-foreground/90" {...props} />,
  li: (props) => <li {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  a: (props) => <a className="underline underline-offset-2 hover:text-foreground" target="_blank" rel="noreferrer" {...props} />,
  blockquote: (props) => <blockquote className="mt-3 border-l-2 border-border pl-4 text-foreground/70 italic" {...props} />,
  code: (props) => <code className="rounded bg-muted px-1.5 py-0.5 text-sm" {...props} />,
  hr: (props) => <hr className="mt-6 border-border" {...props} />,
};

// Renders user-authored text as markdown so headings, bold text, and lists
// show up formatted instead of collapsing into one plain-text paragraph.
export default function MarkdownText({ text, className }) {
  if (!text) return null;
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
