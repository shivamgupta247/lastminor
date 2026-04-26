"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";

import "./product-tour.css";

/* ---- Types ---- */
export interface TourStep {
  /** CSS selector or data-tour attribute value */
  target: string;
  title: string;
  description: string;
  /** Where to place the tooltip relative to the target */
  placement?: "top" | "bottom" | "left" | "right";
}

interface ProductTourProps {
  steps: TourStep[];
  isOpen: boolean;
  onClose: () => void;
}

/* ---- Helpers ---- */
const getElement = (target: string): HTMLElement | null => {
  // Try data-tour attribute first, then #id, then raw CSS selector
  return (
    document.querySelector<HTMLElement>(`[data-tour="${target}"]`) ??
    document.querySelector<HTMLElement>(`#${target}`) ??
    document.querySelector<HTMLElement>(target)
  );
};

const PADDING = 8;
const TOOLTIP_GAP = 14;

const getTooltipPosition = (
  rect: DOMRect,
  placement: string,
  tooltipW: number,
  tooltipH: number,
) => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = 0;
  let left = 0;
  let arrow: "top" | "bottom" | "left" | "right" = "top";

  switch (placement) {
    case "bottom":
      top = rect.bottom + PADDING + TOOLTIP_GAP;
      left = rect.left + rect.width / 2 - tooltipW / 2;
      arrow = "top";
      break;
    case "top":
      top = rect.top - PADDING - TOOLTIP_GAP - tooltipH;
      left = rect.left + rect.width / 2 - tooltipW / 2;
      arrow = "bottom";
      break;
    case "right":
      top = rect.top + rect.height / 2 - tooltipH / 2;
      left = rect.right + PADDING + TOOLTIP_GAP;
      arrow = "left";
      break;
    case "left":
      top = rect.top + rect.height / 2 - tooltipH / 2;
      left = rect.left - PADDING - TOOLTIP_GAP - tooltipW;
      arrow = "right";
      break;
  }

  // Clamp to viewport
  if (left < 16) left = 16;
  if (left + tooltipW > vw - 16) left = vw - 16 - tooltipW;
  if (top < 16) top = 16;
  if (top + tooltipH > vh - 16) top = vh - 16 - tooltipH;

  return { top, left, arrow };
};

/* ---- Component ---- */
export const ProductTour = ({ steps, isOpen, onClose }: ProductTourProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; arrow: "top" | "bottom" | "left" | "right" }>({ top: 0, left: 0, arrow: "top" });

  const step = steps[currentStep];

  const updatePosition = useCallback(() => {
    if (!step) return;
    const el = getElement(step.target);
    if (!el) {
      // Element not found — skip to next step or close
      console.warn(`[Tour] Element not found for target: "${step.target}"`);
      return;
    }

    // Scroll element into view if needed
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });

    const rect = el.getBoundingClientRect();
    setSpotlightRect(rect);

    // Tooltip position
    const tooltipEl = tooltipRef.current;
    const tooltipW = tooltipEl?.offsetWidth ?? 320;
    const tooltipH = tooltipEl?.offsetHeight ?? 200;
    const placement = step.placement ?? "bottom";

    setTooltipPos(getTooltipPosition(rect, placement, tooltipW, tooltipH));
  }, [step]);

  // Update position on step change and on scroll/resize
  useEffect(() => {
    if (!isOpen) return;

    // Small delay for elements to render
    const timeout = setTimeout(updatePosition, 100);

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, currentStep, updatePosition]);

  // Re-measure once tooltip renders
  useEffect(() => {
    if (!isOpen || !spotlightRect) return;
    const raf = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, spotlightRect]);

  // Reset when opened
  useEffect(() => {
    if (isOpen) setCurrentStep(0);
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === "Enter") {
        if (currentStep < steps.length - 1) setCurrentStep((s) => s + 1);
        else onClose();
      }
      if (e.key === "ArrowLeft" && currentStep > 0) {
        setCurrentStep((s) => s - 1);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, currentStep, steps.length, onClose]);

  if (!isOpen || !step) return null;

  const isLast = currentStep === steps.length - 1;

  return createPortal(
    <>
      {/* Overlay — clicking it closes */}
      <div className="tour-overlay" onClick={onClose} />

      {/* Spotlight */}
      {spotlightRect && (
        <div
          className="tour-spotlight"
          style={{
            top: spotlightRect.top - PADDING,
            left: spotlightRect.left - PADDING,
            width: spotlightRect.width + PADDING * 2,
            height: spotlightRect.height + PADDING * 2,
          }}
        />
      )}

      {/* Tooltip */}
      {spotlightRect && (
        <div
          ref={tooltipRef}
          className="tour-tooltip"
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
          key={currentStep}
        >
          {/* Arrow */}
          <div className={`tour-tooltip-arrow ${tooltipPos.arrow}`} />

          {/* Step label */}
          <div className="tour-step-label">
            <HelpCircle style={{ width: 12, height: 12 }} />
            Step {currentStep + 1} of {steps.length}
          </div>

          {/* Content */}
          <div className="tour-title">{step.title}</div>
          <div className="tour-desc">{step.description}</div>

          {/* Footer */}
          <div className="tour-footer">
            {/* Dots */}
            <div className="tour-dots">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`tour-dot ${
                    i === currentStep ? "active" : i < currentStep ? "done" : ""
                  }`}
                />
              ))}
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: 6 }}>
              {currentStep === 0 ? (
                <button className="tour-btn tour-btn-skip" onClick={onClose}>
                  Skip
                </button>
              ) : (
                <button
                  className="tour-btn tour-btn-back"
                  onClick={() => setCurrentStep((s) => s - 1)}
                >
                  Back
                </button>
              )}

              <button
                className="tour-btn tour-btn-next"
                onClick={() => {
                  if (isLast) onClose();
                  else setCurrentStep((s) => s + 1);
                }}
              >
                {isLast ? "Done!" : "Next"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
};

