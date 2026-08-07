'use client';

// A real, working mini graph view for the auth split-screen panel — the same
// D3 force-simulation mechanics as the actual Graph View (see
// app/components/GraphView.tsx: forceSimulation + drag + hover), just fed
// demo note titles instead of a live vault, since there's no vault to show
// before the user has signed in.

import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

interface DemoNode extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  group: string;
  linkCount: number;
}

interface DemoEdge extends d3.SimulationLinkDatum<DemoNode> {
  source: string | DemoNode;
  target: string | DemoNode;
}

// Grouped like folders in the real Graph View, so nodes pick up the same
// per-folder color coding instead of one flat accent color (see
// GraphView.tsx: FOLDER_PALETTE + folderPalette map keyed by top-level path).
const RAW_NODES: { id: string; title: string; group: string }[] = [
  { id: 'welcome', title: 'Welcome', group: 'core' },
  { id: 'wiki', title: 'Team Wiki', group: 'core' },
  { id: 'roadmap', title: 'Project Roadmap', group: 'planning' },
  { id: 'sprint', title: 'Sprint Planning', group: 'planning' },
  { id: 'meeting', title: 'Meeting Notes', group: 'planning' },
  { id: 'retro', title: 'Retrospective', group: 'planning' },
  { id: 'research', title: 'Research', group: 'knowledge' },
  { id: 'ideas', title: 'Ideas', group: 'knowledge' },
  { id: 'journal', title: 'Daily Journal', group: 'knowledge' },
  { id: 'reading', title: 'Reading List', group: 'knowledge' },
  { id: 'architecture', title: 'Architecture', group: 'dev' },
  { id: 'bugs', title: 'Bug Tracker', group: 'dev' },
];

const GROUP_PALETTE: Record<string, string> = {
  core: '#9B7FFF',
  planning: '#60a5fa',
  knowledge: '#4ade80',
  dev: '#fb923c',
};

const RAW_EDGES: [string, string][] = [
  ['welcome', 'wiki'],
  ['wiki', 'architecture'],
  ['wiki', 'roadmap'],
  ['wiki', 'meeting'],
  ['wiki', 'ideas'],
  ['roadmap', 'sprint'],
  ['sprint', 'meeting'],
  ['sprint', 'bugs'],
  ['meeting', 'retro'],
  ['retro', 'ideas'],
  ['ideas', 'research'],
  ['ideas', 'journal'],
  ['research', 'reading'],
  ['architecture', 'bugs'],
];

const TAGLINE_H = 40;

function buildLinkCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  RAW_EDGES.forEach(([a, b]) => {
    counts.set(a, (counts.get(a) ?? 0) + 1);
    counts.set(b, (counts.get(b) ?? 0) + 1);
  });
  return counts;
}

