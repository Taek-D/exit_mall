// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GuideMarkdown } from '@/lib/guide/markdown';

describe('GuideMarkdown', () => {
  it('renders basic markdown', () => {
    const { container } = render(<GuideMarkdown source="**bold** _italic_" />);
    expect(container.querySelector('strong')).not.toBeNull();
    expect(container.querySelector('em')).not.toBeNull();
  });

  it('strips script tags', () => {
    const { container } = render(<GuideMarkdown source={'<script>alert(1)</script>안녕'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('안녕');
  });

  it('renders [click](javascript:...) as plain text without anchor', () => {
    const { container } = render(<GuideMarkdown source="[click](javascript:alert(1))" />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('click');
  });

  it('renders [link](//evil.com) as plain text without anchor (no protocol-relative)', () => {
    const { container } = render(<GuideMarkdown source="[link](//evil.com)" />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('link');
  });

  it('adds rel=noopener to external links', () => {
    const { container } = render(<GuideMarkdown source="[ex](https://example.com)" />);
    const a = container.querySelector('a');
    expect(a?.getAttribute('rel')).toContain('noopener');
  });
});
