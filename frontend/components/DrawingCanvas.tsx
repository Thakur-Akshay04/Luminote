"use client";

/**
 * Feature 1 — Freehand Drawing Canvas
 *
 * Uses Fabric.js for canvas rendering with:
 * - Pen tool, eraser tool, color picker (hex + presets), stroke size slider (1–20px)
 * - Undo via stroke history stack — O(1) pop per undo
 * - Clear all, save button with loading spinner
 * - Responsive: fills editor width, fixed 400px height
 * - Loads existing drawing on mount for continued editing
 */

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { notesApi } from "@/lib/api";
import {
  Pen,
  Eraser,
  Undo2,
  Trash2,
  Save,
  Loader2,
  Palette,
  Check,
} from "lucide-react";

const PRESET_COLORS = [
  "#f4f4f5", // white
  "#ef4444", // red
  "#f59e0b", // amber
  "#22c55e", // green
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#09090b", // black
];

export interface DrawingCanvasRef {
  save: () => Promise<void>;
}

interface DrawingCanvasProps {
  noteId: string;
  mediaUrl: string | null;
  onDrawingSave?: (mediaUrl: string) => void;
}

const DrawingCanvas = forwardRef<DrawingCanvasRef, DrawingCanvasProps>(
  ({ noteId, mediaUrl, onDrawingSave }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    // Undo stack: stores Fabric path objects — O(1) push/pop
    const strokeHistory = useRef<any[]>([]);

    const [tool, setTool] = useState<"pen" | "eraser">("pen");
    const [color, setColor] = useState("#f4f4f5");
    const [hexInput, setHexInput] = useState("#f4f4f5");
    const [strokeSize, setStrokeSize] = useState(3);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [showColorPicker, setShowColorPicker] = useState(false);

    useImperativeHandle(ref, () => ({
      save: handleSave,
    }));

    // Initialize Fabric.js canvas
    useEffect(() => {
      let mounted = true;

      const initCanvas = async () => {
        if (!canvasRef.current || fabricRef.current) return;

        const fabricModule = await import("fabric");
        const fabric = fabricModule;

        if (!mounted || !canvasRef.current) return;

        const container = containerRef.current;
        const width = container ? container.clientWidth : 800;

        const canvas = new fabric.Canvas(canvasRef.current, {
          width,
          height: 400,
          backgroundColor: "#18181b",
          isDrawingMode: true,
        });

        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.color = color;
        canvas.freeDrawingBrush.width = strokeSize;

        // Track each stroke for undo — O(1) push per path:created event
        canvas.on("path:created", (e: any) => {
          if (e.path) {
            strokeHistory.current.push(e.path);
          }
        });

        fabricRef.current = canvas;

        // Load existing drawing if available
        if (mediaUrl) {
          try {
            const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            const imgUrl = `${baseUrl}${mediaUrl}?t=${Date.now()}`;
            const imgEl = new Image();
            imgEl.crossOrigin = "anonymous";
            imgEl.src = imgUrl;
            imgEl.onload = () => {
              if (!fabricRef.current) return;
              const fImg = new fabric.FabricImage(imgEl, {
                left: 0,
                top: 0,
                selectable: false,
                evented: false,
              });
              // Scale to fit canvas
              const scaleX = canvas.width! / imgEl.width;
              const scaleY = canvas.height! / imgEl.height;
              const scale = Math.min(scaleX, scaleY);
              fImg.scale(scale);
              canvas.add(fImg);
              canvas.sendObjectToBack(fImg);
              canvas.renderAll();
            };
          } catch {
            // Silently handle load failure — user can draw fresh
          }
        }
      };

      initCanvas();

      return () => {
        mounted = false;
        if (fabricRef.current) {
          fabricRef.current.dispose();
          fabricRef.current = null;
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Handle window resize
    useEffect(() => {
      const handleResize = () => {
        if (!fabricRef.current || !containerRef.current) return;
        const width = containerRef.current.clientWidth;
        fabricRef.current.setWidth(width);
        fabricRef.current.renderAll();
      };
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }, []);

    // Update brush settings when tool/color/size changes
    useEffect(() => {
      if (!fabricRef.current) return;
      const canvas = fabricRef.current;

      if (tool === "eraser") {
        canvas.freeDrawingBrush.color = "#18181b"; // match background
        canvas.freeDrawingBrush.width = strokeSize * 3;
      } else {
        canvas.freeDrawingBrush.color = color;
        canvas.freeDrawingBrush.width = strokeSize;
      }
    }, [tool, color, strokeSize]);

    // Undo last stroke — O(1) pop from stack
    const handleUndo = useCallback(() => {
      if (!fabricRef.current || strokeHistory.current.length === 0) return;
      const lastPath = strokeHistory.current.pop();
      fabricRef.current.remove(lastPath);
      fabricRef.current.renderAll();
    }, []);

    // Clear all strokes
    const handleClear = useCallback(() => {
      if (!fabricRef.current) return;
      fabricRef.current.clear();
      fabricRef.current.backgroundColor = "#18181b";
      fabricRef.current.renderAll();
      strokeHistory.current = [];
    }, []);

    // Save drawing as base64 PNG
    const handleSave = useCallback(async () => {
      if (!fabricRef.current) return;
      setSaving(true);
      setMessage(null);

      try {
        const dataUrl = fabricRef.current.toDataURL({
          format: "png",
          quality: 1,
          multiplier: 1,
        });
        const res = await notesApi.saveDrawing(noteId, dataUrl);
        setMessage({ type: "success", text: "Drawing saved" });
        setTimeout(() => setMessage(null), 3000);
        if (onDrawingSave) {
          onDrawingSave(res.data.media_url);
        }
      } catch {
        setMessage({ type: "error", text: "Failed to save drawing — please try again" });
      } finally {
        setSaving(false);
      }
    }, [noteId, onDrawingSave]);

    const handleColorSelect = (c: string) => {
      setColor(c);
      setHexInput(c);
      setTool("pen");
    };

  const handleHexSubmit = () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hexInput)) {
      setColor(hexInput);
      setTool("pen");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-surface-raised border border-border-muted rounded-xs">
        {/* Pen tool */}
        <button
          onClick={() => setTool("pen")}
          className={`p-2 rounded-xs transition-colors ${
            tool === "pen"
              ? "bg-brand-500/20 border border-brand-500/40 text-brand-300"
              : "text-text-secondary hover:bg-surface-strong"
          }`}
          title="Pen tool"
          aria-label="Pen tool"
          id="drawing-pen-btn"
        >
          <Pen className="w-4 h-4" />
        </button>

        {/* Eraser */}
        <button
          onClick={() => setTool("eraser")}
          className={`p-2 rounded-xs transition-colors ${
            tool === "eraser"
              ? "bg-brand-500/20 border border-brand-500/40 text-brand-300"
              : "text-text-secondary hover:bg-surface-strong"
          }`}
          title="Eraser"
          aria-label="Eraser tool"
          id="drawing-eraser-btn"
        >
          <Eraser className="w-4 h-4" />
        </button>

        <div className="h-5 w-px bg-border-muted" />

        {/* Color picker */}
        <div className="relative">
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="p-2 rounded-xs text-text-secondary hover:bg-surface-strong transition-colors flex items-center gap-1.5"
            title="Color picker"
            aria-label="Color picker"
            id="drawing-color-btn"
          >
            <Palette className="w-4 h-4" />
            <div
              className="w-4 h-4 rounded-full border border-white/20"
              style={{ backgroundColor: color }}
            />
          </button>

          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 p-3 bg-surface-raised border border-border-muted rounded-xs shadow-lg z-50 min-w-[200px]">
              {/* Preset colors */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      handleColorSelect(c);
                      setShowColorPicker(false);
                    }}
                    className="w-7 h-7 rounded-full border border-white/10 hover:scale-110 transition-transform relative"
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                  >
                    {c === color && (
                      <Check className="w-3 h-3 absolute inset-0 m-auto text-white drop-shadow-md" />
                    )}
                  </button>
                ))}
              </div>
              {/* Hex input */}
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={hexInput}
                  onChange={(e) => setHexInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleHexSubmit();
                      setShowColorPicker(false);
                    }
                  }}
                  placeholder="#ffffff"
                  className="input text-xs py-1.5 px-2 flex-1"
                  maxLength={7}
                  aria-label="Hex color input"
                  id="drawing-hex-input"
                />
                <button
                  onClick={() => {
                    handleHexSubmit();
                    setShowColorPicker(false);
                  }}
                  className="btn-secondary px-2 py-1 text-xs"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="h-5 w-px bg-border-muted" />

        {/* Stroke size slider */}
        <div className="flex items-center gap-2">
          <label htmlFor="stroke-size" className="text-xs text-text-tertiary">
            {strokeSize}px
          </label>
          <input
            id="stroke-size"
            type="range"
            min={1}
            max={20}
            value={strokeSize}
            onChange={(e) => setStrokeSize(Number(e.target.value))}
            className="w-20 accent-brand-500"
            aria-label="Stroke size"
          />
        </div>

        <div className="h-5 w-px bg-border-muted" />

        {/* Undo */}
        <button
          onClick={handleUndo}
          className="p-2 rounded-xs text-text-secondary hover:bg-surface-strong transition-colors"
          title="Undo last stroke"
          aria-label="Undo last stroke"
          id="drawing-undo-btn"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        {/* Clear */}
        <button
          onClick={handleClear}
          className="p-2 rounded-xs text-red-400 hover:bg-red-950/20 transition-colors"
          title="Clear all"
          aria-label="Clear all"
          id="drawing-clear-btn"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <div className="flex-1" />

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary px-3 py-1.5 text-xs"
          id="drawing-save-btn"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Drawing
        </button>
      </div>

      {/* Status message */}
      {message && (
        <div
          className={`px-3 py-2 rounded-xs text-xs font-medium animate-fade-in ${
            message.type === "success"
              ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
              : "bg-red-500/10 border border-red-500/20 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="w-full rounded-xs overflow-hidden border border-border-muted"
      >
        <canvas ref={canvasRef} id="drawing-canvas" />
      </div>
    </div>
  );
});

DrawingCanvas.displayName = "DrawingCanvas";
export default DrawingCanvas;
