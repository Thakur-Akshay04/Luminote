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
  Wind,
  Slash,
  Square,
  Circle,
  Type,
  PaintBucket,
} from "lucide-react";
import { Canvas, PencilBrush, SprayBrush, Line, Rect, Ellipse, IText, FabricImage } from "fabric";

// O(1) hex to rgba conversion
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

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
    const contextRef = useRef<CanvasRenderingContext2D | null>(null);
    const undoStack = useRef<string[]>([]);
    const [isDrawing, setIsDrawing] = useState(false);

    const [tool, setTool] = useState<
      "pen" | "eraser" | "marker" | "highlighter" | "spray" | "line" | "rect" | "circle" | "text" | "fill"
    >("pen");
    const [color, setColor] = useState("#f4f4f5");
    const [hexInput, setHexInput] = useState("#f4f4f5");
    const [strokeSize, setStrokeSize] = useState(3);
    const [sprayDensity, setSprayDensity] = useState(20);
    const [textSize, setTextSize] = useState(18);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [showColorPicker, setShowColorPicker] = useState(false);

    const fabricCanvasRef = useRef<Canvas | null>(null);

    // Keep refs in sync for single-registration mouse handlers
    const toolRef = useRef(tool);
    const colorRef = useRef(color);
    const strokeSizeRef = useRef(strokeSize);
    const textSizeRef = useRef(textSize);
    const sprayDensityRef = useRef(sprayDensity);

    useEffect(() => { toolRef.current = tool; }, [tool]);
    useEffect(() => { colorRef.current = color; }, [color]);
    useEffect(() => { strokeSizeRef.current = strokeSize; }, [strokeSize]);
    useEffect(() => { textSizeRef.current = textSize; }, [textSize]);
    useEffect(() => { sprayDensityRef.current = sprayDensity; }, [sprayDensity]);

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

    // Sync state with Fabric.js background
    const updateFabricBackground = useCallback(async (dataUrl: string) => {
      const fCanvas = fabricCanvasRef.current;
      if (!fCanvas) return;
      try {
        const img = await FabricImage.fromURL(dataUrl);
        img.set({
          left: 0,
          top: 0,
          scaleX: fCanvas.width / img.width,
          scaleY: fCanvas.height / img.height,
          originX: "left",
          originY: "top",
          selectable: false,
          evented: false,
        });
        fCanvas.backgroundImage = img;
        fCanvas.requestRenderAll();
      } catch (err) {
        console.error("Failed to update fabric background:", err);
      }
    }, []);

    // Commit fabric drawing objects to the background image
    const commitFabricCanvas = useCallback(async () => {
      const fCanvas = fabricCanvasRef.current;
      const canvas = canvasRef.current;
      if (!fCanvas || !canvas) return;

      if (fCanvas.getObjects().length > 0) {
        const dataUrl = fCanvas.toDataURL();
        fCanvas.clear();
        await updateFabricBackground(dataUrl);
      }
    }, [updateFabricBackground]);

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
          const dataUrl = canvas.toDataURL();
          undoStack.current = [dataUrl];
          updateFabricBackground(dataUrl);
        };
        img.onerror = () => {
          console.error("Failed to load background image:", imgUrl);
          clearCanvas();
          const dataUrl = canvas.toDataURL();
          undoStack.current = [dataUrl];
          updateFabricBackground(dataUrl);
        };
      },
      [baseUrl, clearCanvas, updateFabricBackground]
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

      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.setDimensions({ width, height });
        updateFabricBackground(canvas.toDataURL());
      }
    }, [updateFabricBackground]);

    // Initialize Fabric Canvas once on mount
    useEffect(() => {
      const canvas = canvasRef.current;
      const container = canvas?.parentElement;
      if (!canvas || !container) return;

      const width = container.clientWidth || 800;
      const height = container.clientHeight || 500;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        contextRef.current = ctx;
      }

      const fCanvas = new Canvas(canvas, {
        isDrawingMode: false,
        selection: false,
        stopContextMenu: true,
        width,
        height,
      });
      fabricCanvasRef.current = fCanvas;

      const handleStateChange = () => {
        const canvasEl = canvasRef.current;
        if (canvasEl) {
          if (undoStack.current.length >= 50) {
            undoStack.current.shift();
          }
          undoStack.current.push(canvasEl.toDataURL());
        }
      };

      fCanvas.on("object:added", handleStateChange);
      fCanvas.on("object:modified", handleStateChange);
      fCanvas.on("path:created", handleStateChange);

      // Single registration mouse event handlers for Shape/Line/Text/Fill tools
      let isMouseDown = false;
      let startPoint: { x: number; y: number } | null = null;
      let activeObject: any = null;

      const handleMouseDown = (opt: any) => {
        const activeTool = toolRef.current;
        if (["pen", "eraser", "marker", "highlighter", "spray"].includes(activeTool)) return;

        const pointer = fCanvas.getScenePoint(opt.e);
        isMouseDown = true;
        startPoint = { x: pointer.x, y: pointer.y };

        const activeColor = colorRef.current;
        const activeStroke = strokeSizeRef.current;

        if (activeTool === "line") {
          activeObject = new Line([pointer.x, pointer.y, pointer.x, pointer.y], {
            stroke: activeColor,
            strokeWidth: activeStroke,
            selectable: false,
            evented: false,
            originX: "left",
            originY: "top",
          });
          fCanvas.add(activeObject);
        } else if (activeTool === "rect") {
          activeObject = new Rect({
            left: pointer.x,
            top: pointer.y,
            width: 0,
            height: 0,
            fill: "transparent",
            stroke: activeColor,
            strokeWidth: activeStroke,
            selectable: false,
            evented: false,
            originX: "left",
            originY: "top",
          });
          fCanvas.add(activeObject);
        } else if (activeTool === "circle") {
          activeObject = new Ellipse({
            left: pointer.x,
            top: pointer.y,
            rx: 0,
            ry: 0,
            fill: "transparent",
            stroke: activeColor,
            strokeWidth: activeStroke,
            selectable: false,
            evented: false,
            originX: "center",
            originY: "center",
          });
          fCanvas.add(activeObject);
        } else if (activeTool === "text") {
          const targetInfo = fCanvas.findTarget(opt.e);
          const target = targetInfo?.target;
          if (target && target.type === "i-text") {
            fCanvas.setActiveObject(target);
            (target as IText).enterEditing();
            isMouseDown = false;
            return;
          }
          const text = new IText("", {
            left: pointer.x,
            top: pointer.y,
            fontSize: textSizeRef.current,
            fill: activeColor,
            fontFamily: "Inter, sans-serif",
            selectable: true,
          });
          fCanvas.add(text);
          fCanvas.setActiveObject(text);
          text.enterEditing();
          isMouseDown = false;
        } else if (activeTool === "fill") {
          const targetInfo = fCanvas.findTarget(opt.e);
          const target = targetInfo?.target;
          if (target) {
            target.set("fill", activeColor);
            fCanvas.requestRenderAll();
            fCanvas.fire("object:modified", { target });
          }
          isMouseDown = false;
        }
      };

      const handleMouseMove = (opt: any) => {
        if (!isMouseDown || !startPoint || !activeObject) return;
        const pointer = fCanvas.getScenePoint(opt.e);
        const activeTool = toolRef.current;

        if (activeTool === "line") {
          activeObject.set({
            x2: pointer.x,
            y2: pointer.y,
          });
        } else if (activeTool === "rect") {
          const left = Math.min(startPoint.x, pointer.x);
          const top = Math.min(startPoint.y, pointer.y);
          const width = Math.abs(startPoint.x - pointer.x);
          const height = Math.abs(startPoint.y - pointer.y);
          activeObject.set({ left, top, width, height });
        } else if (activeTool === "circle") {
          const left = Math.min(startPoint.x, pointer.x);
          const top = Math.min(startPoint.y, pointer.y);
          const rx = Math.abs(startPoint.x - pointer.x) / 2;
          const ry = Math.abs(startPoint.y - pointer.y) / 2;
          activeObject.set({
            left: left + rx,
            top: top + ry,
            rx,
            ry,
          });
        }
        activeObject.setCoords();
        fCanvas.requestRenderAll();
      };

      const handleMouseUp = () => {
        if (!isMouseDown) return;
        isMouseDown = false;
        startPoint = null;
        if (activeObject) {
          activeObject.setCoords();
          fCanvas.fire("object:added", { target: activeObject });
          activeObject = null;
        }
      };

      fCanvas.on("mouse:down", handleMouseDown);
      fCanvas.on("mouse:move", handleMouseMove);
      fCanvas.on("mouse:up", handleMouseUp);

      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        fCanvas.off("object:added", handleStateChange);
        fCanvas.off("object:modified", handleStateChange);
        fCanvas.off("path:created", handleStateChange);
        fCanvas.off("mouse:down", handleMouseDown);
        fCanvas.off("mouse:move", handleMouseMove);
        fCanvas.off("mouse:up", handleMouseUp);
        fCanvas.dispose();
        fabricCanvasRef.current = null;
      };
    }, [handleResize]);

    // Handle initial and version changes loading
    useEffect(() => {
      if (currentVersionUrl) {
        loadDrawingFromUrl(currentVersionUrl);
      } else {
        clearCanvas();
        const canvas = canvasRef.current;
        if (canvas) {
          undoStack.current = [canvas.toDataURL()];
          updateFabricBackground(canvas.toDataURL());
        }
      }
    }, [currentVersionUrl, loadDrawingFromUrl, clearCanvas, updateFabricBackground]);

    // Commit fabric drawing objects when switching to 2D pen/eraser tools
    useEffect(() => {
      const is2D = ["pen", "eraser"].includes(tool);
      if (is2D) {
        commitFabricCanvas();
      }
    }, [tool, commitFabricCanvas]);

    // Toggle Fabric drawing mode and configure drawing brushes reactively
    useEffect(() => {
      const fCanvas = fabricCanvasRef.current;
      if (!fCanvas) return;

      const isDrawingTool = ["marker", "highlighter", "spray"].includes(tool);
      const is2DTool = ["pen", "eraser"].includes(tool);

      if (is2DTool) {
        if (fCanvas.upperCanvasEl) {
          fCanvas.upperCanvasEl.style.pointerEvents = "none";
        }
        fCanvas.isDrawingMode = false;
      } else {
        if (fCanvas.upperCanvasEl) {
          fCanvas.upperCanvasEl.style.pointerEvents = "auto";
        }

        if (isDrawingTool) {
          fCanvas.isDrawingMode = true;
          if (tool === "marker") {
            const brush = new PencilBrush(fCanvas);
            brush.width = 18;
            brush.color = hexToRgba(color, 0.4);
            fCanvas.freeDrawingBrush = brush;
          } else if (tool === "highlighter") {
            const brush = new PencilBrush(fCanvas);
            brush.width = 28;
            brush.color = hexToRgba(color, 0.25);
            fCanvas.freeDrawingBrush = brush;
          } else if (tool === "spray") {
            const brush = new SprayBrush(fCanvas);
            brush.width = 30;
            brush.density = sprayDensity;
            brush.color = color;
            fCanvas.freeDrawingBrush = brush;
          }
        } else {
          fCanvas.isDrawingMode = false;
        }
      }
    }, [tool, color, sprayDensity]);

    // Enforce restricted highlighter colors on select
    useEffect(() => {
      if (tool === "highlighter" && !["#FFFF00", "#00FFFF", "#00FF00", "#FF69B4"].includes(color)) {
        setColor("#FFFF00");
      }
    }, [tool, color]);

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

    // Start drawing
    const startDrawing = (
      e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
    ) => {
      const coords = getCoords(e);
      const ctx = contextRef.current;
      const canvas = canvasRef.current;
      if (!coords || !ctx || !canvas) return;

      // Push current state to undo stack before starting the new line
      if (undoStack.current.length >= 50) {
        undoStack.current.shift(); // Limit stack size to 50
      }
      undoStack.current.push(canvas.toDataURL());

      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);

      // Configure brush/eraser styling
      if (tool === "eraser") {
        ctx.strokeStyle = "#ffffff"; // matches background color
        ctx.lineWidth = strokeSize * 3;
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeSize;
      }

      setIsDrawing(true);
      e.preventDefault();
    };

    // Draw lines
    const draw = (
      e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
    ) => {
      if (!isDrawing) return;
      const coords = getCoords(e);
      const ctx = contextRef.current;
      if (!coords || !ctx) return;

      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
      e.preventDefault();
    };

    // Stop drawing
    const stopDrawing = () => {
      if (!isDrawing) return;
      setIsDrawing(false);
      contextRef.current?.closePath();

      // Capture state immediately on stroke end for Pencil/Eraser tools
      const canvas = canvasRef.current;
      if (canvas) {
        const dataUrl = canvas.toDataURL();
        updateFabricBackground(dataUrl);
      }
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

        if (fabricCanvasRef.current) {
          fabricCanvasRef.current.clear();
          updateFabricBackground(previousState);
        }
      };
    };

    // Clear canvas
    const handleClear = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      undoStack.current.push(canvas.toDataURL());
      clearCanvas();

      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.clear();
        fabricCanvasRef.current.backgroundImage = undefined;
        fabricCanvasRef.current.requestRenderAll();
      }
    };

    // Save drawing to DB
    const handleSave = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Commit fabric objects to background image first
      await commitFabricCanvas();

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

    const handleColorSelect = (c: string) => {
      setColor(c);
      setHexInput(c);
    };

    const handleHexSubmit = () => {
      if (/^#[0-9a-fA-F]{6}$/.test(hexInput)) {
        setColor(hexInput);
      }
    };

    return (
      <div className="flex flex-col h-full overflow-hidden gap-3">
        {/* Toolbar aligned to match D layout.png */}
        <div className="flex flex-wrap items-center gap-4 px-3 py-2 bg-surface-raised border border-border-muted rounded-xs select-none">
          {/* Tools Grid Container */}
          <div className="flex flex-col gap-1.5">
            {/* Row 1: Pencil, Marker, Highlighter, Spray, Eraser */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setTool("pen")}
                className={`p-2 rounded-xs transition-colors ${
                  tool === "pen"
                    ? "bg-[#e31c5f] text-white border border-[#e31c5f]"
                    : "text-text-secondary hover:bg-surface-strong"
                }`}
                title="Pencil tool"
                aria-label="Pencil tool"
                id="drawing-pencil-btn"
              >
                <Pen className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTool("marker")}
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
              <button
                onClick={() => setTool("highlighter")}
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
              <button
                onClick={() => setTool("spray")}
                className={`p-2 rounded-xs transition-colors ${
                  tool === "spray"
                    ? "bg-[#e31c5f] text-white border border-[#e31c5f]"
                    : "text-text-secondary hover:bg-surface-strong"
                }`}
                title="Spray tool"
                aria-label="Spray tool"
                id="drawing-spray-btn"
              >
                <Wind className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTool("eraser")}
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
            {/* Row 2: Line, Rectangle, Circle, Text, Fill */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setTool("line")}
                className={`p-2 rounded-xs transition-colors ${
                  tool === "line"
                    ? "bg-[#e31c5f] text-white border border-[#e31c5f]"
                    : "text-text-secondary hover:bg-surface-strong"
                }`}
                title="Line tool"
                aria-label="Line tool"
                id="drawing-line-btn"
              >
                <Slash className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTool("rect")}
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
              <button
                onClick={() => setTool("circle")}
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
              <button
                onClick={() => setTool("text")}
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
              <button
                onClick={() => setTool("fill")}
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

          <div className="h-10 w-px bg-border-muted" />

          {/* Color Selection Block */}
          {tool === "highlighter" ? (
            <div className="flex items-center gap-1.5 border border-border-muted px-2.5 py-1.5 rounded-xs bg-surface-raised">
              <span className="text-[10px] text-text-tertiary mr-1 font-semibold uppercase tracking-wider">Color:</span>
              {["#FFFF00", "#00FFFF", "#00FF00", "#FF69B4"].map((c) => (
                <button
                  key={c}
                  onClick={() => handleColorSelect(c)}
                  className="w-6 h-6 rounded-full border border-white/10 hover:scale-110 transition-transform relative"
                  style={{ backgroundColor: c }}
                  aria-label={`Highlighter color ${c}`}
                >
                  {color === c && (
                    <Check className="w-3 h-3 absolute inset-0 m-auto text-black drop-shadow-md font-bold" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            /* General Color Picker with Circle Dot Preview */
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
          )}

          <div className="h-10 w-px bg-border-muted" />

          {/* Tool specific & Shared Controls */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Spray Density Slider */}
            {tool === "spray" && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-tertiary select-none font-semibold">Density:</span>
                <span className="text-xs text-text-tertiary w-6 text-right select-none font-mono">
                  {sprayDensity}
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
            )}

            {/* Font Size Input */}
            {tool === "text" && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-tertiary select-none font-semibold">Size:</span>
                <span className="text-xs text-text-tertiary w-8 text-right select-none font-mono">
                  {textSize}px
                </span>
                <input
                  id="font-size"
                  type="range"
                  min={12}
                  max={72}
                  value={textSize}
                  onChange={(e) => setTextSize(Number(e.target.value))}
                  className="w-20 h-1 rounded-lg appearance-none cursor-pointer accent-[#e31c5f] bg-surface-strong"
                  aria-label="Font size"
                />
              </div>
            )}

            {/* Stroke Size Slider */}
            {!["marker", "highlighter", "spray", "text", "fill"].includes(tool) && (
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
            )}

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
          className="flex-1 w-full rounded-xs overflow-hidden border border-border-muted min-h-[400px] relative bg-[#ffffff]"
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
            className="w-full h-full block bg-[#ffffff] cursor-crosshair touch-none"
          />
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
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        if (!isActive) {
                          setSwitchVersionTarget(versionNum);
                        }
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <img
                      src={`${baseUrl}${versionUrl}?t=${Date.now()}`}
                      alt={`Version ${versionNum}`}
                      className="w-full h-full object-cover bg-[#ffffff]"
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
