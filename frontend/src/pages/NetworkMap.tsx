import { useState, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  ReactFlowProvider,
} from '@xyflow/react';

// IMPORTANTE: Estilos base do React Flow
import '@xyflow/react/dist/style.css';

import { Network, RefreshCw, Server } from 'lucide-react';
import { riskApi } from '@/lib/riskApi';

// Custom Node for better visual
const AssetNode = ({ data }: any) => (
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
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [loading, setLoading] = useState(true);

  const nodeTypes = useMemo(() => ({
    customNode: AssetNode
  }), []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await riskApi.getNetworkMap();
      
      // Use sophisticated layouting
      const positionedNodes = layoutNodes(data.nodes, data.edges || []);
      
      setNodes(positionedNodes);
      setEdges((data.edges || []).map((e: any) => ({
        ...e,
        markerEnd: { type: MarkerType.ArrowClosed, color: e.style?.stroke || '#94a3b8' },
        animated: e.animated !== undefined ? e.animated : true,
        style: { 
          stroke: '#94a3b8', 
          strokeWidth: 2,
          ...e.style 
        }
      })));
    } catch (err) {
      console.error("Failed to load map data", err);
    } finally {
      setLoading(false);
    }
  };

  const layoutNodes = (nodes: any[], edges: any[]) => {
    const positionedNodes = [...nodes];
    const hubCount = nodes.filter(n => n.id.startsWith('net-')).length;
    const hubSpacing = 800;

    // Position Hubs (Networks)
    nodes.filter(n => n.id.startsWith('net-')).forEach((hub, idx) => {
      const hubIdx = positionedNodes.findIndex(n => n.id === hub.id);
      positionedNodes[hubIdx].position = { x: (idx - (hubCount-1)/2) * hubSpacing, y: 0 };
      
      // Position Assets connected to this hub in a circle around it
      const connectedAssets = edges.filter(e => e.source === hub.id).map(e => e.target);
      connectedAssets.forEach((assetId, aIdx) => {
        const aNodeIdx = positionedNodes.findIndex(n => n.id === assetId);
        if (aNodeIdx !== -1) {
          const angle = (aIdx / connectedAssets.length) * 2 * Math.PI;
          const radius = 250 + (Math.floor(aIdx / 12) * 100); // Spiraling out if many assets
          positionedNodes[aNodeIdx].position = {
            x: positionedNodes[hubIdx].position.x + radius * Math.cos(angle),
            y: positionedNodes[hubIdx].position.y + radius * Math.sin(angle) + 400
          };
        }
      });
    });

    // Handle assets not connected to any hub (manual or floating)
    const floatingAssets = positionedNodes.filter(n => !n.id.startsWith('net-') && n.position.x === 0 && n.position.y === 0);
    floatingAssets.forEach((node, idx) => {
      const nIdx = positionedNodes.findIndex(n => n.id === node.id);
      positionedNodes[nIdx].position = { x: (idx - (floatingAssets.length-1)/2) * 250, y: 800 };
    });

    return positionedNodes;
  };

  useEffect(() => {
    fetchData();
  }, []);

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
        <button onClick={fetchData} className="ml-4 p-2 hover:bg-slate-100 rounded-lg transition-colors">
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
