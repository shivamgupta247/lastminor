"use client";

import { useEffect, useState } from "react";
import { Allotment } from "allotment";
import { useRouter } from "next/navigation";

import { ConversationSidebar } from "@/features/conversations/components/conversation-sidebar";
import { ProductTour, EDITOR_TOUR_STEPS } from "@/components/product-tour";
import { Spinner } from "@/components/ui/spinner";

import { Navbar } from "./navbar";
import { Id } from "../../../../convex/_generated/dataModel";
import { useProject } from "../hooks/use-projects";

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 800;
const DEFAULT_CONVERSATION_SIDEBAR_WIDTH = 400;
const DEFAULT_MAIN_SIZE = 1000;

export const ProjectIdLayout = ({
  children,
  projectId,
}: {
  children: React.ReactNode;
  projectId: Id<"projects">;
}) => {
  const router = useRouter();
  const project = useProject(projectId);
  const [tourOpen, setTourOpen] = useState(false);
  const [showChat, setShowChat] = useState(true);

  useEffect(() => {
    if (project === null) {
      router.replace("/");
    }
  }, [project, router]);

  if (project === undefined || project === null) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-sidebar">
        <Spinner className="size-6 text-ring" />
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col">
      <Navbar
        projectId={projectId}
        onTourStart={() => setTourOpen(true)}
        showChat={showChat}
        onChatToggle={() => setShowChat((v) => !v)}
      />
      <ProductTour
        steps={EDITOR_TOUR_STEPS}
        isOpen={tourOpen}
        onClose={() => setTourOpen(false)}
      />
      <div className="flex-1 flex overflow-hidden">
        <Allotment
          className="flex-1"
          defaultSizes={[
            DEFAULT_CONVERSATION_SIDEBAR_WIDTH,
            DEFAULT_MAIN_SIZE
          ]}
        >
          <Allotment.Pane
            snap
            visible={showChat}
            minSize={MIN_SIDEBAR_WIDTH}
            maxSize={MAX_SIDEBAR_WIDTH}
            preferredSize={DEFAULT_CONVERSATION_SIDEBAR_WIDTH}
          >
            <ConversationSidebar projectId={projectId} />
          </Allotment.Pane>
          <Allotment.Pane>
            {children}
          </Allotment.Pane>
        </Allotment>
      </div>
    </div>
  );
};
