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
  linkCount: number;
}

interface DemoEdge extends d3.SimulationLinkDatum<DemoNode> {
  source: string | DemoNode;
  target: string | DemoNode;
}

const RAW_NODES: { id: string; title: string }[] = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'roadmap', title: 'Project Roadmap' },
  { id: 'meeting', title: 'Meeting Notes' },
  { id: 'research', title: 'Research' },
  { id: 'ideas', title: 'Ideas' },
  { id: 'journal', title: 'Daily Journal' },
  { id: 'architecture', title: 'Architecture' },
  { id: 'wiki', title: 'Team Wiki' },
  { id: 'retro', title: 'Retrospective' },
  { id: 'reading', title: 'Reading List' },
  { id: 'sprint', title: 'Sprint Planning' },
  { id: 'bugs', title: 'Bug Tracker' },
];

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
  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const w = dims.w;
    const h = Math.max(dims.h - TAGLINE_H, 100);
    const linkCounts = buildLinkCounts();
    const nodes: DemoNode[] = RAW_NODES.map((n) => ({ ...n, linkCount: linkCounts.get(n.id) ?? 0 }));
    const edges: DemoEdge[] = RAW_EDGES.map(([source, target]) => ({ source, target }));

    const g = svg.append('g');

    const nodeR = (d: DemoNode) => 4 + Math.min(d.linkCount * 1.6, 9);

    const simulation = d3
      .forceSimulation<DemoNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<DemoNode, DemoEdge>(edges)
          .id((d) => d.id)
          .distance(70)
      )
      .force('charge', d3.forceManyBody<DemoNode>().strength(-160))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collide', d3.forceCollide<DemoNode>(20));

    const link = g
      .append('g')
      .selectAll<SVGLineElement, DemoEdge>('line')
      .data(edges)
      .join('line')
      .attr('stroke', 'rgba(255, 255, 255, 0.15)')
      .attr('stroke-width', 1);

    const node = g
      .append('g')
      .selectAll<SVGCircleElement, DemoNode>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', nodeR)
      .attr('fill', 'var(--accent)')
      .attr('opacity', 0.75)
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
      d3.select(this).attr('fill', '#fff').attr('opacity', 1);
      const rect = svgRef.current!.getBoundingClientRect();
      setTooltip({ x: event.clientX - rect.left + 10, y: event.clientY - rect.top - 8, title: d.title });
    });

    node.on('mouseleave', function () {
      d3.select(this).attr('fill', 'var(--accent)').attr('opacity', 0.75);
      setTooltip(null);
    });

    const label = g
      .append('g')
      .selectAll<SVGTextElement, DemoNode>('text')
      .data(nodes)
      .join('text')
      .text((d) => d.title)
      .attr('font-size', '10px')
      .attr('fill', 'rgba(255, 255, 255, 0.45)')
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none');

    function applyPositions() {
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
  }, [dims]);

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ padding: '32px 32px 0' }}>
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
