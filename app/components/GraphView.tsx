'use client';
import { useRef, useEffect, useState, useCallback } from 'react';
import * as d3 from 'd3';
import useSWR from 'swr';
import { usePathname, useRouter } from 'next/navigation';
import { useTabsContext } from '@/context/TabsContext';

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  linkCount: number;
}

interface GraphEdge extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface Props {
  showHeader?: boolean;
}

export default function GraphView({ showHeader }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string } | null>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const pathname = usePathname();
  const router = useRouter();
  const tabsCtx = useTabsContext();

  const { data, isLoading } = useSWR<GraphData>('/api/notes/graph', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  const activeNoteId = pathname.startsWith('/notes/')
    ? decodeURIComponent(pathname.replace('/notes/', ''))
    : null;

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleNodeClick = useCallback((node: GraphNode) => {
    tabsCtx?.openTab(node.id, node.title);
    router.push(`/notes/${encodeURIComponent(node.id)}`);
  }, [router, tabsCtx]);

  useEffect(() => {
    if (!data || !svgRef.current || data.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const { w, h } = dims;

    // Zoom container
    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 4])
      .on('zoom', event => { g.attr('transform', event.transform); });

    svg.call(zoom);

    // Deep-copy nodes/edges so D3 can mutate them
    const nodes: GraphNode[] = data.nodes.map(n => ({ ...n }));
    const edges: GraphEdge[] = data.edges.map(e => ({ ...e }));

    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(edges)
        .id(d => d.id)
        .distance(60))
      .force('charge', d3.forceManyBody<GraphNode>().strength(-80))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collide', d3.forceCollide<GraphNode>(12));

    // Edges
    const link = g.append('g')
      .selectAll<SVGLineElement, GraphEdge>('line')
      .data(edges)
      .join('line')
      .attr('stroke', 'rgba(127,119,221,0.25)')
      .attr('stroke-width', 1);

    // Node radius helper
    const nodeR = (d: GraphNode) => 5 + Math.min(d.linkCount * 2, 15);
    const isActive = (d: GraphNode) => d.id === activeNoteId;

    // Nodes
    const node = g.append('g')
      .selectAll<SVGCircleElement, GraphNode>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', nodeR)
      .attr('fill', d => isActive(d) ? '#fff' : '#7F77DD')
      .attr('stroke', d => isActive(d) ? '#7F77DD' : 'none')
      .attr('stroke-width', 2)
      .attr('cursor', 'pointer')
      .call(
        d3.drag<SVGCircleElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event) => {
            if (!event.active) simulation.alphaTarget(0);
          })
      );

    // Double-click to unfix position
    node.on('dblclick', (_event, d) => {
      d.fx = null;
      d.fy = null;
      simulation.alphaTarget(0.1).restart();
    });

    node.on('click', (_event, d) => { handleNodeClick(d); });

    node.on('mouseenter', (event, d) => {
      d3.select(event.currentTarget as SVGCircleElement)
        .attr('fill', isActive(d) ? '#fff' : '#a09af0');
      const rect = svgRef.current!.getBoundingClientRect();
      setTooltip({
        x: event.clientX - rect.left + 12,
        y: event.clientY - rect.top - 8,
        title: d.title,
      });
    });

    node.on('mouseleave', (event, d) => {
      d3.select(event.currentTarget as SVGCircleElement)
        .attr('fill', isActive(d) ? '#fff' : '#7F77DD');
      setTooltip(null);
    });

    // Labels for well-connected nodes
    const label = g.append('g')
      .selectAll<SVGTextElement, GraphNode>('text')
      .data(nodes.filter(d => d.linkCount > 2))
      .join('text')
      .text(d => d.title)
      .attr('font-size', '10px')
      .attr('fill', 'rgba(255,255,255,0.6)')
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none');

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x ?? 0)
        .attr('y1', d => (d.source as GraphNode).y ?? 0)
        .attr('x2', d => (d.target as GraphNode).x ?? 0)
        .attr('y2', d => (d.target as GraphNode).y ?? 0);

      node
        .attr('cx', d => d.x ?? 0)
        .attr('cy', d => d.y ?? 0);

      label
        .attr('x', d => d.x ?? 0)
        .attr('y', d => (d.y ?? 0) + nodeR(d) + 12);
    });

    // Auto-fit after simulation settles
    simulation.on('end', () => {
      const xs = nodes.map(n => n.x ?? 0);
      const ys = nodes.map(n => n.y ?? 0);
      if (xs.length === 0) return;
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const pad = 40;
      const scaleX = (w - pad * 2) / (maxX - minX || 1);
      const scaleY = (h - pad * 2) / (maxY - minY || 1);
      const scale = Math.min(Math.min(scaleX, scaleY), 2);
      const tx = w / 2 - scale * ((minX + maxX) / 2);
      const ty = h / 2 - scale * ((minY + maxY) / 2);
      svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    });

    return () => { simulation.stop(); };
  }, [data, dims, activeNoteId, handleNodeClick]);

  const nodeCount = data?.nodes.length ?? 0;
  const edgeCount = data?.edges.length ?? 0;

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
    >
      {showHeader && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            background: 'rgba(0,0,0,0.3)',
            zIndex: 10,
            fontSize: 12,
          }}
        >
          <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>Graph View</span>
          {!isLoading && (
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>
              {nodeCount} notes · {edgeCount} links
            </span>
          )}
        </div>
      )}

      {isLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading graph…</span>
        </div>
      )}

      {!isLoading && nodeCount === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No notes to graph</span>
        </div>
      )}

      <svg
        ref={svgRef}
        width={dims.w}
        height={dims.h}
        style={{
          display: 'block',
          marginTop: showHeader ? 32 : 0,
          height: showHeader ? `calc(100% - 32px)` : '100%',
          width: '100%',
        }}
      />

      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x,
            top: tooltip.y,
            background: '#1e2030',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 5,
            padding: '4px 8px',
            fontSize: 12,
            color: 'rgba(255,255,255,0.85)',
            pointerEvents: 'none',
            zIndex: 20,
            whiteSpace: 'nowrap',
          }}
        >
          {tooltip.title}
        </div>
      )}
    </div>
  );
}
