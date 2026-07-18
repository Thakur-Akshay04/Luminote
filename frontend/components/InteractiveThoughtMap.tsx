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

export default function InteractiveThoughtMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [nodes, setNodes] = useState<Node[]>([]);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);

  // Initialize node config details with scaled visual assets
  useEffect(() => {
    const initialNodes: Node[] = [
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
    setNodes(initialNodes);
  }, []);

  // Track container dimensions and center nodes with spacious offsets
  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;
    
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const w = rect.width || window.innerWidth;
        const h = rect.height || window.innerHeight;
        setDimensions({ width: w, height: h });

        setNodes((prev) => {
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

          return prev.map((node) => {
            const pos = positions[node.id];
            if (pos) {
              return {
                ...node,
                x: pos.x,
                y: pos.y,
                vx: 0,
                vy: 0,
              };
            }
            return node;
          });
        });
      }
    };

    updateDimensions();
    const timer = setTimeout(updateDimensions, 100);
    window.addEventListener("resize", updateDimensions);
    
    return () => {
      window.removeEventListener("resize", updateDimensions);
      clearTimeout(timer);
    };
  }, []);

  // Physics animation loop
  useEffect(() => {
    if (nodes.length === 0) return;

    let frameId: number;

    const updatePhysics = () => {
      setNodes((prevNodes) => {
        const mouse = mouseRef.current;
        const w = dimensions.width;
        const h = dimensions.height;
        const targetCenter = { x: w * 0.3, y: h * 0.5 };

        return prevNodes.map((node) => {
          let nx = node.x;
          let ny = node.y;
          let nvx = node.vx;
          let nvy = node.vy;

          if (node.id === "core") {
            nvx += (targetCenter.x - nx) * 0.03;
            nvy += (targetCenter.y - ny) * 0.03;
          } else {
            nvx += (Math.random() - 0.5) * 0.12;
            nvy += (Math.random() - 0.5) * 0.12;

            const core = prevNodes.find((n) => n.id === "core") || targetCenter;
            const dxCore = core.x - nx;
            const dyCore = core.y - ny;
            const distCore = Math.sqrt(dxCore * dxCore + dyCore * dyCore);
            
            // Expanded Orbit bounds to match larger sizes
            const minRadius = 160;
            const maxRadius = 260;
            if (distCore > maxRadius) {
              nvx += (dxCore / distCore) * 0.02;
              nvy += (dyCore / distCore) * 0.02;
            } else if (distCore < minRadius) {
              nvx -= (dxCore / distCore) * 0.02;
              nvy -= (dyCore / distCore) * 0.02;
            }
          }

          if (mouse && mouse.x < w * 0.5) {
            const dxMouse = mouse.x - nx;
            const dyMouse = mouse.y - ny;
            const distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);
            if (distMouse < 180 && distMouse > 0) {
              const pull = (1.0 - distMouse / 180) * 0.06;
              nvx += (dxMouse / distMouse) * pull;
              nvy += (dyMouse / distMouse) * pull;
            }
          }

          nx += nvx;
          ny += nvy;
          nvx *= 0.95;
          nvy *= 0.95;

          const margin = 50;
          if (nx < margin) { nx = margin; nvx *= -0.5; }
          if (nx > w - margin) { nx = w - margin; nvx *= -0.5; }
          if (ny < margin) { ny = margin; nvy *= -0.5; }
          if (ny > h - margin) { ny = h - margin; nvy *= -0.5; }

          return { ...node, x: nx, y: ny, vx: nvx, vy: nvy };
        });
      });

      frameId = requestAnimationFrame(updatePhysics);
    };

    frameId = requestAnimationFrame(updatePhysics);
    return () => cancelAnimationFrame(frameId);
  }, [dimensions]);

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

  const coreNode = nodes.find((n) => n.id === "core");

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
          nodes.map((node) => {
            if (node.id === "core") return null;
            const isHoveredLine = hoveredNodeId === node.id || hoveredNodeId === "core";
            return (
              <g key={`line-${node.id}`}>
                <line
                  x1={coreNode.x}
                  y1={coreNode.y}
                  x2={node.x}
                  y2={node.y}
                  stroke={isHoveredLine ? "url(#purple-cyan-glow)" : "rgba(255, 255, 255, 0.04)"}
                  strokeWidth={isHoveredLine ? 2.5 : 1}
                  className="transition-all duration-300"
                />
                {isHoveredLine && (
                  <>
                    <circle r="2.5" fill="#a855f7" opacity="0.9">
                      <animateMotion
                        path={`M ${coreNode.x} ${coreNode.y} L ${node.x} ${node.y}`}
                        dur="1.8s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle r="2" fill="#06b6d4" opacity="0.7">
                      <animateMotion
                        path={`M ${coreNode.x} ${coreNode.y} L ${node.x} ${node.y}`}
                        dur="2.8s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  </>
                )}
              </g>
            );
          })}
      </svg>

      {/* Nodes */}
      {nodes.map((node) => {
        const Icon = node.icon;
        const isHovered = hoveredNodeId === node.id;
        const isCore = node.id === "core";

        return (
          <div
            key={node.id}
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
              className={`absolute inset-[-4px] rounded-full border border-dashed transition-all duration-700 ${
                isHovered
                  ? "animate-spin-slow opacity-80 border-brand-400"
                  : "opacity-20 border-neutral-700"
              }`}
              style={{
                animationDuration: isHovered ? "8s" : "16s",
              }}
            />

            {/* Radar expand-and-fade ping on hover */}
            <div
              className={`absolute inset-0 rounded-full border border-brand-500/30 animate-ping opacity-0 ${
                isHovered ? "opacity-40" : ""
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
              className={`absolute inset-0 rounded-full transition-all duration-500 ${
                isHovered ? "scale-130 opacity-100" : "scale-100 opacity-0"
              }`}
              style={{
                background: `radial-gradient(circle, ${node.glowColor} 0%, transparent 75%)`,
              }}
            />

            {/* Obsidian Glass Circle Bubble */}
            <div
              className={`w-full h-full rounded-full bg-[#0a0a0c]/90 backdrop-blur-md border flex items-center justify-center transition-all duration-300 ${
                isHovered
                  ? `scale-110 shadow-2xl ${node.hoverBorder}`
                  : `border-white/[0.04] ${node.baseBorder}`
              }`}
            >
              <Icon
                className={`transition-all duration-300 ${
                  isHovered ? `${node.iconColor} scale-110` : `${node.baseIconColor}`
                }`}
                style={{
                  width: node.size * 0.42,
                  height: node.size * 0.42,
                }}
              />
            </div>

            {/* Node Label Tooltip */}
            <div
              className={`absolute top-[112%] left-1/2 -translate-x-1/2 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider whitespace-nowrap transition-all duration-300 pointer-events-none select-none ${
                isHovered
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
