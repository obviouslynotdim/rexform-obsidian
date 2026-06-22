'use client';
import { useRef, useEffect, useState, useCallback } from 'react';
import * as d3 from 'd3';
import useSWR from 'swr';
import { usePathname, useRouter } from 'next/navigation';
import { useTabsContext } from '@/context/TabsContext';

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  path?: string;
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

const FOLDER_PALETTE = [
  '#7F77DD', '#4ade80', '#f87171', '#fbbf24',
  '#60a5fa', '#a78bfa', '#34d399', '#fb923c',
];

interface Props {
  showHeader?: boolean;
  onNodeClick?: (id: string, title: string) => void;
  activeNoteId?: string;
  folderFilter?: string;
}

export default function GraphView({ showHeader, onNodeClick, activeNoteId: activeNoteIdProp, folderFilter }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string } | null>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const pathname = usePathname();
  const router = useRouter();
  const tabsCtx = useTabsContext();

  const swrKey = folderFilter
    ? `/api/notes/graph?folder=${encodeURIComponent(folderFilter)}`
    : '/api/notes/graph';

  const { data, isLoading } = useSWR<GraphData>(swrKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  const activeNoteId = activeNoteIdProp ?? (
    pathname.startsWith('/notes/')
      ? decodeURIComponent(pathname.replace('/notes/', ''))
      : null
  );

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
    if (onNodeClick) {
      onNodeClick(node.id, node.title);
    } else {
      tabsCtx?.openTab(node.id, node.title);
      router.push(`/notes/${encodeURIComponent(node.id)}`);
    }
  }, [onNodeClick, router, tabsCtx]);

  function zoomIn() {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).call(zoomRef.current.scaleBy, 1.3);
  }

  function zoomOut() {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).call(zoomRef.current.scaleBy, 0.7);
  }

  useEffect(() => {
    if (!data || !svgRef.current || data.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const rect = svgRef.current.getBoundingClientRect();
    const w = rect.width > 10 ? rect.width : dims.w;
    const h = rect.height > 10 ? rect.height : dims.h;

    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 4])
      .on('zoom', event => { g.attr('transform', event.transform); });

    zoomRef.current = zoom;
    svg.call(zoom);

    const nodes: GraphNode[] = data.nodes.map(n => ({ ...n }));
    const edges: GraphEdge[] = data.edges.map(e => ({ ...e }));

    // Build folder → color palette from top-level folder names
    const topFolders = new Set<string>();
    nodes.forEach(n => {
      if (n.path?.includes('/')) topFolders.add(n.path.split('/')[0]);
    });
    const folderPalette = new Map<string, string>();
    Array.from(topFolders).forEach((f, i) => folderPalette.set(f, FOLDER_PALETTE[i % FOLDER_PALETTE.length]));

    const nodeR = (d: GraphNode) => (d.id === activeNoteId ? 6 : 4) + Math.min(d.linkCount * 1.5, 10);
    const nodeFill = (d: GraphNode) => {
      if (d.id === activeNoteId) return '#fff';
      if (d.path?.includes('/')) {
        const c = folderPalette.get(d.path.split('/')[0]);
        if (c) return c;
      }
      return 'rgba(255,255,255,0.6)';
    };

    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(edges)
        .id(d => d.id)
        .distance(80))
      .force('charge', d3.forceManyBody<GraphNode>().strength(-200))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collide', d3.forceCollide<GraphNode>(18))
      .force('x', d3.forceX(w / 2).strength(0.05))
      .force('y', d3.forceY(h / 2).strength(0.05));

    simulation.stop();
    for (let i = 0; i < 300; i++) simulation.tick();

    const link = g.append('g')
      .selectAll<SVGLineElement, GraphEdge>('line')
      .data(edges)
      .join('line')
      .attr('stroke', 'rgba(255,255,255,0.15)')
      .attr('stroke-width', 0.8);

    const node = g.append('g')
      .selectAll<SVGCircleElement, GraphNode>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', nodeR)
      .attr('fill', nodeFill)
      .attr('stroke', 'none')
      .attr('cursor', 'pointer')
      .call(
        d3.drag<SVGCircleElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on('end', (event) => { if (!event.active) simulation.alphaTarget(0); })
      );

    node.on('dblclick', (_event, d) => {
      d.fx = null; d.fy = null;
      simulation.alphaTarget(0.1).restart();
    });

    node.on('click', (_event, d) => { handleNodeClick(d); });

    node.on('mouseenter', (event, d) => {
      d3.select(event.currentTarget as SVGCircleElement).attr('fill', '#fff');
      const svgRect = svgRef.current!.getBoundingClientRect();
      setTooltip({
        x: event.clientX - svgRect.left + 12,
        y: event.clientY - svgRect.top - 8,
        title: d.title,
      });
    });

    node.on('mouseleave', (event, d) => {
      d3.select(event.currentTarget as SVGCircleElement).attr('fill', nodeFill(d));
      setTooltip(null);
    });

    const label = g.append('g')
      .selectAll<SVGTextElement, GraphNode>('text')
      .data(nodes)
      .join('text')
      .text(d => d.title)
      .attr('font-size', '11px')
      .attr('fill', 'rgba(255,255,255,0.7)')
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none');

    const applyPositions = () => {
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
        .attr('y', d => (d.y ?? 0) + nodeR(d) + 14);
    };

    applyPositions();

    const xs = nodes.map(n => n.x ?? 0);
    const ys = nodes.map(n => n.y ?? 0);
    if (xs.length > 0) {
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const pad = 60;
      const scaleX = (w - pad * 2) / (maxX - minX || 1);
      const scaleY = (h - pad * 2) / (maxY - minY || 1);
      const scale = Math.min(Math.min(scaleX, scaleY), 2);
      const tx = w / 2 - scale * ((minX + maxX) / 2);
      const ty = h / 2 - scale * ((minY + maxY) / 2);
      svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    }

    simulation.on('tick', applyPositions).restart();

    return () => { simulation.stop(); };
  }, [data, dims, activeNoteId, handleNodeClick, folderFilter]);

  const nodeCount = data?.nodes.length ?? 0;
  const edgeCount = data?.edges.length ?? 0;

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: 'var(--bg-base)' }}
    >
      {showHeader && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 32,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', background: 'rgba(0,0,0,0.3)', zIndex: 10, fontSize: 12,
        }}>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>Graph View</span>
          {!isLoading && (
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>
              {nodeCount} notes · {edgeCount} links
            </span>
          )}
        </div>
      )}

      {isLoading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading graph…</span>
        </div>
      )}

      {!isLoading && nodeCount === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
          height: showHeader ? 'calc(100% - 32px)' : '100%',
          width: '100%',
        }}
      />

      {/* Legend bottom-left */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12,
        fontSize: 11, color: 'rgba(255,255,255,0.3)',
        pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 10,
        zIndex: 10,
      }}>
        <span>● note</span>
        <span>— link</span>
      </div>

      {/* Zoom controls bottom-right */}
      <div style={{
        position: 'absolute', bottom: 12, right: 12,
        display: 'flex', flexDirection: 'column', gap: 4, zIndex: 10,
      }}>
        {([{ label: '+', fn: zoomIn }, { label: '−', fn: zoomOut }] as const).map(({ label, fn }) => (
          <button
            key={label}
            onClick={fn}
            style={{
              width: 28, height: 28,
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 5,
              color: 'rgba(255,255,255,0.6)',
              fontSize: 16, lineHeight: 1,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >{label}</button>
        ))}
      </div>

      {tooltip && (
        <div style={{
          position: 'absolute', left: tooltip.x, top: tooltip.y,
          background: '#1e2030', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 5, padding: '4px 8px', fontSize: 12,
          color: 'rgba(255,255,255,0.85)', pointerEvents: 'none', zIndex: 20, whiteSpace: 'nowrap',
        }}>
          {tooltip.title}
        </div>
      )}
    </div>
  );
}
