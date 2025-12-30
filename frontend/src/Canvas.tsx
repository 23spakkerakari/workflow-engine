// src/Canvas.tsx
import React, { useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  useDraggable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { BlockNode, BlockEdge, BlockType, WorkflowDefinition } from "./types";

const BLOCK_W = 240;
const BLOCK_H = 120;

const labelByType: Record<BlockType, string> = {
  read_csv: "Read CSV",
  lead_enrichment: "Lead Enrichment",
  filter: "Filter",
  find_email: "Find Email",
  export_csv: "Export CSV",
};

const iconByType: Record<BlockType, React.ReactNode> = {
  read_csv: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="16" y2="17"/>
    </svg>
  ),
  lead_enrichment: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 1v6m0 6v6m5.2-13.2l-4.2 4.2m0 6l4.2 4.2M1 12h6m6 0h6m-13.2 5.2l4.2-4.2m6 0l4.2 4.2"/>
    </svg>
  ),
  filter: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  ),
  find_email: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  ),
  export_csv: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
};


type CanvasProps = {
  onBuildWorkflows: (workflows: WorkflowDefinition[]) => void;
};

const makeNode = (type: BlockType, x: number, y: number): BlockNode => ({
  id: crypto.randomUUID(),
  type,
  parameters: {},
  x,
  y,
});

// Block template button for the toolbar palette
const BlockTemplate: React.FC<{ type: BlockType; onClick: () => void }> = ({ type, onClick }) => {
  return (
    <button
      className={`block-template block-template--${type}`}
      onClick={onClick}
    >
      <div className="block-template__icon">{iconByType[type]}</div>
      <div className="block-template__label">
        <div className="block-template__title">{labelByType[type]}</div>
        <div className="block-template__subtitle">{type}</div>
      </div>
    </button>
  );
};

type ConnectingState =
  | null
  | {
      fromNodeId: string;
      // start point in canvas coordinates
      startX: number;
      startY: number;
      // current pointer in canvas coordinates
      x: number;
      y: number;
    };

function nodePos(node: BlockNode, drag: {id: string; dx: number; dy: number} | null) {
  const dx = drag && drag.id === node.id ? drag.dx : 0;
  const dy = drag && drag.id === node.id ? drag.dy : 0;
  return { x: node.x + dx, y: node.y + dy };
}

function nodeInputPort(node: BlockNode, drag: any) {
  const p = nodePos(node, drag);
  // Center of input handle: left edge at -12px, width 24px, so center at -12 + 12 = 0
  return { x: p.x, y: p.y + BLOCK_H / 2 };
}

function nodeOutputPort(node: BlockNode, drag: any) {
  const p = nodePos(node, drag);
  // Center of output handle: right edge at block width + 12px (extends beyond)
  return { x: p.x + BLOCK_W, y: p.y + BLOCK_H / 2 };
}

const DraggableBlock: React.FC<{
  node: BlockNode;
  onUpdateParams: (params: Record<string, any>) => void;
  onDelete: (nodeId: string) => void;
  onRemoveConnection: (nodeId: string) => void;
  hasIncomingEdge: boolean;
  hasOutgoingEdge: boolean;
  // connect handlers
  onStartConnect: (fromNodeId: string, e: React.PointerEvent) => void;
  // for dropping: each input port has a ref-able DOM rect checker
  registerInputEl: (nodeId: string, el: HTMLDivElement | null) => void;
}> = ({ node, onUpdateParams, onDelete, onRemoveConnection, hasIncomingEdge, hasOutgoingEdge, onStartConnect, registerInputEl }) => {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: node.id, 
  });

  const style: React.CSSProperties = {
    left: node.x,
    top: node.y,
    transform: CSS.Translate.toString(transform),
  };

  return (
  <div ref={setNodeRef} className={`block block--${node.type}`} style={style} {...attributes}>
    {/* Delete button */}
    <button
      className="block__delete"
      onClick={(e) => {
        e.stopPropagation();
        onDelete(node.id);
      }}
      title="Delete block"
    >
      ×
    </button>

    {/* Input handle with optional remove connection button */}
    <div
      ref={(el) => registerInputEl(node.id, el)}
      className="block__handle block__handle--in"
      title="Input"
    >
      {hasIncomingEdge && (
        <button
          className="block__remove-connection"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveConnection(node.id);
          }}
          title="Remove incoming connection"
        >
          ×
        </button>
      )}
    </div>
    
    {/* Output handle with optional remove connection button */}
    <div
      onPointerDown={(e) => {
        e.stopPropagation();
        onStartConnect(node.id, e);
      }}
      className="block__handle block__handle--out"
      title="Drag to connect"
    >
      {hasOutgoingEdge && (
        <button
          className="block__remove-connection"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveConnection(node.id);
          }}
          title="Remove outgoing connection"
        >
          ×
        </button>
      )}
    </div>

    <div
      {...listeners}
      className="block__header"
      title="Drag block"
    >
      <div className="block__icon">{iconByType[node.type]}</div>
      <div className="block__label">
        <div className="block__title">{labelByType[node.type]}</div>
        <div className="block__subtitle">{node.type}</div>
      </div>
    </div>

    {/* PARAMS AREA (NOT DRAGGABLE) */}
    <div
      className="block__params"
      onPointerDown={(e) => e.stopPropagation()} // prevents drag start when clicking inside inputs
    >
      <BlockParamsForm
        type={node.type}
        params={node.parameters ?? {}}
        onChange={(next) => onUpdateParams(next)}
      />
    </div>
  </div>
);
};

