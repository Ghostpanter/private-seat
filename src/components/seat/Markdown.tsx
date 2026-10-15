import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";

const components: Components = {
  a: ({ href, children }) => {
    const safe = href && /^https?:\/\//i.test(href) ? href : undefined;
    if (!safe) return <span>{children}</span>;
    return (
      <a href={safe} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
};

export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown components={components}>{text}</ReactMarkdown>
    </div>
  );
}
