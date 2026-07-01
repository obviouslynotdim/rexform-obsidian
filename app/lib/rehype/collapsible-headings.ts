import type { Root, Element, ElementContent, RootContent } from 'hast';
import type { Plugin } from 'unified';

function headingLevel(node: RootContent): number | null {
  if (node.type !== 'element') return null;
  const m = (node as Element).tagName.match(/^h([1-6])$/);
  return m ? parseInt(m[1], 10) : null;
}

function makeChevron(): ElementContent {
  return {
    type: 'element',
    tagName: 'span',
    properties: { ariaHidden: 'true', className: ['rexform-fold-chevron'] },
    children: [{ type: 'text', value: '▶' }],
  };
}

/**
 * Recursively wraps each heading + following siblings (until the next heading
 * of equal or higher priority) in <details open class="rexform-fold">.
 * The heading lives inside <summary>; sub-headings fold independently via
 * recursion. "Equal or higher priority" = numerically ≤ current level.
 */
function wrapSections(nodes: RootContent[], counter: { n: number }): ElementContent[] {
  const result: ElementContent[] = [];
  let i = 0;

  while (i < nodes.length) {
    const node = nodes[i];
    const level = headingLevel(node);

    if (level !== null) {
      // Stamp a document-order id (`h-0`, `h-1`, …) BEFORE recursing into the
      // body, so the ordinal matches the Outline panel's ordinal — both count
      // headings top-to-bottom over the same source, so outline clicks resolve
      // via getElementById without any slug/text matching.
      const el = node as Element;
      el.properties = { ...(el.properties ?? {}), id: `h-${counter.n++}` };

      // Collect everything after this heading until the next same-or-higher heading.
      const body: RootContent[] = [];
      i++;
      while (i < nodes.length) {
        const nextLevel = headingLevel(nodes[i]);
        if (nextLevel !== null && nextLevel <= level) break;
        body.push(nodes[i]);
        i++;
      }

      // Wrap sub-headings inside the collected body before building this node.
      const wrappedBody = wrapSections(body, counter);

      const details: ElementContent = {
        type: 'element',
        tagName: 'details',
        properties: { open: true, className: ['rexform-fold'] },
        children: [
          {
            type: 'element',
            tagName: 'summary',
            properties: {},
            children: [makeChevron(), node as ElementContent],
          },
          ...wrappedBody,
        ],
      };

      result.push(details);
    } else {
      // Non-heading node — pass through, casting to ElementContent.
      // In normal markdown HAST, root children are element/text nodes;
      // Doctype nodes don't appear in user-authored content.
      result.push(node as ElementContent);
      i++;
    }
  }

  return result;
}

export const rehypeCollapsibleHeadings: Plugin<[], Root> = () => (tree) => {
  // Fresh counter per run so ids restart at h-0 for every note render.
  tree.children = wrapSections(tree.children, { n: 0 }) as RootContent[];
};
