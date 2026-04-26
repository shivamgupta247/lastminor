"use client";

import { useState } from "react";
import ky from "ky";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { FolderPlusIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { Id } from "../../../../convex/_generated/dataModel";

interface BlankProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const BlankProjectDialog = ({
  open,
  onOpenChange,
}: BlankProjectDialogProps) => {
  const router = useRouter();
  const [projectName, setProjectName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = projectName.trim();
    if (!trimmed) return;

    setIsSubmitting(true);

    try {
      const { projectId } = await ky
        .post("/api/projects/create-blank", {
          json: { projectName: trimmed },
        })
        .json<{ projectId: Id<"projects"> }>();

      toast.success(`Project "${trimmed}" created with boilerplate files`);
      onOpenChange(false);
      setProjectName("");
      router.push(`/projects/${projectId}`);
    } catch {
      toast.error("Unable to create project");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && projectName.trim()) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlusIcon className="size-5" />
            New Blank Project
          </DialogTitle>
          <DialogDescription>
            Create a project with HTML, CSS, JS, and package.json boilerplate.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-2">
          <Input
            autoFocus
            placeholder="Enter project name..."
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
            className="h-10"
          />
          <Button
            onClick={handleSubmit}
            disabled={!projectName.trim() || isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Creating..." : "Create Project"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
