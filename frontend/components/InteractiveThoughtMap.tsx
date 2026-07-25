"use client";

import React, { useEffect, useState, useRef } from "react";
import { Brain, AudioLines, Palette, FileText, Zap, Calendar, Bot } from "lucide-react";

interface Node {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  icon: React.ComponentType<any>;
  baseBorder: string;
  hoverBorder: string;
  iconColor: string;
  baseIconColor: string;
  glowColor: string;
}

// Cryptographically secure random float generator [0, 1)
const getRandom = (): number => {
  if (typeof window !== "undefined" && window.crypto) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return array[0] / 4294967296;
  }
  return 0.5;
};

function repositionNode(
  node: Node,
  positions: Record<string, { x: number; y: number }>
): void {
  const pos = positions[node.id];
  if (pos) {
    node.x = pos.x;
    node.y = pos.y;
    node.vx = 0;
    node.vy = 0;
  }
}

function applyPhysicsToNode(
  node: Node,
  mouse: { x: number; y: number } | null,
  dimensions: { width: number; height: number },
  nodes: Node[]
): void {
  const { width: w, height: h } = dimensions;
  const targetCenter = { x: w * 0.3, y: h * 0.5 };
  const margin = 50;

  if (node.id === "core") {
    node.vx += (targetCenter.x - node.x) * 0.03;
    node.vy += (targetCenter.y - node.y) * 0.03;
  } else {
    node.vx += (Math.random() - 0.5) * 0.12;
    node.vy += (Math.random() - 0.5) * 0.12;

    const core = nodes.find((n) => n.id === "core") || targetCenter;
    const dxCore = core.x - node.x;
    const dyCore = core.y - node.y;
    const distCore = Math.hypot(dxCore, dyCore);
    const minRadius = 160;
    const maxRadius = 260;

    if (distCore > maxRadius) {
      node.vx += (dxCore / distCore) * 0.02;
      node.vy += (dyCore / distCore) * 0.02;
    } else if (distCore < minRadius) {
      node.vx -= (dxCore / distCore) * 0.02;
      node.vy -= (dyCore / distCore) * 0.02;
    }
  }

  if (mouse && mouse.x < w * 0.5) {
    const dxMouse = mouse.x - node.x;
    const dyMouse = mouse.y - node.y;
    const distMouse = Math.hypot(dxMouse, dyMouse);
    if (distMouse < 180 && distMouse > 0) {
      const pull = (1.0 - distMouse / 180) * 0.06;
      node.vx += (dxMouse / distMouse) * pull;
      node.vy += (dyMouse / distMouse) * pull;
    }
  }

  node.x += node.vx;
  node.y += node.vy;
  node.vx *= 0.95;
  node.vy *= 0.95;

  if (node.x < margin) { node.x = margin; node.vx *= -0.5; }
  if (node.x > w - margin) { node.x = w - margin; node.vx *= -0.5; }
  if (node.y < margin) { node.y = margin; node.vy *= -0.5; }
  if (node.y > h - margin) { node.y = h - margin; node.vy *= -0.5; }
}