export default function GraphIllustration() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState({ w: 480, h: 520 });
  // Stays false until the ResizeObserver below reports the real container
  // size. Rendering the <svg> at the guessed 480x520 default before that
  // measurement lands is what made bubbles pop in outside the actual panel
  // on refresh — this panel is often narrower/shorter than the guess, so the
  // simulation centered on the wrong canvas. Nothing draws until we know.
  const [measured, setMeasured] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string } | null>(null);
  // Re-runs the build-up entrance below on demand — the same "magic wand"
  // reheat as GraphView.tsx's animKey, just always replaying the pop-in
  // instead of gating it behind a reheat-vs-normal-load branch (this panel
  // has nothing to instantly settle to; every mount/click IS the animation).
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setDims({ w: width, h: height });
        setMeasured(true);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!measured || !svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const w = dims.w;
    const h = Math.max(dims.h - TAGLINE_H, 100);
    const linkCounts = buildLinkCounts();
    const nodes: DemoNode[] = RAW_NODES.map((n) => ({ ...n, linkCount: linkCounts.get(n.id) ?? 0 }));
    const edges: DemoEdge[] = RAW_EDGES.map(([source, target]) => ({ source, target }));

    const g = svg.append('g');

    const nodeR = (d: DemoNode) => 4 + Math.min(d.linkCount * 1.6, 9);
    // The label sits centered under the bubble, so give collision a radius
    // wide enough to cover roughly half the label's width too — otherwise
    // forceCollide only keeps the small circles apart and neighboring
    // bubbles/labels overlap once the text is wider than the gap between them.
    const collideR = (d: DemoNode) => nodeR(d) + Math.max(16, d.title.length * 2.6);

    const simulation = d3
      .forceSimulation<DemoNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<DemoNode, DemoEdge>(edges)
          .id((d) => d.id)
          .distance(70)
      )
      .force('charge', d3.forceManyBody<DemoNode>().strength(-220))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collide', d3.forceCollide<DemoNode>(collideR))
      // Isotropic repulsion naturally settles into a round blob, which reads
      // as "clumped in the middle" of this panel's tall, narrow box — keep
      // a mild horizontal pull so nodes don't spill past the narrow width,
      // but only a token vertical one so the (now stronger) charge and the
      // clamp below do the work of spreading nodes toward the top and bottom.
      .force('x', d3.forceX<DemoNode>(w / 2).strength(0.08))
      .force('y', d3.forceY<DemoNode>(h / 2).strength(0.015));

    const nodeFill = (d: DemoNode) => GROUP_PALETTE[d.group] ?? 'var(--accent)';

    const link = g
      .append('g')
      .selectAll<SVGLineElement, DemoEdge>('line')
      .data(edges)
      .join('line')
      .attr('stroke', 'rgba(255, 255, 255, 0.15)')
      .attr('stroke-width', 0.8);

    const node = g
      .append('g')
      .selectAll<SVGCircleElement, DemoNode>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', nodeR)
      .attr('fill', nodeFill)
      .attr('stroke', 'none')
      .attr('cursor', 'grab')
      .call(
        d3
          .drag<SVGCircleElement, DemoNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    node.on('mouseenter', function (event, d) {
      d3.select(this).attr('fill', '#fff').transition().duration(150).attr('r', nodeR(d) * 1.4);
      const rect = svgRef.current!.getBoundingClientRect();
      setTooltip({ x: event.clientX - rect.left + 10, y: event.clientY - rect.top - 8, title: d.title });
    });

    node.on('mouseleave', function (_event, d) {
      d3.select(this).attr('fill', nodeFill(d)).transition().duration(150).attr('r', nodeR(d));
      setTooltip(null);
    });

    const label = g
      .append('g')
      .selectAll<SVGTextElement, DemoNode>('text')
      .data(nodes)
      .join('text')
      .text((d) => d.title)
      .attr('font-size', '11px')
      .attr('fill', 'rgba(255, 255, 255, 0.7)')
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none');

    // Hard-clamp to the padded box so a node can never render (or be
    // dragged) outside the visible panel, regardless of what the force
    // simulation computes.
    function clamp(d: DemoNode) {
      const r = nodeR(d);
      d.x = Math.max(r, Math.min(w - r, d.x ?? w / 2));
      d.y = Math.max(r, Math.min(h - r, d.y ?? h / 2));
    }

    function applyPositions() {
      nodes.forEach(clamp);
      link
        .attr('x1', (d) => (d.source as DemoNode).x ?? 0)
        .attr('y1', (d) => (d.source as DemoNode).y ?? 0)
        .attr('x2', (d) => (d.target as DemoNode).x ?? 0)
        .attr('y2', (d) => (d.target as DemoNode).y ?? 0);
      node.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0);
      label.attr('x', (d) => d.x ?? 0).attr('y', (d) => (d.y ?? 0) + nodeR(d) + 12);
    }

    // Obsidian-style build-up entrance — same idea as the real Graph View's
    // "magic wand" reheat: nodes start clustered near the center and pop in
    // one by one, most-linked first, with a springy scale-in.
    nodes.forEach((n) => {
      n.x = w / 2 + (Math.random() - 0.5) * 80;
      n.y = h / 2 + (Math.random() - 0.5) * 80;
    });
    applyPositions();

    const order = new Map<string, number>();
    [...nodes].sort((a, b) => b.linkCount - a.linkCount).forEach((n, i) => order.set(n.id, i));
    const step = 70;
    const delayOf = (d: DemoNode) => (order.get(d.id) ?? 0) * step;

    node
      .attr('r', 0)
      .transition()
      .delay((d) => delayOf(d))
      .duration(400)
      .ease(d3.easeBackOut.overshoot(2.2))
      .attr('r', nodeR);

    label
      .attr('opacity', 0)
      .transition()
      .delay((d) => delayOf(d) + 200)
      .duration(300)
      .attr('opacity', 1);

    link
      .attr('stroke-opacity', 0)
      .transition()
      .delay((d) => Math.max(delayOf(d.source as DemoNode), delayOf(d.target as DemoNode)) + 250)
      .duration(300)
      .attr('stroke-opacity', 1);

    simulation.alpha(1).on('tick', applyPositions).restart();

    return () => {
      simulation.stop();
    };
  }, [measured, dims, animKey]);

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ padding: '32px 32px 0' }}>
      <button
        title="Replay animation"
        onClick={() => setAnimKey((k) => k + 1)}
        className="absolute flex items-center justify-center transition-colors"
        style={{
          top: 32,
          left: 32,
          width: 28,
          height: 28,
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 5,
          color: 'rgba(255,255,255,0.6)',
          cursor: 'pointer',
          zIndex: 10,
        }}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z" />
          <path d="m14 7 3 3" />
          <path d="M5 6v4" />
          <path d="M19 14v4" />
          <path d="M10 2v2" />
          <path d="M7 8H3" />
          <path d="M21 16h-4" />
          <path d="M11 3H9" />
        </svg>
      </button>

      <svg ref={svgRef} width={dims.w} height={Math.max(dims.h - TAGLINE_H, 100)} style={{ display: 'block' }} />

      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x,
            top: tooltip.y,
            background: '#1e2030',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 5,
            padding: '4px 8px',
            fontSize: 12,
            color: 'rgba(255, 255, 255, 0.85)',
            pointerEvents: 'none',
            zIndex: 20,
            whiteSpace: 'nowrap',
          }}
        >
          {tooltip.title}
        </div>
      )}

      <p
        className="absolute left-0 right-0 text-sm tracking-wide text-center"
        style={{ bottom: 10, color: 'var(--text-muted)' }}
      >
        Your knowledge, connected.
      </p>
    </div>
  );
}