function setParam(
  params: Record<string, any>,
  key: string,
  value: any
): Record<string, any> {
  return { ...params, [key]: value };
}

function BlockParamsForm({
  type,
  params,
  onChange,
}: {
  type: BlockType;
  params: Record<string, any>;
  onChange: (next: Record<string, any>) => void;
}) {
    if (type === "read_csv") {
    return (
      <label className="field">
        Path
        <input
          className="input"
          value={params.path ?? ""}
          onChange={(e) => onChange(setParam(params, "path", e.target.value))}
          placeholder="e.g. sample.csv"
        />
      </label>
    );
  }

  if (type === "export_csv") {
    return (
      <label className="field">
        Output path
        <input
          className="input"
          value={params.output_path ?? ""}
          onChange={(e) => onChange(setParam(params, "output_path", e.target.value))}
          placeholder="e.g. leads_out.csv"
        />
      </label>
    );
  }

  if (type === "filter") {
    return (
      <div className="field-grid">
        <label className="field">
          Column
          <input
            className="input"
            value={params.column ?? ""}
            onChange={(e) => {
              // Ensure op is set when column is entered
              const newParams = setParam(params, "column", e.target.value);
              if (!newParams.op) {
                newParams.op = "contains";
              }
              onChange(newParams);
            }}
            placeholder="e.g. company"
          />
        </label>

        <label className="field">
          Operator
          <select
            className="input"
            value={params.op ?? "contains"}
            onChange={(e) => onChange(setParam(params, "op", e.target.value))}
          >
            <option value="eq">equals (eq)</option>
            <option value="neq">not equals (neq)</option>
            <option value="contains">contains</option>
            <option value="not_contains">not contains</option>
          </select>
        </label>

        <label className="field">
          Value
          <input
            className="input"
            value={params.value ?? ""}
            onChange={(e) => onChange(setParam(params, "value", e.target.value))}
            placeholder="e.g. Ariglad Inc"
          />
        </label>
      </div>
    );
  }

  if (type === "lead_enrichment") {
    return (
      <div className="muted small">
        No parameters needed (uses CSV row data).
      </div>
    );
  }

  if (type === "find_email") {
    return (
      <label className="field">
        Mode
        <select
          className="input"
          value={params.mode ?? "PERSONAL"}
          onChange={(e) => onChange({ mode: e.target.value })} 
        >
          <option value="PERSONAL">PERSONAL</option>
          <option value="PROFESSIONAL">PROFESSIONAL</option>
        </select>
      </label>
    );
  }

  // keep your read_csv/export_csv forms as you already have
  return <div className="muted small">No params</div>;
}



