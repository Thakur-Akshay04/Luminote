"use client";

/**
 * Feature 1 — Freehand Drawing Canvas (Reconstructed from Scratch)
 *
 * Uses standard HTML5 2D Canvas API for robust rendering, touch compatibility,
 * and memory efficiency (removing Fabric.js overhead).
 */

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { notesApi } from "@/lib/api";
import {
  Pen,
  Eraser,
  Undo2,
  Trash2,
  Loader2,
  Palette,
  Check,
  Brush,
  Highlighter,
  Sparkles,
  Minus,
  Square,
  Circle,
  Type,
  PaintBucket,
} from "lucide-react";

const PRESET_COLORS = [
  "#ffffff", // white
  "#ef4444", // red
  "#f59e0b", // amber
  "#22c55e", // green
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#000000", // black
];

const HIGHLIGHTER_COLORS = ["#FFFF00", "#00FFFF", "#00FF00", "#FF69B4"];

// O(1) hex to rgba conversion
function hexToRgba(hex: string, alpha: number) {
  const cleanHex = hex.startsWith("#") ? hex : "#" + hex;
  const r = parseInt(cleanHex.slice(1, 3), 16);
  const g = parseInt(cleanHex.slice(3, 5), 16);
  const b = parseInt(cleanHex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// O(1) hex to rgb bytes helper for flood fill
function hexToRgbaBytes(hex: string) {
  const cleanHex = hex.startsWith("#") ? hex : "#" + hex;
  let r = 0, g = 0, b = 0, a = 255;
  if (cleanHex.length === 7) {
    r = parseInt(cleanHex.slice(1, 3), 16);
    g = parseInt(cleanHex.slice(3, 5), 16);
    b = parseInt(cleanHex.slice(5, 7), 16);
  } else if (cleanHex.length === 4) {
    r = parseInt(cleanHex[1] + cleanHex[1], 16);
    g = parseInt(cleanHex[2] + cleanHex[2], 16);
    b = parseInt(cleanHex[3] + cleanHex[3], 16);
  }
  return [r, g, b, a];
}

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
    const contextRef = useRef<CanvasRenderingContext2D | null>(null);
    const undoStack = useRef<string[]>([]);
    const [isDrawing, setIsDrawing] = useState(false);

    const [tool, setTool] = useState<
      "pen" | "marker" | "highlighter" | "spray" | "eraser" | "line" | "rect" | "circle" | "text" | "fill"
    >("pen");
    const [color, setColor] = useState("#000000");
    const [hexInput, setHexInput] = useState("#000000");
    const [strokeSize, setStrokeSize] = useState(3);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [showColorPicker, setShowColorPicker] = useState(false);

    // New states and refs for extra drawing tools
    const [sprayDensity, setSprayDensity] = useState(20);
    const [fontSize, setFontSize] = useState(18);
    const [textInputStyle, setTextInputStyle] = useState<{ x: number; y: number } | null>(null);
    const [textValue, setTextValue] = useState("");

    const dragStartCoordsRef = useRef<{ x: number; y: number } | null>(null);
    const savedCanvasStateRef = useRef<ImageData | null>(null);
    const strokePointsRef = useRef<{ x: number; y: number }[]>([]);
    const textInputStyleRef = useRef<{ x: number; y: number } | null>(null);
    const textValueRef = useRef("");
    const textInputRef = useRef<HTMLTextAreaElement>(null);

    // Drawing Versioning State
    const [versions, setVersions] = useState<string[]>([]);
    const [currentVersionUrl, setCurrentVersionUrl] = useState<string | null>(mediaUrl);
    const [switchVersionTarget, setSwitchVersionTarget] = useState<number | null>(null);
    const [deleteVersionTarget, setDeleteVersionTarget] = useState<number | null>(null);
    const [switching, setSwitching] = useState(false);
    const [deletingVersion, setDeletingVersion] = useState(false);

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    useImperativeHandle(ref, () => ({
      save: handleSave,
    }));

    const fetchVersions = useCallback(async () => {
      try {
        const res = await notesApi.getDrawing(noteId);
        if (res.data.versions) {
          setVersions(res.data.versions);
        }
        if (res.data.media_url) {
          setCurrentVersionUrl(res.data.media_url);
        }
      } catch (err) {
        console.error("Failed to fetch drawing versions:", err);
      }
    }, [noteId]);

    // Clear canvas and fill with background color
    const clearCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = contextRef.current;
      if (!canvas || !ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }, []);

    // Load existing drawing version on canvas
    const loadDrawingFromUrl = useCallback(
      async (url: string) => {
        const canvas = canvasRef.current;
        const ctx = contextRef.current;
        if (!canvas || !ctx) return;

        const imgUrl = `${baseUrl}${url}?t=${Date.now()}`;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imgUrl;
        img.onload = () => {
          clearCanvas();
          // Draw image keeping correct scaling
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          // Push initial loaded state to undo stack
          undoStack.current = [canvas.toDataURL()];
        };
        img.onerror = () => {
          console.error("Failed to load background image:", imgUrl);
          clearCanvas();
          undoStack.current = [canvas.toDataURL()];
        };
      },
      [baseUrl, clearCanvas]
    );

    // Resize handler to match container client dimensions exactly
    const handleResize = useCallback(() => {
      const canvas = canvasRef.current;
      const container = canvas?.parentElement;
      if (!canvas || !container) return;

      const width = container.clientWidth;
      const height = container.clientHeight;

      if (canvas.width === width && canvas.height === height) return;

      // Save current state
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext("2d");
      if (tempCtx && canvas.width > 0 && canvas.height > 0) {
        tempCtx.drawImage(canvas, 0, 0);
      }

      // Resize canvas to fill container
      canvas.width = width;
      canvas.height = height;

      // Re-configure context
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        contextRef.current = ctx;

        // Fill background
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);

        // Draw back saved content
        if (tempCanvas.width > 0 && tempCanvas.height > 0) {
          ctx.drawImage(tempCanvas, 0, 0, width, height);
        }
      }
    }, []);

    const finalizeText = useCallback(() => {
      const coords = textInputStyleRef.current;
      const value = textValueRef.current;
      const canvas = canvasRef.current;
      const ctx = contextRef.current;
      if (coords && canvas && ctx && value.trim() !== "") {
        if (undoStack.current.length >= 50) {
          undoStack.current.shift();
        }
        undoStack.current.push(canvas.toDataURL());

        ctx.font = `${fontSize}px Inter, sans-serif`;
        ctx.fillStyle = color;
        ctx.textBaseline = "top";
        const lines = value.split("\n");
        lines.forEach((line, i) => {
          ctx.fillText(line, coords.x, coords.y + i * fontSize * 1.2);
        });
      }
      setTextInputStyle(null);
      setTextValue("");
    }, [fontSize, color]);

    // Keep refs in sync
    useEffect(() => {
      textValueRef.current = textValue;
    }, [textValue]);

    useEffect(() => {
      textInputStyleRef.current = textInputStyle;
    }, [textInputStyle]);

    // Flood fill algorithm
    const floodFill = useCallback((
      ctx: CanvasRenderingContext2D,
      startX: number,
      startY: number,
      fillColor: string
    ) => {
      const canvas = ctx.canvas;
      const width = canvas.width;
      const height = canvas.height;
      const sx = Math.floor(startX);
      const sy = Math.floor(startY);

      if (sx < 0 || sx >= width || sy < 0 || sy >= height) return;

      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      const fillPixel = hexToRgbaBytes(fillColor);
      const fr = fillPixel[0];
      const fg = fillPixel[1];
      const fb = fillPixel[2];
      const fa = fillPixel[3];

      const startPos = (sy * width + sx) * 4;
      const sr = data[startPos];
      const sg = data[startPos + 1];
      const sb = data[startPos + 2];
      const sa = data[startPos + 3];

      if (sr === fr && sg === fg && sb === fb && sa === fa) {
        return;
      }

      const queue: [number, number][] = [[sx, sy]];
      const visited = new Uint8Array(width * height);
      visited[sy * width + sx] = 1;

      while (queue.length > 0) {
        const current = queue.pop();
        if (!current) continue;
        const [x, y] = current;

        const idx = y * width + x;
        const pos = idx * 4;

        // Fill pixel
        data[pos] = fr;
        data[pos + 1] = fg;
        data[pos + 2] = fb;
        data[pos + 3] = fa;

        const neighbors = [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1]
        ];

        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nidx = ny * width + nx;
            if (!visited[nidx]) {
              const npos = nidx * 4;
              if (
                data[npos] === sr &&
                data[npos + 1] === sg &&
                data[npos + 2] === sb &&
                data[npos + 3] === sa
              ) {
                visited[nidx] = 1;
                queue.push([nx, ny]);
              }
            }
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
    }, []);

    // Initialize Canvas on mount and set listeners
    useEffect(() => {
      const canvas = canvasRef.current;
      const container = canvas?.parentElement;
      if (!canvas || !container) return;

      // Initial size matching container exactly
      canvas.width = container.clientWidth || 800;
      canvas.height = container.clientHeight || 500;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        contextRef.current = ctx;
      }

      if (currentVersionUrl) {
        loadDrawingFromUrl(currentVersionUrl);
      } else {
        clearCanvas();
        undoStack.current = [canvas.toDataURL()];
      }

      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }, [currentVersionUrl, loadDrawingFromUrl, clearCanvas, handleResize]);

    useEffect(() => {
      fetchVersions();
    }, [fetchVersions]);

    useEffect(() => {
      setCurrentVersionUrl(mediaUrl);
    }, [mediaUrl]);

    // Handle version switches
    const handleSwitchConfirm = async () => {
      if (switchVersionTarget === null) return;
      setSwitching(true);
      try {
        const res = await notesApi.switchDrawingVersion(noteId, switchVersionTarget);
        if (res.data.media_url) {
          setCurrentVersionUrl(res.data.media_url);
          loadDrawingFromUrl(res.data.media_url);
          if (onDrawingSave) {
            onDrawingSave(res.data.media_url);
          }
        }
        if (res.data.versions) {
          setVersions(res.data.versions);
        }
        setSwitchVersionTarget(null);
      } catch (err) {
        console.error("Failed to switch version:", err);
        setMessage({ type: "error", text: "Failed to switch version" });
        setTimeout(() => setMessage(null), 3000);
      } finally {
        setSwitching(false);
      }
    };

    // Handle version deletes
    const handleDeleteConfirm = async () => {
      if (deleteVersionTarget === null) return;
      setDeletingVersion(true);
      try {
        const res = await notesApi.deleteDrawingVersion(noteId, deleteVersionTarget);
        setVersions(res.data.versions || []);

        const newActiveUrl = res.data.media_url;
        setCurrentVersionUrl(newActiveUrl);

        if (newActiveUrl) {
          loadDrawingFromUrl(newActiveUrl);
          if (onDrawingSave) {
            onDrawingSave(newActiveUrl);
          }
        } else {
          clearCanvas();
          undoStack.current = [canvasRef.current?.toDataURL() || ""];
          if (onDrawingSave) {
            onDrawingSave("");
          }
        }
        setDeleteVersionTarget(null);
      } catch (err) {
        console.error("Failed to delete version:", err);
        setMessage({ type: "error", text: "Failed to delete version" });
        setTimeout(() => setMessage(null), 3000);
      } finally {
        setDeletingVersion(false);
      }
    };

    // Get coordinates relative to canvas bounding box
    const getCoords = (
      e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
    ) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      let clientX = 0;
      let clientY = 0;

      if ("touches" in e) {
        if (e.touches.length === 0) return null;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    };

    const spray = useCallback((
      ctx: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      sprayColor: string,
      density: number
    ) => {
      const radius = 15; // 30px width / 2
      ctx.fillStyle = sprayColor;
      for (let i = 0; i < density; i++) {
        const r = Math.random() * radius;
        const theta = Math.random() * 2 * Math.PI;
        const x = cx + r * Math.cos(theta);
        const y = cy + r * Math.sin(theta);
        ctx.fillRect(x, y, 1, 1);
      }
    }, []);

    // Start drawing
    const startDrawing = (
      e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
    ) => {
      const coords = getCoords(e);
      const ctx = contextRef.current;
      const canvas = canvasRef.current;
      if (!coords || !ctx || !canvas) return;

      // Handle Text tool click placement
      if (tool === "text") {
        const hadActiveText = textInputStyleRef.current !== null;
        if (hadActiveText) {
          finalizeText();
        }
        
        // Push state before placing new text
        if (undoStack.current.length >= 50) {
          undoStack.current.shift();
        }
        undoStack.current.push(canvas.toDataURL());

        setTextInputStyle({ x: coords.x, y: coords.y });
        textInputStyleRef.current = { x: coords.x, y: coords.y };
        setTextValue("");
        textValueRef.current = "";

        setTimeout(() => {
          textInputRef.current?.focus();
        }, 50);
        return;
      }

      // Handle Paint Bucket Fill tool
      if (tool === "fill") {
        if (undoStack.current.length >= 50) {
          undoStack.current.shift();
        }
        undoStack.current.push(canvas.toDataURL());

        floodFill(ctx, coords.x, coords.y, color);
        return;
      }

      // Push current state to undo stack before starting the new drawing
      if (undoStack.current.length >= 50) {
        undoStack.current.shift(); // Limit stack size to 50
      }
      undoStack.current.push(canvas.toDataURL());

      // Save canvas state for live previews
      if (
        tool === "line" ||
        tool === "rect" ||
        tool === "circle" ||
        tool === "marker" ||
        tool === "highlighter"
      ) {
        savedCanvasStateRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }

      dragStartCoordsRef.current = coords;
      setIsDrawing(true);

      if (tool === "pen" || tool === "eraser") {
        ctx.beginPath();
        ctx.moveTo(coords.x, coords.y);

        if (tool === "eraser") {
          ctx.strokeStyle = "#ffffff"; // matches background color (white)
          ctx.lineWidth = strokeSize * 3;
        } else {
          ctx.strokeStyle = color;
          ctx.lineWidth = strokeSize;
        }
      } else if (tool === "marker" || tool === "highlighter") {
        strokePointsRef.current = [coords];
      } else if (tool === "spray") {
        spray(ctx, coords.x, coords.y, color, sprayDensity);
      }

      e.preventDefault();
    };

    // Draw lines/shapes
    const draw = (
      e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
    ) => {
      if (!isDrawing) return;
      const coords = getCoords(e);
      const ctx = contextRef.current;
      if (!coords || !ctx) return;

      const start = dragStartCoordsRef.current;

      // Restore saved canvas state for tools with live preview to clear previous preview frame
      if (
        tool === "line" ||
        tool === "rect" ||
        tool === "circle" ||
        tool === "marker" ||
        tool === "highlighter"
      ) {
        if (savedCanvasStateRef.current) {
          ctx.putImageData(savedCanvasStateRef.current, 0, 0);
        }
      }

      if (tool === "pen" || tool === "eraser") {
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
      } else if (tool === "marker" || tool === "highlighter") {
        strokePointsRef.current.push(coords);
        ctx.beginPath();
        ctx.moveTo(strokePointsRef.current[0].x, strokePointsRef.current[0].y);
        for (let i = 1; i < strokePointsRef.current.length; i++) {
          ctx.lineTo(strokePointsRef.current[i].x, strokePointsRef.current[i].y);
        }
        ctx.strokeStyle = tool === "marker" ? hexToRgba(color, 0.4) : hexToRgba(color, 0.25);
        ctx.lineWidth = tool === "marker" ? 18 : 28;
        ctx.stroke();
      } else if (tool === "spray") {
        spray(ctx, coords.x, coords.y, color, sprayDensity);
      } else if (tool === "line" && start) {
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(coords.x, coords.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeSize;
        ctx.stroke();
      } else if (tool === "rect" && start) {
        const x = Math.min(start.x, coords.x);
        const y = Math.min(start.y, coords.y);
        const w = Math.abs(coords.x - start.x);
        const h = Math.abs(coords.y - start.y);
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeSize;
        ctx.stroke();
      } else if (tool === "circle" && start) {
        const centerX = (start.x + coords.x) / 2;
        const centerY = (start.y + coords.y) / 2;
        const rx = Math.abs(coords.x - start.x) / 2;
        const ry = Math.abs(coords.y - start.y) / 2;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, rx, ry, 0, 0, 2 * Math.PI);
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeSize;
        ctx.stroke();
      }

      e.preventDefault();
    };

    // Stop drawing
    const stopDrawing = () => {
      if (!isDrawing) return;
      setIsDrawing(false);

      if (tool === "pen" || tool === "eraser") {
        contextRef.current?.closePath();
      }

      dragStartCoordsRef.current = null;
      savedCanvasStateRef.current = null;
      strokePointsRef.current = [];
    };

    // Undo action
    const handleUndo = () => {
      const canvas = canvasRef.current;
      const ctx = contextRef.current;
      if (!canvas || !ctx || undoStack.current.length === 0) return;

      const previousState = undoStack.current.pop();
      if (!previousState) return;

      const img = new Image();
      img.src = previousState;
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
    };

    // Clear canvas
    const handleClear = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      undoStack.current.push(canvas.toDataURL());
      clearCanvas();
    };

    // Save drawing to DB
    const handleSave = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setSaving(true);
      setMessage(null);

      try {
        const dataUrl = canvas.toDataURL("image/png");
        const res = await notesApi.saveDrawing(noteId, dataUrl);
        setMessage({ type: "success", text: "Drawing saved successfully" });
        setTimeout(() => setMessage(null), 3000);
        if (res.data.media_url) {
          setCurrentVersionUrl(res.data.media_url);
        }
        if (res.data.versions) {
          setVersions(res.data.versions);
        }
        if (onDrawingSave && res.data.media_url) {
          onDrawingSave(res.data.media_url);
        }
      } catch {
        setMessage({ type: "error", text: "Failed to save drawing — please try again" });
      } finally {
        setSaving(false);
      }
    };

    const handleToolChange = (newTool: typeof tool) => {
      // Finalize text if active
      if (textInputStyleRef.current) {
        finalizeText();
      }
      setTool(newTool);

      // Default color handling for Highlighter
      if (newTool === "highlighter") {
        if (!HIGHLIGHTER_COLORS.includes(color.toUpperCase())) {
          setColor("#FFFF00");
          setHexInput("#FFFF00");
        }
      }
    };

    const handleColorSelect = (c: string) => {
      setColor(c);
      setHexInput(c);
      if (tool === "eraser") {
        setTool("pen");
      }
    };

    const handleHexSubmit = () => {
      if (/^#[0-9a-fA-F]{6}$/.test(hexInput)) {
        setColor(hexInput);
        if (tool === "eraser") {
          setTool("pen");
        }
      }
    };

    return (
      <div className="flex flex-col h-full overflow-hidden gap-3 text-text-primary">
        {/* Toolbar aligned to match D layout.png */}
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-surface-raised border border-border-muted rounded-xs select-none">
          {/* Tool Selector Section (Grid format) */}
          <div className="flex flex-col gap-1.5 pr-3 border-r border-border-muted">
            {/* Row 1 */}
            <div className="flex items-center gap-1.5">
              {/* Pencil */}
              <button
                onClick={() => handleToolChange("pen")}
                className={`p-2 rounded-xs transition-colors ${
                  tool === "pen"
                    ? "bg-[#e31c5f] text-white border border-[#e31c5f]"
                    : "text-text-secondary hover:bg-surface-strong"
                }`}
                title="Pencil tool"
                aria-label="Pencil tool"
                id="drawing-pen-btn"
              >
                <Pen className="w-4 h-4" />
              </button>

              {/* Marker */}
              <button
                onClick={() => handleToolChange("marker")}
                className={`p-2 rounded-xs transition-colors ${
                  tool === "marker"
                    ? "bg-[#e31c5f] text-white border border-[#e31c5f]"
                    : "text-text-secondary hover:bg-surface-strong"
                }`}
                title="Marker tool"
                aria-label="Marker tool"
                id="drawing-marker-btn"
              >
                <Brush className="w-4 h-4" />
              </button>

              {/* Highlighter */}
              <button
                onClick={() => handleToolChange("highlighter")}
                className={`p-2 rounded-xs transition-colors ${
                  tool === "highlighter"
                    ? "bg-[#e31c5f] text-white border border-[#e31c5f]"
                    : "text-text-secondary hover:bg-surface-strong"
                }`}
                title="Highlighter tool"
                aria-label="Highlighter tool"
                id="drawing-highlighter-btn"
              >
                <Highlighter className="w-4 h-4" />
              </button>

              {/* Spray */}
              <button
                onClick={() => handleToolChange("spray")}
                className={`p-2 rounded-xs transition-colors ${
                  tool === "spray"
                    ? "bg-[#e31c5f] text-white border border-[#e31c5f]"
                    : "text-text-secondary hover:bg-surface-strong"
                }`}
                title="Spray tool"
                aria-label="Spray tool"
                id="drawing-spray-btn"
              >
                <Sparkles className="w-4 h-4" />
              </button>

              {/* Eraser */}
              <button
                onClick={() => handleToolChange("eraser")}
                className={`p-2 rounded-xs transition-colors ${
                  tool === "eraser"
                    ? "bg-[#e31c5f] text-white border border-[#e31c5f]"
                    : "text-text-secondary hover:bg-surface-strong"
                }`}
                title="Eraser tool"
                aria-label="Eraser tool"
                id="drawing-eraser-btn"
              >
                <Eraser className="w-4 h-4" />
              </button>
            </div>

            {/* Row 2 */}
            <div className="flex items-center gap-1.5">
              {/* Line */}
              <button
                onClick={() => handleToolChange("line")}
                className={`p-2 rounded-xs transition-colors ${
                  tool === "line"
                    ? "bg-[#e31c5f] text-white border border-[#e31c5f]"
                    : "text-text-secondary hover:bg-surface-strong"
                }`}
                title="Line tool"
                aria-label="Line tool"
                id="drawing-line-btn"
              >
                <Minus className="w-4 h-4" />
              </button>

              {/* Rectangle */}
              <button
                onClick={() => handleToolChange("rect")}
                className={`p-2 rounded-xs transition-colors ${
                  tool === "rect"
                    ? "bg-[#e31c5f] text-white border border-[#e31c5f]"
                    : "text-text-secondary hover:bg-surface-strong"
                }`}
                title="Rectangle tool"
                aria-label="Rectangle tool"
                id="drawing-rect-btn"
              >
                <Square className="w-4 h-4" />
              </button>

              {/* Circle */}
              <button
                onClick={() => handleToolChange("circle")}
                className={`p-2 rounded-xs transition-colors ${
                  tool === "circle"
                    ? "bg-[#e31c5f] text-white border border-[#e31c5f]"
                    : "text-text-secondary hover:bg-surface-strong"
                }`}
                title="Circle tool"
                aria-label="Circle tool"
                id="drawing-circle-btn"
              >
                <Circle className="w-4 h-4" />
              </button>

              {/* Text */}
              <button
                onClick={() => handleToolChange("text")}
                className={`p-2 rounded-xs transition-colors ${
                  tool === "text"
                    ? "bg-[#e31c5f] text-white border border-[#e31c5f]"
                    : "text-text-secondary hover:bg-surface-strong"
                }`}
                title="Text tool"
                aria-label="Text tool"
                id="drawing-text-btn"
              >
                <Type className="w-4 h-4" />
              </button>

              {/* Fill */}
              <button
                onClick={() => handleToolChange("fill")}
                className={`p-2 rounded-xs transition-colors ${
                  tool === "fill"
                    ? "bg-[#e31c5f] text-white border border-[#e31c5f]"
                    : "text-text-secondary hover:bg-surface-strong"
                }`}
                title="Fill tool"
                aria-label="Fill tool"
                id="drawing-fill-btn"
              >
                <PaintBucket className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Color Picker with Circle Dot Preview OR Highlighter preset colors */}
          {tool === "highlighter" ? (
            <div className="flex items-center gap-1.5 bg-surface-strong px-2 py-1.5 rounded-xs">
              {HIGHLIGHTER_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setColor(c);
                    setHexInput(c);
                  }}
                  className="w-6 h-6 rounded-full border border-white/10 hover:scale-110 transition-transform relative"
                  style={{ backgroundColor: c }}
                  aria-label={`Highlighter color ${c}`}
                >
                  {c === color && (
                    <Check className="w-3 h-3 absolute inset-0 m-auto text-black drop-shadow-md" />
                  )}
                </button>
              ))}
            </div>
          ) : (
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
                      className="input text-xs py-1.5 px-2 flex-1 bg-surface-strong border border-border-muted text-text-primary rounded-xs focus:outline-none"
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
          )}

          <div className="h-5 w-px bg-border-muted" />

          {/* Stroke Size Slider */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary w-8 text-right select-none font-mono">
              {strokeSize}px
            </span>
            <input
              id="stroke-size"
              type="range"
              min={1}
              max={20}
              value={strokeSize}
              onChange={(e) => setStrokeSize(Number(e.target.value))}
              className="w-20 h-1 rounded-lg appearance-none cursor-pointer accent-[#e31c5f] bg-surface-strong"
              aria-label="Stroke size"
            />
          </div>

          {/* Spray Density Slider (Conditional) */}
          {tool === "spray" && (
            <>
              <div className="h-5 w-px bg-border-muted" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-tertiary select-none font-mono">
                  Density: {sprayDensity}
                </span>
                <input
                  id="spray-density"
                  type="range"
                  min={5}
                  max={40}
                  value={sprayDensity}
                  onChange={(e) => setSprayDensity(Number(e.target.value))}
                  className="w-20 h-1 rounded-lg appearance-none cursor-pointer accent-[#e31c5f] bg-surface-strong"
                  aria-label="Spray density"
                />
              </div>
            </>
          )}

          {/* Text Font Size Input/Slider (Conditional) */}
          {tool === "text" && (
            <>
              <div className="h-5 w-px bg-border-muted" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-tertiary select-none font-mono">
                  Font: {fontSize}px
                </span>
                <input
                  id="text-font-size"
                  type="range"
                  min={12}
                  max={72}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-20 h-1 rounded-lg appearance-none cursor-pointer accent-[#e31c5f] bg-surface-strong"
                  aria-label="Font size"
                />
              </div>
            </>
          )}

          <div className="h-5 w-px bg-border-muted" />

          {/* Undo Button */}
          <button
            onClick={handleUndo}
            className="p-2 rounded-xs text-text-secondary hover:bg-surface-strong transition-colors"
            title="Undo last stroke"
            aria-label="Undo last stroke"
            id="drawing-undo-btn"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          {/* Clear Button */}
          <button
            onClick={handleClear}
            className="p-2 rounded-xs text-red-400 hover:bg-red-950/20 transition-colors"
            title="Clear all"
            aria-label="Clear all"
            id="drawing-clear-btn"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Status Message */}
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
          className="flex-1 w-full rounded-xs overflow-hidden border border-border-muted min-h-[400px] relative bg-white"
        >
          <canvas
            ref={canvasRef}
            id="drawing-canvas"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="w-full h-full block bg-white cursor-crosshair touch-none"
          />

          {/* Text Input Overlay */}
          {textInputStyle && (
            <textarea
              ref={textInputRef}
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onBlur={finalizeText}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  finalizeText();
                }
              }}
              className="font-sans"
              style={{
                position: "absolute",
                left: `${textInputStyle.x}px`,
                top: `${textInputStyle.y}px`,
                fontSize: `${fontSize}px`,
                color: color,
                fontFamily: "Inter, sans-serif",
                background: "transparent",
                border: "1px dashed #e31c5f",
                outline: "none",
                resize: "both",
                overflow: "hidden",
                whiteSpace: "pre",
                minWidth: "150px",
                minHeight: `${fontSize * 1.5}px`,
                lineHeight: "1.2",
                padding: "0",
                margin: "0",
                zIndex: 50,
              }}
            />
          )}
        </div>

        {/* Saved Versions Timeline */}
        <div className="flex flex-col gap-1 mt-1.5 border-t border-white/[0.06] pt-1.5">
          <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            SAVED DRAWING VERSIONS
          </h4>
          {versions.length === 0 ? (
            <p className="text-xs text-gray-500 italic">
              No saved versions yet. Click &quot;Save Drawing&quot; to save this canvas as Version 1.
            </p>
          ) : (
            <div className="flex flex-row gap-3 overflow-x-auto pt-1 pb-0 pr-2 scrollbar-thin scrollbar-thumb-white/[0.06]">
              {versions.map((versionUrl, idx) => {
                const versionNum = idx + 1;
                const isActive = currentVersionUrl === versionUrl;
                return (
                  <div
                    key={versionUrl}
                    className={`relative flex-shrink-0 w-32 h-20 rounded-lg overflow-hidden border cursor-pointer group transition-all ${
                      isActive
                        ? "border-[#e31c5f] shadow-md shadow-brand-500/10 ring-1 ring-[#e31c5f]"
                        : "border-white/[0.06] hover:border-brand-400/50"
                    }`}
                    onClick={() => {
                      if (!isActive) {
                        setSwitchVersionTarget(versionNum);
                      }
                    }}
                  >
                    <img
                      src={`${baseUrl}${versionUrl}?t=${Date.now()}`}
                      alt={`Version ${versionNum}`}
                      className="w-full h-full object-cover bg-[#18181b]"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 flex justify-between items-center text-[10px] text-gray-300">
                      <span className="font-semibold">V{versionNum}</span>
                      {isActive && (
                        <span className="text-[9px] bg-[#e31c5f] text-white font-bold px-1 rounded-sm">
                          Active
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteVersionTarget(versionNum);
                      }}
                      className="absolute top-1.5 right-1.5 p-1 rounded bg-black/80 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-black hover:text-red-300 transition-opacity"
                      title={`Delete Version ${versionNum}`}
                      aria-label={`Delete Version ${versionNum}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Switch Version Confirmation Modal */}
        {switchVersionTarget !== null && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-xs">
            <div className="glass p-6 max-w-sm w-full flex flex-col gap-4 animate-scale-up">
              <h3 className="text-sm font-semibold text-gray-200">
                Switch Drawing Version
              </h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Are you sure you want to switch to **Version {switchVersionTarget}**? Any unsaved changes currently on the canvas will be lost.
              </p>
              <div className="flex justify-end gap-3 text-xs mt-2">
                <button
                  onClick={() => setSwitchVersionTarget(null)}
                  disabled={switching}
                  className="btn-secondary px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSwitchConfirm}
                  disabled={switching}
                  className="btn-primary px-3 py-1.5 flex items-center gap-1.5"
                >
                  {switching && <Loader2 className="w-3 h-3 animate-spin" />}
                  Confirm Switch
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Version Confirmation Modal */}
        {deleteVersionTarget !== null && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-xs">
            <div className="glass p-6 max-w-sm w-full flex flex-col gap-4 animate-scale-up">
              <h3 className="text-sm font-semibold text-red-400">
                Permanently Delete Version
              </h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Are you sure you want to permanently delete **Version {deleteVersionTarget}**? This action cannot be undone, and subsequent version numbers will automatically shift.
              </p>
              <div className="flex justify-end gap-3 text-xs mt-2">
                <button
                  onClick={() => setDeleteVersionTarget(null)}
                  disabled={deletingVersion}
                  className="btn-secondary px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={deletingVersion}
                  className="btn-danger px-3 py-1.5 flex items-center gap-1.5"
                >
                  {deletingVersion && <Loader2 className="w-3 h-3 animate-spin" />}
                  Permanently Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

DrawingCanvas.displayName = "DrawingCanvas";
export default DrawingCanvas;
