'use client';
import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import useSWR from 'swr';
import { usePathname, useRouter } from 'next/navigation';
import { useTabsContext } from '@/context/TabsContext';

type NodeType = 'note' | 'tag' | 'attachment' | 'unresolved';

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  path?: string;
  linkCount: number;
  type?: NodeType;
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

const TYPE_COLORS: Record<Exclude<NodeType, 'note'>, string> = {
  tag: '#b48ede',
  attachment: '#6bc5b8',
  unresolved: 'rgba(255,255,255,0.18)',
};

interface GraphFilters {
  tags: boolean;
  attachments: boolean;
  existingOnly: boolean;
  orphans: boolean;
}

const DEFAULT_FILTERS: GraphFilters = {
  tags: false,
  attachments: false,
  existingOnly: false,
  orphans: true,
};

const FILTER_DEFS: { key: keyof GraphFilters; label: string }[] = [
  { key: 'tags', label: 'Tags' },
  { key: 'attachments', label: 'Attachments' },
  { key: 'existingOnly', label: 'Existing files only' },
  { key: 'orphans', label: 'Orphans' },
];

function loadFilters(): GraphFilters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS;
  try {
    return { ...DEFAULT_FILTERS, ...JSON.parse(localStorage.getItem('graph.filters') || '{}') };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function MiniToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 30, height: 16, borderRadius: 999, border: 'none', cursor: 'pointer',
        background: on ? '#7F77DD' : 'rgba(255,255,255,0.15)',
        position: 'relative', padding: 0, flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: on ? 16 : 2, width: 12, height: 12,
        borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
      }} />
    </button>
  );
}