export default function Canvas({ onBuildWorkflows }: CanvasProps) {
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [nodes, setNodes] = useState<BlockNode[]>([
    makeNode("read_csv", 100, 100),
    makeNode("lead_enrichment", 400, 100),
    makeNode("export_csv", 700, 100),
  ]);

  const [edges, setEdges] = useState<BlockEdge[]>([]);
  const [connecting, setConnecting] = useState<ConnectingState>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 1, // Start drag after moving just 1px (was ~8px by default)
      },
    })
  );

  // canvas ref to convert pointer -> canvas coords
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // store input-handle DOM nodes so we can detect drop target
  const inputEls = useRef<Map<string, HTMLDivElement>>(new Map());


  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event;
    const id = String(active.id);

    // Normal block dragging (existing blocks on canvas)
    setNodes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, x: n.x + delta.x, y: n.y + delta.y } : n
      )
    );
    setDrag(null);
  };

  const canvasPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const canAddEdge = (fromId: string, toId: string) => {
    if (fromId === toId) return false;
    // enforce simple chain
    const hasOutgoing = edges.some((e) => e.from === fromId);
    const hasIncoming = edges.some((e) => e.to === toId);
    return !hasOutgoing && !hasIncoming;
  };

  const addEdge = (fromId: string, toId: string) => {
    if (!canAddEdge(fromId, toId)) return;
    setEdges((prev) => [
      ...prev,
      { id: crypto.randomUUID(), from: fromId, to: toId },
    ]);
  };

  const startConnect = (fromNodeId: string, e: React.PointerEvent) => {
    const fromNode = nodes.find((n) => n.id === fromNodeId);
    if (!fromNode) return;

    // start from output port
    const start = nodeOutputPort(fromNode, drag);

    // capture pointer so we keep receiving move/up events
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const p = canvasPoint(e.clientX, e.clientY);

    setConnecting({
      fromNodeId,
      startX: start.x,
      startY: start.y,
      x: p.x,
      y: p.y,
    });
  };

  const updateConnect = (e: React.PointerEvent) => {
    if (!connecting) return;
    const p = canvasPoint(e.clientX, e.clientY);
    setConnecting((prev) => (prev ? { ...prev, x: p.x, y: p.y } : prev));
  };

  const endConnect = (e: React.PointerEvent) => {
    if (!connecting) return;

    const p = canvasPoint(e.clientX, e.clientY);

    // find which input handle contains this point
    let targetNodeId: string | null = null;
    for (const [nodeId, el] of inputEls.current.entries()) {
      const rect = el.getBoundingClientRect();
      // convert rect to canvas space
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) continue;

      const left = rect.left - canvasRect.left;
      const top = rect.top - canvasRect.top;
      const right = left + rect.width;
      const bottom = top + rect.height;

      if (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) {
        targetNodeId = nodeId;
        break;
      }
    }

    if (targetNodeId) {
      addEdge(connecting.fromNodeId, targetNodeId);
    }

    setConnecting(null);
  };

  const addBlock = (type: BlockType) => {
    // Position new blocks in a staggered pattern
    const offset = nodes.length * 30;
    setNodes((prev) => [
      ...prev,
      makeNode(type, 100 + offset, 100 + offset),
    ]);
  };

  const deleteNode = (nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.from !== nodeId && e.to !== nodeId));
  };

  const removeConnection = (nodeId: string) => {
    // Remove edges connected to this node (either incoming or outgoing)
    setEdges((prev) => prev.filter((e) => e.from !== nodeId && e.to !== nodeId));
  };

  const clearConnections = () => setEdges([]);

  // edges drawn as SVG lines
  const edgeLines = useMemo(() => {
    return edges.map((e) => {
      const from = nodes.find((n) => n.id === e.from);
      const to = nodes.find((n) => n.id === e.to);
      if (!from || !to) return null;

      const a = nodeOutputPort(from, drag);
      const b = nodeInputPort(to, drag);

      return (
        <line
          key={e.id}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="#6366f1"
          strokeWidth={3}
          markerEnd="url(#arrowhead)"
          opacity={0.8}
          strokeLinecap="round"
        />
      );
    });
  }, [edges, nodes, drag]);

  // live preview line while dragging connector
  const previewLine = connecting ? (
    <line
      x1={connecting.startX}
      y1={connecting.startY}
      x2={connecting.x}
      y2={connecting.y}
      stroke="#10b981"
      strokeWidth={3}
      strokeDasharray="8 4"
      markerEnd="url(#arrowheadGreen)"
      opacity={0.9}
      strokeLinecap="round"
    />
  ) : null;

  // graph -> linear workflows (connected chains)
  const workflows: WorkflowDefinition[] = useMemo(() => {
    const outMap = new Map<string, string>();
    const inCount = new Map<string, number>();
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    edges.forEach((ed) => {
      outMap.set(ed.from, ed.to);
      inCount.set(ed.to, (inCount.get(ed.to) ?? 0) + 1);
      if (!inCount.has(ed.from)) inCount.set(ed.from, 0);
    });

    const heads: string[] = [];
    for (const id of nodeMap.keys()) {
      if (!inCount.has(id)) continue;
      if ((inCount.get(id) ?? 0) === 0) heads.push(id);
    }

    const result: WorkflowDefinition[] = [];
    heads.forEach((headId, idx) => {
      const blocks: WorkflowDefinition["blocks"] = [];
      let cur: string | undefined = headId;

      while (cur) {
        const node = nodeMap.get(cur);
        if (!node) break;
        blocks.push({ type: node.type, parameters: node.parameters });
        const next = outMap.get(cur);
        if (!next) break;
        cur = next;
      }

      if (blocks.length) {
        result.push({ name: `Workflow ${idx + 1}`, blocks });
      }
    });

    return result;
  }, [nodes, edges]);

  const blockTypes: BlockType[] = ['read_csv', 'lead_enrichment', 'filter', 'find_email', 'export_csv'];

  return (
    <div className="canvas-panel">
      <div className="canvas-toolbar">
        <div className="toolbar-left">
          <div className="block-palette">
            <p className="palette-label">Click to add blocks</p>
            <div className="palette-grid">
              {blockTypes.map((type) => (
                <BlockTemplate key={type} type={type} onClick={() => addBlock(type)} />
              ))}
            </div>
          </div>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-primary" onClick={() => onBuildWorkflows(workflows)}>
            Run workflows
          </button>
          <button className="btn btn-ghost" onClick={clearConnections}>
            Clear connections
          </button>
        </div>
      </div>

      <div
        ref={canvasRef}
        onPointerMove={updateConnect}
        onPointerUp={endConnect}
        className="canvas-surface"
      >
        {/* SVG arrows (connections) */}
        <svg
          width="100%"
          height="100%"
          className="canvas-svg"
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="5"
              refY="2.5"
              orient="auto"
            >
              <path d="M0,0 L5,2.5 L0,5 z" fill="#6366f1" opacity="0.8" />
            </marker>
            <marker
              id="arrowheadGreen"
              markerWidth="10"
              markerHeight="10"
              refX="5"
              refY="2.5"
              orient="auto"
            >
              <path d="M0,0 L5,2.5 L0,5 z" fill="#10b981" opacity="0.9" />
            </marker>
          </defs>

          {edgeLines}
          {previewLine}
        </svg>

        {/* blocks */}
        <DndContext
          sensors={sensors}
          onDragStart={(event) => {
            setDrag({ id: String(event.active.id), dx: 0, dy: 0 });
          }}
          onDragMove={(event) => {
            const id = String(event.active.id);
            setDrag({ id, dx: event.delta.x, dy: event.delta.y });
          }}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDrag(null)}
        >
          {nodes.map((node) => {
            const hasIncoming = edges.some((e) => e.to === node.id);
            const hasOutgoing = edges.some((e) => e.from === node.id);
            return (
              <DraggableBlock
                key={node.id}
                node={node}
                onUpdateParams={(params) =>
                  setNodes((prev) =>
                    prev.map((n) =>
                      n.id === node.id ? { ...n, parameters: params } : n
                    )
                  )
                }
                onDelete={deleteNode}
                onRemoveConnection={removeConnection}
                hasIncomingEdge={hasIncoming}
                hasOutgoingEdge={hasOutgoing}
                onStartConnect={startConnect}
                registerInputEl={(nodeId, el) => {
                  const map = inputEls.current;
                  if (el) {
                    map.set(nodeId, el);
                  } else {
                    map.delete(nodeId);
                  }
                }}
              />
            );
          })}
        </DndContext>
      </div>

      <div className="workflow-panel">
        <div className="workflow-panel__header">
          <h3>Computed workflows</h3>
          <span className="pill pill--soft">
            {workflows.length} {workflows.length === 1 ? "chain" : "chains"}
          </span>
        </div>
        {workflows.length === 0 && <div className="empty-state">No connected chains yet.</div>}
        {workflows.map((wf) => (
          <div key={wf.name} className="workflow-row">
            <div className="workflow-row__name">{wf.name}</div>
            <div className="workflow-row__path">
              {wf.blocks.map((b) => b.type).join(" -> ")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
