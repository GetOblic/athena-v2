"use client";

import { createContext, useContext, type ReactNode } from "react";
import type {
  PersonaConversationAssetReference,
  PersonaConversationVersionState,
} from "@/services/personaConversation/personaConversationTypes";

/**
 * Workspace → Persona Ask Athena bridge for Discuss with Athena.
 * Panel is mounted in afterDetailedReasoning; state lives in the workspace.
 */
export type PersonaDiscussContextValue = {
  assetReference: PersonaConversationAssetReference | null;
  onAssetReferenceChange: (
    next: PersonaConversationAssetReference | null,
  ) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Selected Executive Version from the workspace (Discuss / archived scope). */
  executiveVersionId: string | null;
  versionState: PersonaConversationVersionState;
  versionLabel: string | null;
};

const PersonaDiscussContext =
  createContext<PersonaDiscussContextValue | null>(null);

export function PersonaDiscussProvider({
  value,
  children,
}: {
  value: PersonaDiscussContextValue;
  children: ReactNode;
}) {
  return (
    <PersonaDiscussContext.Provider value={value}>
      {children}
    </PersonaDiscussContext.Provider>
  );
}

export function usePersonaDiscussContext(): PersonaDiscussContextValue | null {
  return useContext(PersonaDiscussContext);
}