const ctrlButtonStyle: React.CSSProperties = {
  width: 28, height: 28,
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 5,
  color: 'rgba(255,255,255,0.6)',
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

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
  const [filters, setFilters] = useState<GraphFilters>(loadFilters);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  // Incremented by the magic wand — re-runs the layout as a live animation.
  const [animKey, setAnimKey] = useState(0);
  const lastAnimRef = useRef(0);
  const pathname = usePathname();
  const router = useRouter();
  const tabsCtx = useTabsContext();

  const swrKey = folderFilter
    ? `/api/notes/graph?folder=${encodeURIComponent(folderFilter)}`
    : '/api/notes/graph';

  const { data, isLoading, mutate: mutateGraph } = useSWR<GraphData>(swrKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  // Watch the notes tree (same SWR key the sidebar mutates on create/delete/
  // rename) and refetch the graph whenever the set of notes changes — so a new
  // note shows up without a manual page refresh.
  const { data: treeData } = useSWR('/api/notes/tree', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 0,
  });
  const treeSig = treeData?.notes
    ? (treeData.notes as { id: string }[]).map(n => n.id).sort().join('\n')
    : null;
  const prevTreeSigRef = useRef<string | null>(null);
  useEffect(() => {
    if (treeSig === null) return;
    if (prevTreeSigRef.current !== null && prevTreeSigRef.current !== treeSig) mutateGraph();
    prevTreeSigRef.current = treeSig;
  }, [treeSig, mutateGraph]);

  // Persist filter toggles.
  useEffect(() => {
    try { localStorage.setItem('graph.filters', JSON.stringify(filters)); } catch {}
  }, [filters]);

  // Close the settings popover on outside click.
  useEffect(() => {
    if (!showSettings) return;
    function onDown(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showSettings]);

  const activeNoteId = activeNoteIdProp ?? (
    pathname.startsWith('/notes/')
      ? decodeURIComponent(pathname.replace('/notes/', ''))
      : null
  );

  // Apply the filter toggles to the raw graph data.
  const filtered = useMemo(() => {
    if (!data?.nodes) return null;
    let nodes = data.nodes.filter(n => {
      const t = n.type ?? 'note';
      if (t === 'tag' && !filters.tags) return false;
      if (t === 'attachment' && !filters.attachments) return false;
      if (t === 'unresolved' && filters.existingOnly) return false;
      return true;
    });
    const idSet = new Set(nodes.map(n => n.id));
    const edges = data.edges.filter(
      e => idSet.has(e.source as string) && idSet.has(e.target as string)
    );
    if (!filters.orphans) {
      const linked = new Set<string>();
      edges.forEach(e => { linked.add(e.source as string); linked.add(e.target as string); });
      nodes = nodes.filter(n => linked.has(n.id));
    }
    return { nodes, edges };
  }, [data, filters]);

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
    if ((node.type ?? 'note') !== 'note') return;
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
    if (!filtered || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    if (filtered.nodes.length === 0) return;

    const rect = svgRef.current.getBoundingClientRect();
    const w = rect.width > 10 ? rect.width : dims.w;
    const h = rect.height > 10 ? rect.height : dims.h;

    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 4])
      .on('zoom', event => { g.attr('transform', event.transform); });

    zoomRef.current = zoom;
    svg.call(zoom);

    const nodes: GraphNode[] = filtered.nodes.map(n => ({ ...n }));
    const edges: GraphEdge[] = filtered.edges.map(e => ({ ...e }));

    // Build folder → color palette from top-level folder names
    const topFolders = new Set<string>();
    nodes.forEach(n => {
      if (n.path?.includes('/')) topFolders.add(n.path.split('/')[0]);
    });
    const folderPalette = new Map<string, string>();
    Array.from(topFolders).forEach((f, i) => folderPalette.set(f, FOLDER_PALETTE[i % FOLDER_PALETTE.length]));

    const nodeType = (d: GraphNode): NodeType => d.type ?? 'note';
    const nodeR = (d: GraphNode) => {
      if (nodeType(d) !== 'note') return 3 + Math.min(d.linkCount * 1.2, 8);
      return (d.id === activeNoteId ? 6 : 4) + Math.min(d.linkCount * 1.5, 10);
    };
    const nodeFill = (d: GraphNode) => {
      const t = nodeType(d);
      if (t !== 'note') return TYPE_COLORS[t];
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
      .attr('cursor', d => (nodeType(d) === 'note' ? 'pointer' : 'default'))
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
      .attr('fill', d => (nodeType(d) === 'unresolved' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.7)'))
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

    const fitToView = (animate: boolean) => {
      const xs = nodes.map(n => n.x ?? 0);
      const ys = nodes.map(n => n.y ?? 0);
      if (xs.length === 0) return;
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const pad = 60;
      const scaleX = (w - pad * 2) / (maxX - minX || 1);
      const scaleY = (h - pad * 2) / (maxY - minY || 1);
      const scale = Math.min(Math.min(scaleX, scaleY), 2);
      const tx = w / 2 - scale * ((minX + maxX) / 2);
      const ty = h / 2 - scale * ((minY + maxY) / 2);
      const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
      if (animate) svg.transition().duration(500).call(zoom.transform, t);
      else svg.call(zoom.transform, t);
    };

    const reheat = animKey !== lastAnimRef.current;
    lastAnimRef.current = animKey;

    if (reheat) {
      // Magic wand: Obsidian-style build-up. Nodes start clustered near the
      // center and pop in one by one (most-connected first) with a springy
      // scale-in, links fade in once both endpoints are visible, and the live
      // simulation spreads everything out as it grows.
      nodes.forEach(n => {
        n.x = w / 2 + (Math.random() - 0.5) * 120;
        n.y = h / 2 + (Math.random() - 0.5) * 120;
      });
      applyPositions();
      svg.call(zoom.transform, d3.zoomIdentity);

      const order = new Map<string, number>();
      [...nodes].sort((a, b) => b.linkCount - a.linkCount).forEach((n, i) => order.set(n.id, i));
      const step = Math.min(60, 2000 / Math.max(nodes.length, 1));
      const delayOf = (d: GraphNode) => (order.get(d.id) ?? 0) * step;

      node.attr('r', 0)
        .transition()
        .delay(d => delayOf(d))
        .duration(400)
        .ease(d3.easeBackOut.overshoot(2.2))
        .attr('r', nodeR);

      label.attr('opacity', 0)
        .transition()
        .delay(d => delayOf(d) + 200)
        .duration(300)
        .attr('opacity', 1);

      link.attr('stroke-opacity', 0)
        .transition()
        .delay(d => Math.max(delayOf(d.source as GraphNode), delayOf(d.target as GraphNode)) + 250)
        .duration(300)
        .attr('stroke-opacity', 1);

      simulation.alpha(1);
      simulation.on('end', () => fitToView(true));
    } else {
      // Normal load: settle the layout off-screen, then render instantly.
      simulation.stop();
      for (let i = 0; i < 300; i++) simulation.tick();
      applyPositions();
      fitToView(false);
    }

    simulation.on('tick', applyPositions).restart();

    return () => { simulation.stop(); };
  }, [filtered, dims, activeNoteId, handleNodeClick, animKey]);

  const nodeCount = filtered?.nodes.filter(n => (n.type ?? 'note') === 'note').length ?? 0;
  const edgeCount = filtered?.edges.length ?? 0;

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

      {/* Settings + reheat controls top-right */}
      <div style={{
        position: 'absolute', top: showHeader ? 40 : 12, right: 12,
        display: 'flex', gap: 6, zIndex: 15,
      }}>
        <button
          title="Re-run layout animation"
          onClick={() => setAnimKey(k => k + 1)}
          style={ctrlButtonStyle}
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
        <div ref={settingsRef} style={{ position: 'relative' }}>
          <button
            title="Graph settings"
            onClick={() => setShowSettings(s => !s)}
            style={{
              ...ctrlButtonStyle,
              ...(showSettings ? { background: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.85)' } : {}),
            }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          {showSettings && (
            <div style={{
              position: 'absolute', top: 34, right: 0, width: 210,
              background: '#1e2030', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8, padding: '10px 12px', zIndex: 20,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}>
              <div style={{
                fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
                color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase',
              }}>
                Filters
              </div>
              {FILTER_DEFS.map(({ key, label }) => (
                <div
                  key={key}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '5px 0', fontSize: 12.5, color: 'rgba(255,255,255,0.75)',
                  }}
                >
                  <span>{label}</span>
                  <MiniToggle
                    on={filters[key]}
                    onClick={() => setFilters(f => ({ ...f, [key]: !f[key] }))}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Legend bottom-left */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12,
        fontSize: 11, color: 'rgba(255,255,255,0.3)',
        pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 10,
        zIndex: 10,
      }}>
        <span>● note</span>
        {filters.tags && <span style={{ color: TYPE_COLORS.tag }}>● tag</span>}
        {filters.attachments && <span style={{ color: TYPE_COLORS.attachment }}>● attachment</span>}
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
            style={{ ...ctrlButtonStyle, fontSize: 16, lineHeight: 1 }}
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
