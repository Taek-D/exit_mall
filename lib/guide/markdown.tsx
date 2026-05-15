import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

const allowedTags = ['p', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'h3', 'h4', 'br', 'hr'];

const schema = {
  ...defaultSchema,
  tagNames: allowedTags,
  attributes: {
    ...defaultSchema.attributes,
    a: [['href', /^(https?:|mailto:|\/(?!\/))/], 'title'],
  },
};

export function GuideMarkdown({ source }: { source: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-a:text-sky-700">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
        components={{
          a: ({ href, children, ...rest }) => {
            // Sanitized away — render text without an anchor
            if (typeof href !== 'string' || href.length === 0) {
              return <>{children}</>;
            }
            const isExternal = /^https?:/.test(href);
            return (
              <a
                {...rest}
                href={href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
