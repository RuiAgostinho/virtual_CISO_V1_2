import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';

// IMPORTANTE: Estilos base do React Flow
import '@xyflow/react/dist/style.css';

import { Network, RefreshCw, Server } from 'lucide-react';
import { riskApi, type NetworkMapEdge, type NetworkMapNode } from '@/lib/riskApi';

type AssetNodeData = Record<string, unknown> & {
  label: string;
  type: string;
  ip?: string;
  color?: string;
  criticality?: string;
};

type AssetFlowNode = Node<AssetNodeData, 'customNode'>;
type AssetFlowEdge = Edge;

function asText(value: unknown, fallback = '') {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

function asStyle(value: unknown): CSSProperties {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as CSSProperties : {};
}

function toFlowNode(node: NetworkMapNode): AssetFlowNode {
  return {
    id: String(node.id),
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      label: asText(node.label ?? node.name ?? node.id, 'Ativo'),
      type: asText(node.type, 'Ativo'),
      ip: asText(node.ip, ''),
      color: asText(node.color, '#4f46e5'),
      criticality: asText(node.criticality, 'Normal'),
    },
  };
}

function toFlowEdge(edge: NetworkMapEdge): AssetFlowEdge {
  const edgeStyle = asStyle(edge.style);
  const source = String(edge.source);
  const target = String(edge.target);

  return {
    id: String(edge.id ?? `${source}-${target}`),
    source,
    target,
    label: edge.label,
    markerEnd: { type: MarkerType.ArrowClosed, color: asText(edgeStyle.stroke, '#94a3b8') },
    animated: typeof edge.animated === 'boolean' ? edge.animated : true,
    style: {
      stroke: '#94a3b8',
      strokeWidth: 2,
      ...edgeStyle,
    },
  };
}

function layoutNodes(nodes: AssetFlowNode[], edges: AssetFlowEdge[]) {
  const positionedNodes = nodes.map((node) => ({ ...node, position: { ...node.position } }));
  const hubNodes = positionedNodes.filter((node) => node.id.startsWith('net-'));
  const hubSpacing = 800;

  hubNodes.forEach((hub, idx) => {
    const hubIdx = positionedNodes.findIndex((node) => node.id === hub.id);
    if (hubIdx === -1) return;

    positionedNodes[hubIdx].position = { x: (idx - (hubNodes.length - 1) / 2) * hubSpacing, y: 0 };

    const connectedAssets = edges.filter((edge) => edge.source === hub.id).map((edge) => edge.target);
    connectedAssets.forEach((assetId, assetIdx) => {
      const assetNodeIdx = positionedNodes.findIndex((node) => node.id === assetId);
      if (assetNodeIdx === -1 || connectedAssets.length === 0) return;

      const angle = (assetIdx / connectedAssets.length) * 2 * Math.PI;
      const radius = 250 + (Math.floor(assetIdx / 12) * 100);
      positionedNodes[assetNodeIdx].position = {
        x: positionedNodes[hubIdx].position.x + radius * Math.cos(angle),
        y: positionedNodes[hubIdx].position.y + radius * Math.sin(angle) + 400
      };
    });
  });

  const floatingAssets = positionedNodes.filter((node) => !node.id.startsWith('net-') && node.position.x === 0 && node.position.y === 0);
  floatingAssets.forEach((node, idx) => {
    const nodeIdx = positionedNodes.findIndex((candidate) => candidate.id === node.id);
    if (nodeIdx === -1) return;
    positionedNodes[nodeIdx].position = { x: (idx - (floatingAssets.length - 1) / 2) * 250, y: 800 };
  });

  return positionedNodes;
}

// Custom Node for better visual
const AssetNode = ({ data }: NodeProps<AssetFlowNode>) => (
  <div className="px-4 py-3 shadow-lg rounded-lg border-2 bg-white min-w-[180px]" style={{ borderColor: data.color || '#4f46e5' }}>
    <div className="flex items-center gap-2">
      <div className="p-1.5 rounded bg-slate-100 text-slate-600">
        <Server className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-bold uppercase text-slate-400 truncate">{data.type}</p>
        <p className="text-xs font-bold text-slate-900 truncate">{data.label}</p>
      </div>
    </div>
    <div className="mt-2 flex items-center justify-between border-t border-slate-50 pt-1.5">
      <span className="text-[9px] font-mono text-slate-500">{data.ip || 'no-ip'}</span>
      <span className={`text-[8px] px-1 rounded font-bold text-white uppercase ${
        data.criticality === 'Critical' ? 'bg-red-500' : 
        data.criticality === 'High' ? 'bg-orange-500' : 'bg-slate-400'
      }`}>
        {data.criticality}
      </span>
    </div>
  </div>
);

function MapCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState<AssetFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<AssetFlowEdge>([]);
  const [loading, setLoading] = useState(true);

  const nodeTypes = useMemo(() => ({
    customNode: AssetNode
  }), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await riskApi.getNetworkMap();

      const flowEdges = (data.edges || []).map(toFlowEdge);
      setNodes(layoutNodes((data.nodes || []).map(toFlowNode), flowEdges));
      setEdges(flowEdges);
    } catch (err) {
      console.error("Failed to load map data", err);
    } finally {
      setLoading(false);
    }
  }, [setEdges, setNodes]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <div className="flex flex-col w-full h-full min-h-[600px] bg-slate-50 rounded-3xl overflow-hidden border border-slate-200">
      <div className="absolute top-4 left-4 z-10 flex items-center gap-3 bg-white/90 backdrop-blur p-3 rounded-2xl shadow-xl border border-slate-100">
        <div className="p-2 bg-indigo-600 rounded-xl text-white">
          <Network className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-900 leading-tight">Mapa de Infraestrutura</h2>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{nodes.length} Ativos Detectados</p>
        </div>
        <button onClick={() => void fetchData()} className="ml-4 p-2 hover:bg-slate-100 rounded-lg transition-colors">
          <RefreshCw className={`h-4 w-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        style={{ width: '100%', height: '100%' }}
      >
        <Background color="#e2e8f0" gap={20} />
        <Controls />
        <MiniMap zoomable pannable />
      </ReactFlow>
    </div>
  );
}

export default function NetworkMap() {
  return (
    <div className="w-full h-[calc(100vh-140px)] p-2">
      <ReactFlowProvider>
        <MapCanvas />
      </ReactFlowProvider>
    </div>
  );
}