const INITIAL_NODES: Node[] = [
  {
    id: "core",
    name: "Luminote Hub",
    x: 250,
    y: 300,
    vx: 0,
    vy: 0,
    size: 78,
    icon: Brain,
    baseBorder: "border-purple-500/30",
    hoverBorder: "border-purple-400 shadow-[0_0_25px_rgba(168,85,247,0.4)]",
    baseIconColor: "text-purple-500/60",
    iconColor: "text-purple-300",
    glowColor: "rgba(168, 85, 247, 0.2)",
  },
  {
    id: "voice",
    name: "Voice Captures",
    x: 120,
    y: 180,
    vx: 0,
    vy: 0,
    size: 60,
    icon: AudioLines,
    baseBorder: "border-cyan-500/30",
    hoverBorder: "border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.4)]",
    baseIconColor: "text-cyan-500/60",
    iconColor: "text-cyan-300",
    glowColor: "rgba(6, 182, 212, 0.15)",
  },
  {
    id: "sketch",
    name: "Canvas Sketching",
    x: 380,
    y: 180,
    vx: 0,
    vy: 0,
    size: 60,
    icon: Palette,
    baseBorder: "border-pink-500/30",
    hoverBorder: "border-pink-400 shadow-[0_0_20px_rgba(219,39,119,0.4)]",
    baseIconColor: "text-pink-500/60",
    iconColor: "text-pink-300",
    glowColor: "rgba(219, 39, 119, 0.15)",
  },
  {
    id: "editor",
    name: "Markdown Notes",
    x: 120,
    y: 420,
    vx: 0,
    vy: 0,
    size: 60,
    icon: FileText,
    baseBorder: "border-indigo-500/30",
    hoverBorder: "border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.4)]",
    baseIconColor: "text-indigo-500/60",
    iconColor: "text-indigo-300",
    glowColor: "rgba(99, 102, 241, 0.15)",
  },
  {
    id: "tasks",
    name: "Sprint Tracks",
    x: 380,
    y: 420,
    vx: 0,
    vy: 0,
    size: 60,
    icon: Zap,
    baseBorder: "border-amber-500/30",
    hoverBorder: "border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.4)]",
    baseIconColor: "text-amber-500/60",
    iconColor: "text-amber-300",
    glowColor: "rgba(245, 158, 11, 0.15)",
  },
  {
    id: "calendar",
    name: "Calendar Sync",
    x: 250,
    y: 140,
    vx: 0,
    vy: 0,
    size: 64,
    icon: Calendar,
    baseBorder: "border-emerald-500/30",
    hoverBorder: "border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)]",
    baseIconColor: "text-emerald-500/60",
    iconColor: "text-emerald-300",
    glowColor: "rgba(16, 185, 129, 0.15)",
  },
  {
    id: "agent",
    name: "AI Agent",
    x: 250,
    y: 460,
    vx: 0,
    vy: 0,
    size: 64,
    icon: Bot,
    baseBorder: "border-fuchsia-500/30",
    hoverBorder: "border-fuchsia-400 shadow-[0_0_20px_rgba(217,70,239,0.4)]",
    baseIconColor: "text-fuchsia-500/60",
    iconColor: "text-fuchsia-300",
    glowColor: "rgba(217, 70, 239, 0.15)",
  },
];

