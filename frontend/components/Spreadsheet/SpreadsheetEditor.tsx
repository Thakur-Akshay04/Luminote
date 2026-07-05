"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { evaluateFormula, indexToColLabel, colLabelToIndex } from "@/lib/formulaEngine";
import { CellData, CellFormat, MergedCell, SheetData, SheetMeta } from "@/types";
import Toolbar from "./Toolbar";
import FormulaBar from "./FormulaBar";
import SheetTabs from "./SheetTabs";
import ContextMenu from "./ContextMenu";
import FindReplace from "./FindReplace";

interface SpreadsheetEditorProps {
  initialTitle: string;
  initialWorkbookData: Record<string, SheetData> | null;
  initialSheets: SheetMeta[] | null;
  initialActiveSheetId: string | null;
  onSave: (title: string, workbookData: Record<string, SheetData>, sheets: SheetMeta[], activeSheetId: string) => Promise<void>;
}

const DEFAULT_ROWS = 100;
const DEFAULT_COLS = 26; // A to Z
const DEFAULT_COL_WIDTH = 100;
const DEFAULT_ROW_HEIGHT = 25;

export default function SpreadsheetEditor({
  initialTitle,
  initialWorkbookData,
  initialSheets,
  initialActiveSheetId,
  onSave,
}: SpreadsheetEditorProps) {
  // Title state
  const [title, setTitle] = useState(initialTitle);
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  // Workbook Structure
  const [sheets, setSheets] = useState<SheetMeta[]>(
    initialSheets || [{ id: "sheet-1", name: "Sheet1", index: 0 }]
  );
  const [activeSheetId, setActiveSheetId] = useState<string>(
    initialActiveSheetId || "sheet-1"
  );
  const [workbookData, setWorkbookData] = useState<Record<string, SheetData>>(
    initialWorkbookData || {
      "sheet-1": {
        cells: {},
        columnWidths: {},
        rowHeights: {},
        mergedCells: [],
        frozenRows: 0,
        frozenCols: 0,
      },
    }
  );

  // Active sheet shorthand
  const currentSheetData = workbookData[activeSheetId] || {
    cells: {},
    columnWidths: {},
    rowHeights: {},
    mergedCells: [],
    frozenRows: 0,
    frozenCols: 0,
  };

  // Selection states
  const [selectedRange, setSelectedRange] = useState<{
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  } | null>(null);

  const [isSelecting, setIsSelecting] = useState(false);
  const [isEditingCell, setIsEditingCell] = useState(false);
  const [editValue, setEditValue] = useState("");

  // Computed cells cache
  const [computedValues, setComputedValues] = useState<Record<string, any>>({});

  // History stack for Undo/Redo
  const [history, setHistory] = useState<Record<string, SheetData>[]>([]);
  const [redoStack, setRedoStack] = useState<Record<string, SheetData>[]>([]);

  // Dialog / Context menu states
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Drag resizing states
  const [resizingCol, setResizingCol] = useState<{ idx: number; startX: number; startWidth: number } | null>(null);
  const [resizingRow, setResizingRow] = useState<{ idx: number; startY: number; startHeight: number } | null>(null);

  // Auto-fill drag fill handle state
  const [isDraggingFill, setIsDraggingFill] = useState(false);
  const [fillRange, setFillRange] = useState<{
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  } | null>(null);

  // Auto-filter toggled rows state
  const [columnFilters, setColumnFilters] = useState<Record<number, string>>({});
  const [showFilterDropdowns, setShowFilterDropdowns] = useState(false);

  // Copy-paste buffer
  const [copyBuffer, setCopyBuffer] = useState<{
    range: typeof selectedRange;
    cells: Record<string, CellData>;
  } | null>(null);

  // Compute values helper
  const computeWorkbook = useCallback((cells: Record<string, CellData>) => {
    const cache: Record<string, any> = {};
    const visited = new Set<string>();

    const evaluateCell = (ref: string): any => {
      const uppercaseRef = ref.toUpperCase();
      if (uppercaseRef in cache) return cache[uppercaseRef];

      const cell = cells[uppercaseRef];
      if (!cell) return null;

      if (cell.formula) {
        if (visited.has(uppercaseRef)) {
          return "#REF!";
        }
        visited.add(uppercaseRef);
        const res = evaluateFormula(cell.formula, cells, uppercaseRef, visited);
        visited.delete(uppercaseRef);
        cache[uppercaseRef] = res;
        return res;
      }

      cache[uppercaseRef] = cell.value;
      return cell.value;
    };

    const results: Record<string, any> = {};
    for (const ref of Object.keys(cells)) {
      results[ref] = evaluateCell(ref);
    }

    // Evaluate cell reference mappings for missing cells referenced in formulas
    // Quick search for formulas that refer to cells not in active lists
    Object.values(cells).forEach((c) => {
      if (c.formula) {
        const refs = c.formula.match(/[A-Z]+[0-9]+/g) || [];
        refs.forEach((ref) => {
          if (!(ref in results)) {
            results[ref] = evaluateCell(ref);
          }
        });
      }
    });

    return results;
  }, []);

  // Sync computed values when workbook cells change
  useEffect(() => {
    const computed = computeWorkbook(currentSheetData.cells);
    setComputedValues(computed);
  }, [workbookData, activeSheetId, computeWorkbook, currentSheetData.cells]);

  // Handle auto-save (debounced)
  useEffect(() => {
    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await onSave(title, workbookData, sheets, activeSheetId);
      } catch (e) {
        // Silently handle
      } finally {
        setIsSaving(false);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [title, workbookData, sheets, activeSheetId, onSave]);

  // Helper to push history
  const pushHistory = useCallback(() => {
    setHistory((prev) => [...prev, JSON.parse(JSON.stringify(workbookData))]);
    setRedoStack([]);
  }, [workbookData]);

  // Undo / Redo
  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setRedoStack((prev) => [...prev, JSON.parse(JSON.stringify(workbookData))]);
    setWorkbookData(previous);
    setHistory((prev) => prev.slice(0, -1));
  }, [history, workbookData]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory((prev) => [...prev, JSON.parse(JSON.stringify(workbookData))]);
    setWorkbookData(next);
    setRedoStack((prev) => prev.slice(0, -1));
  }, [redoStack, workbookData]);

  // Spreadsheet selection coordinates helper
  const getSelectedCellKey = () => {
    if (!selectedRange) return "";
    return `${indexToColLabel(selectedRange.startCol)}${selectedRange.startRow + 1}`;
  };

  const getSelectedCellData = (): CellData => {
    const key = getSelectedCellKey();
    return currentSheetData.cells[key] || {};
  };

  const getCellDisplayValue = (row: number, col: number) => {
    const ref = `${indexToColLabel(col)}${row + 1}`;
    const value = computedValues[ref];
    if (value === undefined || value === null) return "";

    const cell = currentSheetData.cells[ref];
    const format = cell?.format;

    if (format) {
      if (format.numberFormat === "currency" && typeof value === "number") {
        return `$${value.toFixed(format.decimals !== undefined ? format.decimals : 2)}`;
      }
      if (format.numberFormat === "percentage" && typeof value === "number") {
        return `${(value * 100).toFixed(format.decimals !== undefined ? format.decimals : 0)}%`;
      }
      if (format.numberFormat === "number" && typeof value === "number") {
        return value.toFixed(format.decimals !== undefined ? format.decimals : 2);
      }
    }
    return String(value);
  };

  // Keyboard navigation & Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditingCell) return;
      if (showFindReplace) return;

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const cmdCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Undo/Redo Shortcuts
      if (cmdCtrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (cmdCtrl && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Copy/Cut/Paste
      if (cmdCtrl && e.key.toLowerCase() === "c") {
        e.preventDefault();
        handleCopy();
        return;
      }
      if (cmdCtrl && e.key.toLowerCase() === "x") {
        e.preventDefault();
        handleCut();
        return;
      }
      if (cmdCtrl && e.key.toLowerCase() === "v") {
        e.preventDefault();
        handlePaste();
        return;
      }

      // Find trigger
      if (cmdCtrl && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setShowFindReplace(true);
        return;
      }

      if (!selectedRange) return;

      let { startRow, startCol, endRow, endCol } = selectedRange;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          if (e.shiftKey) {
            setSelectedRange({ startRow, startCol, endRow: Math.max(0, endRow - 1), endCol });
          } else {
            const nextRow = Math.max(0, startRow - 1);
            setSelectedRange({ startRow: nextRow, startCol, endRow: nextRow, endCol: startCol });
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (e.shiftKey) {
            setSelectedRange({ startRow, startCol, endRow: Math.min(DEFAULT_ROWS - 1, endRow + 1), endCol });
          } else {
            const nextRow = Math.min(DEFAULT_ROWS - 1, startRow + 1);
            setSelectedRange({ startRow: nextRow, startCol, endRow: nextRow, endCol: startCol });
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) {
            setSelectedRange({ startRow, startCol, endRow, endCol: Math.max(0, endCol - 1) });
          } else {
            const nextCol = Math.max(0, startCol - 1);
            setSelectedRange({ startRow, startCol: nextCol, endRow: startRow, endCol: nextCol });
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) {
            setSelectedRange({ startRow, startCol, endRow, endCol: Math.min(DEFAULT_COLS - 1, endCol + 1) });
          } else {
            const nextCol = Math.min(DEFAULT_COLS - 1, startCol + 1);
            setSelectedRange({ startRow, startCol: nextCol, endRow: startRow, endCol: nextCol });
          }
          break;
        case "Tab":
          e.preventDefault();
          const nextTabCol = e.shiftKey ? Math.max(0, startCol - 1) : Math.min(DEFAULT_COLS - 1, startCol + 1);
          setSelectedRange({ startRow, startCol: nextTabCol, endRow: startRow, endCol: nextTabCol });
          break;
        case "Enter":
          e.preventDefault();
          handleStartEdit();
          break;
        case "Backspace":
        case "Delete":
          e.preventDefault();
          pushHistory();
          clearSelectedCells();
          break;
        default:
          // Check for character typing to immediately start editing cell
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            handleStartEdit(e.key);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedRange, isEditingCell, workbookData, history, redoStack, showFindReplace, handleUndo, handleRedo]);

  // Edit actions
  const handleStartEdit = (initialChar = "") => {
    if (!selectedRange) return;
    const cell = getSelectedCellData();
    setEditValue(initialChar || cell.formula || String(cell.value || ""));
    setIsEditingCell(true);
  };

  const handleCommitEdit = () => {
    if (!selectedRange) return;
    pushHistory();
    const key = getSelectedCellKey();
    const updatedCells = { ...currentSheetData.cells };

    const val = editValue.trim();
    if (val === "") {
      delete updatedCells[key];
    } else if (val.startsWith("=")) {
      updatedCells[key] = {
        ...updatedCells[key],
        formula: val,
        value: null,
      };
    } else {
      const num = Number(val);
      updatedCells[key] = {
        ...updatedCells[key],
        formula: undefined,
        value: isNaN(num) ? val : num,
      };
    }

    setWorkbookData((prev) => ({
      ...prev,
      [activeSheetId]: {
        ...currentSheetData,
        cells: updatedCells,
      },
    }));
    setIsEditingCell(false);
  };

  const clearSelectedCells = () => {
    if (!selectedRange) return;
    const updatedCells = { ...currentSheetData.cells };

    const minRow = Math.min(selectedRange.startRow, selectedRange.endRow);
    const maxRow = Math.max(selectedRange.startRow, selectedRange.endRow);
    const minCol = Math.min(selectedRange.startCol, selectedRange.endCol);
    const maxCol = Math.max(selectedRange.startCol, selectedRange.endCol);

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const key = `${indexToColLabel(c)}${r + 1}`;
        delete updatedCells[key];
      }
    }

    setWorkbookData((prev) => ({
      ...prev,
      [activeSheetId]: {
        ...currentSheetData,
        cells: updatedCells,
      },
    }));
  };

  // Formatting actions
  const handleApplyFormat = (formatUpdate: Partial<CellFormat>) => {
    if (!selectedRange) return;
    pushHistory();
    const updatedCells = { ...currentSheetData.cells };

    const minRow = Math.min(selectedRange.startRow, selectedRange.endRow);
    const maxRow = Math.max(selectedRange.startRow, selectedRange.endRow);
    const minCol = Math.min(selectedRange.startCol, selectedRange.endCol);
    const maxCol = Math.max(selectedRange.startCol, selectedRange.endCol);

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const key = `${indexToColLabel(c)}${r + 1}`;
        const cell = updatedCells[key] || {};
        updatedCells[key] = {
          ...cell,
          format: {
            ...(cell.format || {}),
            ...formatUpdate,
          },
        };
      }
    }

    setWorkbookData((prev) => ({
      ...prev,
      [activeSheetId]: {
        ...currentSheetData,
        cells: updatedCells,
      },
    }));
  };

  // Merge Cells
  const handleMerge = () => {
    if (!selectedRange) return;
    pushHistory();

    const newMerge: MergedCell = {
      startRow: Math.min(selectedRange.startRow, selectedRange.endRow),
      startCol: Math.min(selectedRange.startCol, selectedRange.endCol),
      endRow: Math.max(selectedRange.startRow, selectedRange.endRow),
      endCol: Math.max(selectedRange.startCol, selectedRange.endCol),
    };

    // Check if it's already merged, then we split it
    const index = currentSheetData.mergedCells.findIndex(
      (m) =>
        m.startRow === newMerge.startRow &&
        m.startCol === newMerge.startCol &&
        m.endRow === newMerge.endRow &&
        m.endCol === newMerge.endCol
    );

    let updatedMerges = [...currentSheetData.mergedCells];
    if (index >= 0) {
      updatedMerges.splice(index, 1);
    } else {
      updatedMerges.push(newMerge);
    }

    setWorkbookData((prev) => ({
      ...prev,
      [activeSheetId]: {
        ...currentSheetData,
        mergedCells: updatedMerges,
      },
    }));
  };

  // Context Menu operations
  const handleInsertRow = () => {
    if (!selectedRange) return;
    pushHistory();
    const insertAt = Math.min(selectedRange.startRow, selectedRange.endRow);
    const updatedCells: Record<string, CellData> = {};

    Object.entries(currentSheetData.cells).forEach(([key, cell]) => {
      const parsed = parseRef(key);
      if (parsed) {
        if (parsed.row >= insertAt) {
          updatedCells[`${indexToColLabel(parsed.col)}${parsed.row + 2}`] = cell;
        } else {
          updatedCells[key] = cell;
        }
      }
    });

    setWorkbookData((prev) => ({
      ...prev,
      [activeSheetId]: {
        ...currentSheetData,
        cells: updatedCells,
      },
    }));
  };

  const handleDeleteRow = () => {
    if (!selectedRange) return;
    pushHistory();
    const deleteAt = Math.min(selectedRange.startRow, selectedRange.endRow);
    const updatedCells: Record<string, CellData> = {};

    Object.entries(currentSheetData.cells).forEach(([key, cell]) => {
      const parsed = parseRef(key);
      if (parsed) {
        if (parsed.row === deleteAt) {
          // Deleted
        } else if (parsed.row > deleteAt) {
          updatedCells[`${indexToColLabel(parsed.col)}${parsed.row}`] = cell;
        } else {
          updatedCells[key] = cell;
        }
      }
    });

    setWorkbookData((prev) => ({
      ...prev,
      [activeSheetId]: {
        ...currentSheetData,
        cells: updatedCells,
      },
    }));
  };

  const handleInsertCol = () => {
    if (!selectedRange) return;
    pushHistory();
    const insertAt = Math.min(selectedRange.startCol, selectedRange.endCol);
    const updatedCells: Record<string, CellData> = {};

    Object.entries(currentSheetData.cells).forEach(([key, cell]) => {
      const parsed = parseRef(key);
      if (parsed) {
        if (parsed.col >= insertAt) {
          updatedCells[`${indexToColLabel(parsed.col + 1)}${parsed.row + 1}`] = cell;
        } else {
          updatedCells[key] = cell;
        }
      }
    });

    setWorkbookData((prev) => ({
      ...prev,
      [activeSheetId]: {
        ...currentSheetData,
        cells: updatedCells,
      },
    }));
  };

  const handleDeleteCol = () => {
    if (!selectedRange) return;
    pushHistory();
    const deleteAt = Math.min(selectedRange.startCol, selectedRange.endCol);
    const updatedCells: Record<string, CellData> = {};

    Object.entries(currentSheetData.cells).forEach(([key, cell]) => {
      const parsed = parseRef(key);
      if (parsed) {
        if (parsed.col === deleteAt) {
          // Deleted
        } else if (parsed.col > deleteAt) {
          updatedCells[`${indexToColLabel(parsed.col - 1)}${parsed.row + 1}`] = cell;
        } else {
          updatedCells[key] = cell;
        }
      }
    });

    setWorkbookData((prev) => ({
      ...prev,
      [activeSheetId]: {
        ...currentSheetData,
        cells: updatedCells,
      },
    }));
  };

  // Find & Replace actions
  const handleFind = (search: string, matchCase: boolean) => {
    const searchLower = search.toLowerCase();
    const items = Object.entries(computedValues);

    let nextMatchKey = "";
    for (const [key, val] of items) {
      const strVal = String(val);
      const isMatch = matchCase ? strVal.includes(search) : strVal.toLowerCase().includes(searchLower);

      if (isMatch) {
        nextMatchKey = key;
        break;
      }
    }

    if (nextMatchKey) {
      const parsed = parseRef(nextMatchKey);
      if (parsed) {
        setSelectedRange({
          startRow: parsed.row,
          startCol: parsed.col,
          endRow: parsed.row,
          endCol: parsed.col,
        });
      }
    } else {
      alert("No match found.");
    }
  };

  const handleReplace = (search: string, replace: string, matchCase: boolean, all: boolean) => {
    pushHistory();
    const updatedCells = { ...currentSheetData.cells };
    const searchLower = search.toLowerCase();
    let replacedCount = 0;

    Object.entries(computedValues).forEach(([key, val]) => {
      const strVal = String(val);
      const isMatch = matchCase ? strVal.includes(search) : strVal.toLowerCase().includes(searchLower);

      if (isMatch) {
        if (all || (!all && replacedCount === 0)) {
          const currentCell = updatedCells[key] || {};
          let newVal: string = "";

          if (matchCase) {
            newVal = strVal.replaceAll(search, replace);
          } else {
            // Case insensitive replace
            const regex = new RegExp(search, "gi");
            newVal = strVal.replace(regex, replace);
          }

          updatedCells[key] = {
            ...currentCell,
            value: isNaN(Number(newVal)) ? newVal : Number(newVal),
            formula: undefined,
          };
          replacedCount++;
        }
      }
    });

    if (replacedCount > 0) {
      setWorkbookData((prev) => ({
        ...prev,
        [activeSheetId]: {
          ...currentSheetData,
          cells: updatedCells,
        },
      }));
      alert(`Replaced ${replacedCount} occurrences.`);
    } else {
      alert("No match found.");
    }
  };

  // Sort Range based on first column of selection
  const handleSort = (dir: "asc" | "desc") => {
    if (!selectedRange) return;
    pushHistory();

    const minRow = Math.min(selectedRange.startRow, selectedRange.endRow);
    const maxRow = Math.max(selectedRange.startRow, selectedRange.endRow);
    const minCol = Math.min(selectedRange.startCol, selectedRange.endCol);
    const maxCol = Math.max(selectedRange.startCol, selectedRange.endCol);

    // Get rows range
    const rowsArray: Record<number, CellData>[] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const rowCells: Record<number, CellData> = {};
      for (let c = minCol; c <= maxCol; c++) {
        const key = `${indexToColLabel(c)}${r + 1}`;
        if (currentSheetData.cells[key]) {
          rowCells[c] = currentSheetData.cells[key];
        }
      }
      rowsArray.push(rowCells);
    }

    // Sort rowsArray based on the key of the first column
    rowsArray.sort((a, b) => {
      const aVal = a[minCol]?.value !== undefined && a[minCol].value !== null ? String(a[minCol].value) : "";
      const bVal = b[minCol]?.value !== undefined && b[minCol].value !== null ? String(b[minCol].value) : "";

      if (aVal < bVal) return dir === "asc" ? -1 : 1;
      if (aVal > bVal) return dir === "asc" ? 1 : -1;
      return 0;
    });

    // Write back sorted values
    const updatedCells = { ...currentSheetData.cells };
    for (let i = 0; i < rowsArray.length; i++) {
      const targetRow = minRow + i;
      const rowCells = rowsArray[i];

      for (let c = minCol; c <= maxCol; c++) {
        const key = `${indexToColLabel(c)}${targetRow + 1}`;
        if (rowCells[c]) {
          updatedCells[key] = rowCells[c];
        } else {
          delete updatedCells[key];
        }
      }
    }

    setWorkbookData((prev) => ({
      ...prev,
      [activeSheetId]: {
        ...currentSheetData,
        cells: updatedCells,
      },
    }));
  };

  // Toggle Filters UI
  const handleFilterToggle = () => {
    setShowFilterDropdowns(!showFilterDropdowns);
    setColumnFilters({});
  };

  const handleApplyFilterValue = (col: number, filterVal: string) => {
    setColumnFilters((prev) => ({
      ...prev,
      [col]: filterVal,
    }));
  };

  // Freeze Row / Col Action
  const handleFreezeToggle = (rows: number, cols: number) => {
    setWorkbookData((prev) => ({
      ...prev,
      [activeSheetId]: {
        ...currentSheetData,
        frozenRows: rows,
        frozenCols: cols,
      },
    }));
  };

  // Copy/Cut/Paste Implementation
  const handleCopy = () => {
    if (!selectedRange) return;
    const cellsToCopy: Record<string, CellData> = {};

    const minRow = Math.min(selectedRange.startRow, selectedRange.endRow);
    const maxRow = Math.max(selectedRange.startRow, selectedRange.endRow);
    const minCol = Math.min(selectedRange.startCol, selectedRange.endCol);
    const maxCol = Math.max(selectedRange.startCol, selectedRange.endCol);

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const key = `${indexToColLabel(c)}${r + 1}`;
        if (currentSheetData.cells[key]) {
          cellsToCopy[key] = currentSheetData.cells[key];
        }
      }
    }

    setCopyBuffer({
      range: { ...selectedRange },
      cells: cellsToCopy,
    });
  };

  const handleCut = () => {
    handleCopy();
    clearSelectedCells();
  };

  const handlePaste = () => {
    if (!selectedRange || !copyBuffer || !copyBuffer.range) return;
    pushHistory();

    const targetRow = Math.min(selectedRange.startRow, selectedRange.endRow);
    const targetCol = Math.min(selectedRange.startCol, selectedRange.endCol);

    const sourceMinRow = Math.min(copyBuffer.range.startRow, copyBuffer.range.endRow);
    const sourceMinCol = Math.min(copyBuffer.range.startCol, copyBuffer.range.endCol);

    const updatedCells = { ...currentSheetData.cells };

    Object.entries(copyBuffer.cells).forEach(([key, cell]) => {
      const parsed = parseRef(key);
      if (parsed) {
        const rowDiff = parsed.row - sourceMinRow;
        const colDiff = parsed.col - sourceMinCol;

        const destRow = targetRow + rowDiff;
        const destCol = targetCol + colDiff;

        if (destRow < DEFAULT_ROWS && destCol < DEFAULT_COLS) {
          const destKey = `${indexToColLabel(destCol)}${destRow + 1}`;
          updatedCells[destKey] = { ...cell };
        }
      }
    });

    setWorkbookData((prev) => ({
      ...prev,
      [activeSheetId]: {
        ...currentSheetData,
        cells: updatedCells,
      },
    }));
  };

  // Drag Fill Handle Auto-fill Series Logic
  const handleMouseUp = () => {
    setIsSelecting(false);

    if (isDraggingFill && fillRange && selectedRange) {
      pushHistory();
      const updatedCells = { ...currentSheetData.cells };

      const selMinRow = Math.min(selectedRange.startRow, selectedRange.endRow);
      const selMaxRow = Math.max(selectedRange.startRow, selectedRange.endRow);
      const selMinCol = Math.min(selectedRange.startCol, selectedRange.endCol);
      const selMaxCol = Math.max(selectedRange.startCol, selectedRange.endCol);

      const fillMinRow = Math.min(fillRange.startRow, fillRange.endRow);
      const fillMaxRow = Math.max(fillRange.startRow, fillRange.endRow);
      const fillMinCol = Math.min(fillRange.startCol, fillRange.endCol);
      const fillMaxCol = Math.max(fillRange.startCol, fillRange.endCol);

      // We determine orientation of dragging (vertical or horizontal)
      const isVertical = fillMaxRow > selMaxRow || fillMinRow < selMinRow;

      if (isVertical) {
        // Vertical Fill
        for (let col = selMinCol; col <= selMaxCol; col++) {
          // 1. Gather existing values pattern in the selectedRange
          const values: number[] = [];
          for (let r = selMinRow; r <= selMaxRow; r++) {
            const key = `${indexToColLabel(col)}${r + 1}`;
            const num = Number(currentSheetData.cells[key]?.value);
            if (!isNaN(num)) values.push(num);
          }

          // Calculate step delta if there are numbers
          let step = 1;
          if (values.length > 1) {
            step = (values[values.length - 1] - values[0]) / (values.length - 1);
          }

          let lastVal = values[values.length - 1] || 0;

          // Perform fill downwards
          if (fillMaxRow > selMaxRow) {
            for (let r = selMaxRow + 1; r <= fillMaxRow; r++) {
              lastVal += step;
              const destKey = `${indexToColLabel(col)}${r + 1}`;
              const sourceKey = `${indexToColLabel(col)}${selMinRow + ((r - selMaxRow - 1) % (selMaxRow - selMinRow + 1)) + 1}`;
              const sourceCell = currentSheetData.cells[sourceKey] || {};

              updatedCells[destKey] = {
                ...sourceCell,
                value: sourceCell.formula ? undefined : lastVal,
              };
            }
          }
          // Perform fill upwards
          if (fillMinRow < selMinRow) {
            let lastValUp = values[0] || 0;
            for (let r = selMinRow - 1; r >= fillMinRow; r--) {
              lastValUp -= step;
              const destKey = `${indexToColLabel(col)}${r + 1}`;
              const sourceKey = `${indexToColLabel(col)}${selMinRow + ((selMinRow - 1 - r) % (selMaxRow - selMinRow + 1)) + 1}`;
              const sourceCell = currentSheetData.cells[sourceKey] || {};

              updatedCells[destKey] = {
                ...sourceCell,
                value: sourceCell.formula ? undefined : lastValUp,
              };
            }
          }
        }
      } else {
        // Horizontal Fill
        for (let row = selMinRow; row <= selMaxRow; row++) {
          const values: number[] = [];
          for (let c = selMinCol; c <= selMaxCol; c++) {
            const key = `${indexToColLabel(c)}${row + 1}`;
            const num = Number(currentSheetData.cells[key]?.value);
            if (!isNaN(num)) values.push(num);
          }

          let step = 1;
          if (values.length > 1) {
            step = (values[values.length - 1] - values[0]) / (values.length - 1);
          }

          let lastVal = values[values.length - 1] || 0;

          if (fillMaxCol > selMaxCol) {
            for (let c = selMaxCol + 1; c <= fillMaxCol; c++) {
              lastVal += step;
              const destKey = `${indexToColLabel(c)}${row + 1}`;
              const sourceKey = `${indexToColLabel(selMinCol + ((c - selMaxCol - 1) % (selMaxCol - selMinCol + 1)))}${row + 1}`;
              const sourceCell = currentSheetData.cells[sourceKey] || {};

              updatedCells[destKey] = {
                ...sourceCell,
                value: sourceCell.formula ? undefined : lastVal,
              };
            }
          }
        }
      }

      setWorkbookData((prev) => ({
        ...prev,
        [activeSheetId]: {
          ...currentSheetData,
          cells: updatedCells,
        },
      }));
      // Expand selection to include the filled area
      setSelectedRange(fillRange);
    }

    setIsDraggingFill(false);
    setFillRange(null);
  };

  // Helper parse ref string "A1" into { col, row }
  const parseRef = (ref: string): { col: number; row: number } | null => {
    const match = ref.match(/^([A-Z]+)([0-9]+)$/);
    if (!match) return null;
    return {
      col: colLabelToIndex(match[1]),
      row: parseInt(match[2], 10) - 1,
    };
  };

  // Multi-sheet Actions
  const handleSelectSheet = (id: string) => {
    setActiveSheetId(id);
    setSelectedRange(null);
  };

  const handleAddSheet = () => {
    const newId = `sheet-${Date.now()}`;
    const newIndex = sheets.length;
    const newName = `Sheet${newIndex + 1}`;

    pushHistory();
    setSheets((prev) => [...prev, { id: newId, name: newName, index: newIndex }]);
    setWorkbookData((prev) => ({
      ...prev,
      [newId]: {
        cells: {},
        columnWidths: {},
        rowHeights: {},
        mergedCells: [],
        frozenRows: 0,
        frozenCols: 0,
      },
    }));
    setActiveSheetId(newId);
  };

  const handleRenameSheet = (id: string, newName: string) => {
    pushHistory();
    setSheets((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name: newName } : s))
    );
  };

  const handleDeleteSheet = (id: string) => {
    if (sheets.length <= 1) return;
    pushHistory();

    const remaining = sheets.filter((s) => s.id !== id);
    setSheets(remaining);

    const updatedWorkbook = { ...workbookData };
    delete updatedWorkbook[id];
    setWorkbookData(updatedWorkbook);

    // Switch to first available
    setActiveSheetId(remaining[0].id);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-65px)] bg-surface-800 text-neutral-200 overflow-hidden relative">
      {/* Title Bar Area */}
      <div className="flex items-center justify-between border-b border-surface-600 px-6 py-2 bg-surface-900">
        <div className="flex items-center gap-3">
          {isEditingTitle ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => e.key === "Enter" && setIsEditingTitle(false)}
              autoFocus
              className="bg-surface-850 border border-brand-500 rounded px-2.5 py-1 text-base font-bold text-white focus:outline-none"
            />
          ) : (
            <h1
              onClick={() => setIsEditingTitle(true)}
              className="text-base font-bold text-white cursor-pointer hover:text-brand-400 transition-colors"
            >
              {title}
            </h1>
          )}
        </div>
      </div>

      {/* Ribbon Formatting Toolbar */}
      <Toolbar
        currentFormat={getSelectedCellData().format || {}}
        onApplyFormat={handleApplyFormat}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onMerge={handleMerge}
        onSort={handleSort}
        onFilterToggle={handleFilterToggle}
        onFindReplace={() => setShowFindReplace(true)}
        onFreezeToggle={handleFreezeToggle}
        isSaving={isSaving}
      />

      {/* Formula Input Bar */}
      <FormulaBar
        selectedCellLabel={getSelectedCellKey()}
        rawValue={getSelectedCellData().formula || String(getSelectedCellData().value || "")}
        onChange={(val) => setEditValue(val)}
        onCommit={handleCommitEdit}
      />

      {/* Infinite Grid Window Container */}
      <div
        className="flex-1 overflow-auto relative select-none"
        onMouseUp={handleMouseUp}
        onMouseMove={(e) => {
          if (resizingCol && resizingCol.startX !== 0) {
            const deltaX = e.clientX - resizingCol.startX;
            const newWidth = Math.max(50, resizingCol.startWidth + deltaX);
            setWorkbookData((prev) => ({
              ...prev,
              [activeSheetId]: {
                ...currentSheetData,
                columnWidths: {
                  ...currentSheetData.columnWidths,
                  [resizingCol.idx]: newWidth,
                },
              },
            }));
          } else if (resizingRow && resizingRow.startY !== 0) {
            const deltaY = e.clientY - resizingRow.startY;
            const newHeight = Math.max(18, resizingRow.startHeight + deltaY);
            setWorkbookData((prev) => ({
              ...prev,
              [activeSheetId]: {
                ...currentSheetData,
                rowHeights: {
                  ...currentSheetData.rowHeights,
                  [resizingRow.idx]: newHeight,
                },
              },
            }));
          }
        }}
      >
        {/* Actual Spreadsheet Grid Layout */}
        <table className="border-collapse table-fixed select-none">
          <thead>
            {/* Headers Row (Columns A, B, C...) */}
            <tr className="bg-surface-900 sticky top-0 z-30">
              <th className="w-10 bg-surface-900 border border-surface-600 sticky left-0 z-40 text-[10px] text-neutral-500 font-bold uppercase select-none">
                #
              </th>
              {Array.from({ length: DEFAULT_COLS }).map((_, c) => {
                const width = currentSheetData.columnWidths[c] || DEFAULT_COL_WIDTH;
                const colLabel = indexToColLabel(c);
                return (
                  <th
                    key={c}
                    style={{ width }}
                    className="relative border border-surface-600 text-xs font-bold text-neutral-400 select-none bg-surface-950 py-1.5"
                  >
                    {colLabel}

                    {/* Column Filter Dropdown UI */}
                    {showFilterDropdowns && (
                      <input
                        type="text"
                        placeholder="🔍"
                        value={columnFilters[c] || ""}
                        onChange={(e) => handleApplyFilterValue(c, e.target.value)}
                        className="block mx-auto w-11/12 text-[9px] bg-surface-800 text-white rounded border border-surface-600 px-1 py-0.5 mt-1 font-normal focus:outline-none"
                      />
                    )}

                    {/* Resize Handle */}
                    <div
                      className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand-500/50"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setResizingCol({
                          idx: c,
                          startX: e.clientX,
                          startWidth: width,
                        });
                      }}
                      onMouseUp={() => setResizingCol(null)}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {/* Rows Loop */}
            {Array.from({ length: DEFAULT_ROWS }).map((_, r) => {
              // Apply simple row filtering based on typed column filter values
              let shouldShow = true;
              Object.entries(columnFilters).forEach(([colIdx, filterStr]) => {
                if (filterStr) {
                  const displayValue = getCellDisplayValue(r, Number(colIdx));
                  if (!displayValue.toLowerCase().includes(filterStr.toLowerCase())) {
                    shouldShow = false;
                  }
                }
              });

              if (!shouldShow) return null;

              const height = currentSheetData.rowHeights[r] || DEFAULT_ROW_HEIGHT;

              return (
                <tr key={r} style={{ height }} className="border-b border-surface-700">
                  {/* Row Index Head Label */}
                  <td className="w-10 bg-surface-900 border border-surface-600 text-center text-[10px] text-neutral-400 font-bold select-none sticky left-0 z-20">
                    {r + 1}
                    {/* Resize handle */}
                    <div
                      className="absolute bottom-0 left-0 right-0 h-1 cursor-row-resize hover:bg-brand-500/50"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setResizingRow({
                          idx: r,
                          startY: e.clientY,
                          startHeight: height,
                        });
                      }}
                      onMouseUp={() => setResizingRow(null)}
                    />
                  </td>

                  {/* Grid cells */}
                  {Array.from({ length: DEFAULT_COLS }).map((_, c) => {
                    const ref = `${indexToColLabel(c)}${r + 1}`;
                    const cell = currentSheetData.cells[ref] || {};
                    const format = cell.format || {};

                    // Is this cell the start or part of a merged range?
                    let isMergedPart = false;
                    let isMergeStart = false;
                    let mergeSpan = { rowSpan: 1, colSpan: 1 };

                    currentSheetData.mergedCells.forEach((m) => {
                      if (r >= m.startRow && r <= m.endRow && c >= m.startCol && c <= m.endCol) {
                        isMergedPart = true;
                        if (r === m.startRow && c === m.startCol) {
                          isMergeStart = true;
                          mergeSpan = {
                            rowSpan: m.endRow - m.startRow + 1,
                            colSpan: m.endCol - m.startCol + 1,
                          };
                        }
                      }
                    });

                    if (isMergedPart && !isMergeStart) return null;

                    // Highlight selection class
                    const isSelected =
                      selectedRange &&
                      r >= Math.min(selectedRange.startRow, selectedRange.endRow) &&
                      r <= Math.max(selectedRange.startRow, selectedRange.endRow) &&
                      c >= Math.min(selectedRange.startCol, selectedRange.endCol) &&
                      c <= Math.max(selectedRange.startCol, selectedRange.endCol);

                    // Auto-fill highlighted bounds
                    const isFillHighlighted =
                      fillRange &&
                      r >= Math.min(fillRange.startRow, fillRange.endRow) &&
                      r <= Math.max(fillRange.startRow, fillRange.endRow) &&
                      c >= Math.min(fillRange.startCol, fillRange.endCol) &&
                      c <= Math.max(fillRange.startCol, fillRange.endCol);

                    return (
                      <td
                        key={c}
                        rowSpan={mergeSpan.rowSpan}
                        colSpan={mergeSpan.colSpan}
                        onMouseDown={(e) => {
                          if (e.button === 2) {
                            // Right click context menu
                            e.preventDefault();
                            setContextMenu({ x: e.clientX, y: e.clientY });
                          } else {
                            setIsSelecting(true);
                            setSelectedRange({ startRow: r, startCol: c, endRow: r, endCol: c });
                          }
                        }}
                        onMouseEnter={() => {
                          if (isSelecting && selectedRange) {
                            setSelectedRange((prev) => {
                              if (!prev) return null;
                              return { ...prev, endRow: r, endCol: c };
                            });
                          }
                          if (isDraggingFill && selectedRange) {
                            setFillRange({
                              startRow: selectedRange.startRow,
                              startCol: selectedRange.startCol,
                              endRow: r,
                              endCol: c,
                            });
                          }
                        }}
                        onDoubleClick={() => handleStartEdit()}
                        className={`
                          border border-surface-700 text-xs px-2 select-none relative focus:outline-none transition-all
                          ${isSelected ? "bg-brand-500/10 border-brand-500" : ""}
                          ${isFillHighlighted ? "border-brand-500/80 bg-brand-500/5" : ""}
                        `}
                        style={{
                          fontWeight: format.bold ? "bold" : "normal",
                          fontStyle: format.italic ? "italic" : "normal",
                          textDecoration: `${format.underline ? "underline" : ""} ${
                            format.strikethrough ? "line-through" : ""
                          }`.trim(),
                          fontSize: format.fontSize ? `${format.fontSize}px` : "12px",
                          color: format.fontColor || "inherit",
                          backgroundColor: isSelected
                            ? undefined
                            : format.backgroundColor || undefined,
                          textAlign: format.textAlign || "left",
                        }}
                      >
                        {/* Inline Text Input Editor when editing this specific cell */}
                        {isEditingCell &&
                        selectedRange &&
                        selectedRange.startRow === r &&
                        selectedRange.startCol === c ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleCommitEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleCommitEdit();
                              if (e.key === "Escape") setIsEditingCell(false);
                            }}
                            autoFocus
                            className="absolute inset-0 w-full h-full bg-surface-950 border border-brand-500 text-white px-2 focus:outline-none z-10"
                          />
                        ) : (
                          getCellDisplayValue(r, c)
                        )}

                        {/* Bottom right handle square for Auto fill series dragging */}
                        {isSelected &&
                          selectedRange &&
                          selectedRange.endRow === r &&
                          selectedRange.endCol === c && (
                            <div
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                setIsDraggingFill(true);
                                setFillRange({ ...selectedRange });
                              }}
                              className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-brand-500 border border-white cursor-crosshair z-10"
                              title="Drag to auto fill series values"
                            />
                          )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bottom Sheet Management Tab switcher */}
      <SheetTabs
        sheets={sheets}
        activeSheetId={activeSheetId}
        onSelectSheet={handleSelectSheet}
        onAddSheet={handleAddSheet}
        onRenameSheet={handleRenameSheet}
        onDeleteSheet={handleDeleteSheet}
      />

      {/* Right Click Context Menu Popup */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onInsertRow={handleInsertRow}
          onDeleteRow={handleDeleteRow}
          onInsertCol={handleInsertCol}
          onDeleteCol={handleDeleteCol}
          onMergeCells={handleMerge}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
        />
      )}

      {/* Find and Replace Modal Dialog Box */}
      {showFindReplace && (
        <FindReplace
          onClose={() => setShowFindReplace(false)}
          onFind={handleFind}
          onReplace={handleReplace}
        />
      )}
    </div>
  );
}
