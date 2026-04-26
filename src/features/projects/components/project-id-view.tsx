"use client";

import { useState } from "react";
import { Allotment } from "allotment";
import { PanelLeftCloseIcon, PanelRightCloseIcon, PanelLeftOpenIcon, PanelRightOpenIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { EditorView } from "@/features/editor/components/editor-view";

import { FileExplorer } from "./file-explorer";
import { Id } from "../../../../convex/_generated/dataModel";
import { PreviewView } from "./preview-view";
import { ExportPopover } from "./export-popover";

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 800;
const DEFAULT_SIDEBAR_WIDTH = 280;
const DEFAULT_CODE_SIZE = 500;
const DEFAULT_PREVIEW_SIZE = 500;

export const ProjectIdView = ({ 
  projectId
}: { 
  projectId: Id<"projects">
}) => {
  const [showCode, setShowCode] = useState(true);
  const [showPreview, setShowPreview] = useState(true);

  const toggleCode = () => {
    if (showCode && !showPreview) return; // don't hide both
    setShowCode((v) => !v);
  };

  const togglePreview = () => {
    if (showPreview && !showCode) return; // don't hide both
    setShowPreview((v) => !v);
  };

  return (
    <div className="h-full flex flex-col">
      <nav className="h-8.75 flex items-center bg-sidebar border-b">
        <button
          data-tour="tour-code-tab"
          onClick={toggleCode}
          title={showCode ? "Collapse code panel" : "Expand code panel"}
          className={cn(
            "flex items-center gap-2 h-full px-3 border-r cursor-pointer transition-colors",
            showCode
              ? "text-foreground bg-background"
              : "text-muted-foreground hover:bg-accent/30"
          )}
        >
          {showCode ? (
            <PanelLeftCloseIcon className="size-3.5" />
          ) : (
            <PanelLeftOpenIcon className="size-3.5" />
          )}
          <span className="text-sm font-medium">Code</span>
        </button>
        <div className="flex-1" />
        <button
          data-tour="tour-preview-tab"
          onClick={togglePreview}
          title={showPreview ? "Collapse preview panel" : "Expand preview panel"}
          className={cn(
            "flex items-center gap-2 h-full px-3 border-l cursor-pointer transition-colors",
            showPreview
              ? "text-foreground bg-background"
              : "text-muted-foreground hover:bg-accent/30"
          )}
        >
          <span className="text-sm font-medium">Preview</span>
          {showPreview ? (
            <PanelRightCloseIcon className="size-3.5" />
          ) : (
            <PanelRightOpenIcon className="size-3.5" />
          )}
        </button>
        <div className="flex justify-end h-full">
          <div data-tour="tour-export-btn">
            <ExportPopover projectId={projectId} />
          </div>
        </div>
      </nav>
      <div className="flex-1 min-h-0">
        <Allotment defaultSizes={[DEFAULT_SIDEBAR_WIDTH, DEFAULT_CODE_SIZE, DEFAULT_PREVIEW_SIZE]}>
          <Allotment.Pane
            snap
            visible={showCode}
            minSize={MIN_SIDEBAR_WIDTH}
            maxSize={MAX_SIDEBAR_WIDTH}
            preferredSize={DEFAULT_SIDEBAR_WIDTH}
          >
            <div data-tour="tour-file-explorer" className="h-full">
              <FileExplorer projectId={projectId} />
            </div>
          </Allotment.Pane>
          <Allotment.Pane visible={showCode} minSize={200}>
            <EditorView projectId={projectId} />
          </Allotment.Pane>
          <Allotment.Pane visible={showPreview} minSize={200}>
            <PreviewView projectId={projectId} />
          </Allotment.Pane>
        </Allotment>
      </div>
    </div>
  );
};