export default function InteractiveThoughtMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lineRefs = useRef<Record<string, SVGLineElement | null>>({});

  const nodesRef = useRef<Node[]>(INITIAL_NODES);
  const dimensionsRef = useRef({ width: 800, height: 600 });
  const mouseRef = useRef<{ x: number; y: number } | null>(null);

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Resize and position calculation
  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    const updateDimensions = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const w = rect.width || window.innerWidth;
      const h = rect.height || window.innerHeight;
      dimensionsRef.current = { width: w, height: h };

      const center = { x: w * 0.3, y: h * 0.5 };
      const positions: Record<string, { x: number; y: number }> = {
        core: { x: center.x, y: center.y },
        voice: { x: center.x - 180, y: center.y - 140 },
        sketch: { x: center.x + 180, y: center.y - 130 },
        editor: { x: center.x - 190, y: center.y + 150 },
        tasks: { x: center.x + 190, y: center.y + 140 },
        calendar: { x: center.x, y: center.y - 210 },
        agent: { x: center.x, y: center.y + 210 },
      };

      nodesRef.current.forEach((node) => repositionNode(node, positions));
    };

    updateDimensions();
    const timer = setTimeout(updateDimensions, 100);
    window.addEventListener("resize", updateDimensions);

    return () => {
      window.removeEventListener("resize", updateDimensions);
      clearTimeout(timer);
    };
  }, []);

  // Optimized animation loop with zero React re-renders & zero heap allocations
  useEffect(() => {
    let frameId: number;

    const updatePhysics = () => {
      const currentNodes = nodesRef.current;
      const mouse = mouseRef.current;
      const dims = dimensionsRef.current;

      for (let i = 0; i < currentNodes.length; i++) {
        applyPhysicsToNode(currentNodes[i], mouse, dims, currentNodes);
      }

      // Direct DOM updates for 60fps performance without React re-renders
      const core = currentNodes.find((n) => n.id === "core");
      for (let i = 0; i < currentNodes.length; i++) {
        const node = currentNodes[i];
        const el = nodeRefs.current[node.id];
        if (el) {
          el.style.left = `${node.x}px`;
          el.style.top = `${node.y}px`;
        }
        if (core && node.id !== "core") {
          const lineEl = lineRefs.current[node.id];
          if (lineEl) {
            lineEl.setAttribute("x1", `${core.x}`);
            lineEl.setAttribute("y1", `${core.y}`);
            lineEl.setAttribute("x2", `${node.x}`);
            lineEl.setAttribute("y2", `${node.y}`);
          }
        }
      }

      frameId = requestAnimationFrame(updatePhysics);
    };

    frameId = requestAnimationFrame(updatePhysics);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouseRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseLeave = () => {
    mouseRef.current = null;
    setHoveredNodeId(null);
  };

  const coreNode = INITIAL_NODES.find((n) => n.id === "core");

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden flex items-center justify-center cursor-pointer select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Connected Lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <linearGradient id="purple-cyan-glow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.45" />
          </linearGradient>
        </defs>
        {coreNode &&
          INITIAL_NODES.map((node) => {
            if (node.id === "core") return null;
            const isHoveredLine = hoveredNodeId === node.id || hoveredNodeId === "core";
            return (
              <g key={`line-${node.id}`}>
                <line
                  ref={(el) => { lineRefs.current[node.id] = el; }}
                  x1={coreNode.x}
                  y1={coreNode.y}
                  x2={node.x}
                  y2={node.y}
                  stroke={isHoveredLine ? "url(#purple-cyan-glow)" : "rgba(255, 255, 255, 0.04)"}
                  strokeWidth={isHoveredLine ? 2.5 : 1}
                  className="transition-all duration-300"
                />
              </g>
            );
          })}
      </svg>

      {/* Nodes */}
      {INITIAL_NODES.map((node) => {
        const Icon = node.icon;
        const isHovered = hoveredNodeId === node.id;
        const isCore = node.id === "core";

        return (
          <div
            key={node.id}
            ref={(el) => { nodeRefs.current[node.id] = el; }}
            className="absolute pointer-events-auto transform -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center select-none"
            style={{
              left: node.x,
              top: node.y,
              width: node.size,
              height: node.size,
              zIndex: isCore ? 20 : 10,
            }}
            onMouseEnter={() => setHoveredNodeId(node.id)}
          >
            {/* Rotating outline ring */}
            <div
              className={`absolute inset-[-4px] rounded-full border border-dashed transition-all duration-700 ${isHovered
                ? "animate-spin-slow opacity-80 border-brand-400"
                : "opacity-20 border-neutral-700"
                }`}
              style={{
                animationDuration: isHovered ? "8s" : "16s",
              }}
            />

            {/* Radar expand-and-fade ping on hover */}
            <div
              className={`absolute inset-0 rounded-full border border-brand-500/30 animate-ping opacity-0 ${isHovered ? "opacity-40" : ""
                }`}
              style={{
                animationDuration: "2s",
              }}
            />

            {/* Hub specific rotating core element */}
            {isCore && (
              <div className="absolute inset-[-8px] rounded-full border border-dashed border-purple-500/25 animate-spin-slow" style={{ animationDuration: "24s" }} />
            )}

            {/* Pulsing back glow */}
            <div
              className={`absolute inset-0 rounded-full transition-all duration-500 ${isHovered ? "scale-130 opacity-100" : "scale-100 opacity-0"
                }`}
              style={{
                background: `radial-gradient(circle, ${node.glowColor} 0%, transparent 75%)`,
              }}
            />

            {/* Obsidian Glass Circle Bubble */}
            <div
              className={`w-full h-full rounded-full bg-[#0a0a0c]/90 backdrop-blur-md border flex items-center justify-center transition-all duration-300 ${isHovered
                ? `scale-110 shadow-2xl ${node.hoverBorder}`
                : `border-white/[0.04] ${node.baseBorder}`
                }`}
            >
              <Icon
                className={`transition-all duration-300 ${isHovered ? `${node.iconColor} scale-110` : `${node.baseIconColor}`
                  }`}
                style={{
                  width: node.size * 0.42,
                  height: node.size * 0.42,
                }}
              />
            </div>

            {/* Node Label Tooltip */}
            <div
              className={`absolute top-[112%] left-1/2 -translate-x-1/2 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider whitespace-nowrap transition-all duration-300 pointer-events-none select-none ${isHovered
                ? "text-white bg-[#0c0c0e]/90 border border-white/[0.1] shadow-2xl scale-105"
                : "text-neutral-500/70 bg-transparent border border-transparent scale-100"
                }`}
            >
              {node.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
