"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { spreadsheetsApi } from "@/lib/api";
import { Spreadsheet, SheetData, SheetMeta } from "@/types";
import SpreadsheetEditor from "@/components/Spreadsheet/SpreadsheetEditor";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface SpreadsheetPageProps {
  params: Promise<{ id: string }>;
}

export default function SpreadsheetPage({ params }: SpreadsheetPageProps) {
  const router = useRouter();
  const { id } = use(params);

  const [spreadsheet, setSpreadsheet] = useState<Spreadsheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Authenticate
  useEffect(() => {
    if (!isAuthenticated()) router.replace("/login");
  }, [router]);

  useEffect(() => {
    async function loadSpreadsheet() {
      try {
        setLoading(true);
        const res = await spreadsheetsApi.get(id);
        setSpreadsheet(res.data);
      } catch (err) {
        setError("Failed to load spreadsheet. It may have been deleted.");
      } finally {
        setLoading(false);
      }
    }
    loadSpreadsheet();
  }, [id]);

  const handleSave = async (
    title: string,
    workbookData: Record<string, SheetData>,
    sheets: SheetMeta[],
    activeSheetId: string
  ) => {
    try {
      await spreadsheetsApi.update(id, {
        title,
        workbook_data: workbookData,
        sheets,
        active_sheet_id: activeSheetId,
      });
    } catch (err) {
      // Silently handle save error in background
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-800 text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          <span className="text-sm text-neutral-400 font-semibold">Loading workbook...</span>
        </div>
      </div>
    );
  }

  if (error || !spreadsheet) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-surface-800 text-white gap-4">
        <p className="text-red-400 text-sm font-semibold">{error || "Spreadsheet not found"}</p>
        <Link href="/spreadsheets" className="btn-secondary text-xs flex items-center gap-1.5 px-4 py-2">
          <ArrowLeft className="w-4 h-4" /> Back to Spreadsheets
        </Link>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-surface-800 overflow-hidden">
      {/* Back to list sub-bar */}
      <div className="bg-surface-900 px-4 py-1.5 border-b border-surface-600 flex items-center gap-3 shrink-0">
        <Link
          href="/spreadsheets"
          className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </Link>
        <span className="text-neutral-600 text-xs">/</span>
        <span className="text-xs text-neutral-500 font-semibold">Spreadsheets</span>
      </div>

      <div className="flex-1 overflow-hidden">
        <SpreadsheetEditor
          initialTitle={spreadsheet.title}
          initialWorkbookData={spreadsheet.workbook_data}
          initialSheets={spreadsheet.sheets}
          initialActiveSheetId={spreadsheet.active_sheet_id}
          onSave={handleSave}
        />
      </div>
    </div>
  );
}
