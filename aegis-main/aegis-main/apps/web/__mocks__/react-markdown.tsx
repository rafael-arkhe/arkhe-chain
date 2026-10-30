/**
 * Manual mock for `react-markdown` (Jest auto-uses this for node modules).
 *
 * `react-markdown` (and its remark/micromark dep tree) ships as pure ESM,
 * which Jest's babel transform does not process (see jest.config.js
 * transformIgnorePatterns — only the d3-force-3d family is whitelisted).
 * Rendering the real module under jsdom throws
 * "Cannot use import statement outside a module".
 *
 * The mock renders the markdown source as plain text so component tests that
 * mount a chat message (e.g. ArquitetoChat, aip-chat MessageView) keep the
 * visible text assertions working without parsing markdown. The custom
 * `components` map is intentionally ignored — tests assert on the text, not
 * the rendered element tree.
 */
import * as React from 'react';

export default function ReactMarkdown({
  children,
}: {
  children?: React.ReactNode;
  [key: string]: unknown;
}) {
  return React.createElement('div', { 'data-testid': 'markdown' }, children);
}