/* ---- Dashboard Tour Steps ---- */
export const DASHBOARD_TOUR_STEPS: TourStep[] = [
  {
    target: "tour-new-btn",
    title: "✨ Create New Project",
    description:
      "Click here to start a new project. Write your prompt describing what you want to build, and AI will create the entire project for you.",
    placement: "bottom",
  },
  {
    target: "tour-import-btn",
    title: "📦 Import from GitHub",
    description:
      "Already have a repository? Paste a GitHub URL here to import your existing code into the workspace and enhance it with AI.",
    placement: "bottom",
  },
  {
    target: "tour-blank-project-btn",
    title: "📁 New Blank Project",
    description:
      "Create a project by just entering a name — no AI needed. It sets up HTML, CSS, JS, and package.json boilerplate so you can start coding right away.",
    placement: "bottom",
  },
  {
    target: "tour-theme-toggle",
    title: "🌓 Light / Dark Mode",
    description:
      "Toggle between light and dark themes. Switch to whichever feels comfortable for your eyes.",
    placement: "bottom",
  },
  {
    target: "tour-projects-list",
    title: "📁 Your Projects",
    description:
      "All your projects appear here sorted by last updated. Click any project to open it in the full editor with AI assistance.",
    placement: "top",
  },
];

/* ---- Editor Tour Steps ---- */
export const EDITOR_TOUR_STEPS: TourStep[] = [
  {
    target: "tour-chat-sidebar",
    title: "💬 AI Chat Assistant",
    description:
      "This is your AI assistant. Ask it anything — describe changes in plain language and it will write code, fix bugs, and apply changes automatically.",
    placement: "right",
  },
  {
    target: "tour-prompt-input",
    title: "⌨️ Ask Nexus AI Anything",
    description:
      "Type your prompt here. For example: 'Add a dark mode toggle' or 'Fix the login page'. The AI will understand your project context and make changes.",
    placement: "top",
  },
  {
    target: "tour-file-explorer",
    title: "📂 File Explorer",
    description:
      "Browse your project files and folders here. Click any file to open it in the code editor.",
    placement: "right",
  },
  {
    target: "tour-file-actions",
    title: "📄 Create Files & Folders",
    description:
      "Use the icons in this toolbar: the first icon creates a new file, the second creates a new folder, and the third collapses all folders. You can also right-click in the tree for more options.",
    placement: "bottom",
  },
  {
    target: "tour-code-tab",
    title: "💻 Code Editor",
    description:
      "The 'Code' tab opens a full-featured code editor with syntax highlighting. Edit files directly and changes save automatically.",
    placement: "bottom",
  },
  {
    target: "tour-preview-tab",
    title: "👁️ Live Preview",
    description:
      "Switch to 'Preview' to see your app running live. Changes reflect instantly — no manual refresh needed!",
    placement: "bottom",
  },
  {
    target: "tour-export-btn",
    title: "📤 Export Project",
    description:
      "When you're done, export your project to download the code or push it to GitHub.",
    placement: "bottom",
  },
];
