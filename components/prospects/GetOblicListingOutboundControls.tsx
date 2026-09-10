"use client";

import { useState, type ReactNode } from "react";
import { BookOpen, FileText } from "lucide-react";
import {
  PROSPECT_DETAIL_ICON,
  PROSPECT_UTILITY_CYAN_ACTION,
  PROSPECT_UTILITY_VIOLET_ACTION,
} from "@/lib/prospects/prospectDetailPresentation";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { TenantMessages } from "@/lib/tenantI18n/types";

type OutboundActionState = {
  pending: boolean;
  success: boolean;
  error: string | null;
};

type GetOblicListingOutboundControlsProps = {
  prospectId: string;
  hasGeneratedDescription: boolean;
  hasCurrentKnowledgeBase: boolean;
  messages: TenantMessages;
};

const idleState: OutboundActionState = {
  pending: false,
  success: false,
  error: null,
};

export function GetOblicListingOutboundControls({
  prospectId,
  hasGeneratedDescription,
  hasCurrentKnowledgeBase,
  messages,
}: GetOblicListingOutboundControlsProps) {
  const copy = messages.prospects.detail;
  const [descriptionState, setDescriptionState] =
    useState<OutboundActionState>(idleState);
  const [knowledgeBaseState, setKnowledgeBaseState] =
    useState<OutboundActionState>(idleState);

  async function sendDescription() {
    if (descriptionState.pending || !hasGeneratedDescription) return;
    setDescriptionState({ pending: true, success: false, error: null });
    try {
      const response = await fetch(
        `/api/prospects/${prospectId}/getoblic-directory/description`,
        { method: "POST", credentials: "same-origin" },
      );
      const payload = await parseJsonResponse<{
        ok?: boolean;
        success?: boolean;
        error?: { message?: string } | string;
      }>(response);
      const errorMessage = readErrorMessage(
        payload.error,
        copy.sendDescriptionToGetOblicFailed,
      );
      if (!response.ok || !payload.ok || !payload.success) {
        throw new Error(errorMessage);
      }
      setDescriptionState({ pending: false, success: true, error: null });
    } catch (error) {
      setDescriptionState({
        pending: false,
        success: false,
        error:
          error instanceof Error
            ? error.message
            : copy.sendDescriptionToGetOblicFailed,
      });
    }
  }

  async function sendKnowledgeBase() {
    if (knowledgeBaseState.pending || !hasCurrentKnowledgeBase) return;
    setKnowledgeBaseState({ pending: true, success: false, error: null });
    try {
      const response = await fetch(
        `/api/prospects/${prospectId}/getoblic-directory/knowledge-base`,
        { method: "POST", credentials: "same-origin" },
      );
      const payload = await parseJsonResponse<{
        ok?: boolean;
        success?: boolean;
        error?: { message?: string } | string;
      }>(response);
      const errorMessage = readErrorMessage(
        payload.error,
        copy.sendKnowledgeBaseToGetOblicFailed,
      );
      if (!response.ok || !payload.ok || !payload.success) {
        throw new Error(errorMessage);
      }
      setKnowledgeBaseState({ pending: false, success: true, error: null });
    } catch (error) {
      setKnowledgeBaseState({
        pending: false,
        success: false,
        error:
          error instanceof Error
            ? error.message
            : copy.sendKnowledgeBaseToGetOblicFailed,
      });
    }
  }

  return (
    <div
      data-prospect-detail="getoblic-outbound"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <OutboundAction
          icon={<FileText className="size-4" aria-hidden="true" />}
          iconClassName={PROSPECT_DETAIL_ICON.cyan}
          buttonClassName={PROSPECT_UTILITY_CYAN_ACTION}
          label={copy.sendDescriptionToGetOblic}
          sendingLabel={copy.sendingToGetOblic}
          successLabel={copy.sentToGetOblic}
          title={copy.sendDescriptionToGetOblicOverwrite}
          disabledReason={copy.sendDescriptionToGetOblicDisabled}
          disabled={!hasGeneratedDescription}
          state={descriptionState}
          onClick={() => void sendDescription()}
        />
        <OutboundAction
          icon={<BookOpen className="size-4" aria-hidden="true" />}
          iconClassName={PROSPECT_DETAIL_ICON.violet}
          buttonClassName={PROSPECT_UTILITY_VIOLET_ACTION}
          label={copy.sendKnowledgeBaseToGetOblic}
          sendingLabel={copy.sendingToGetOblic}
          successLabel={copy.sentToGetOblic}
          title={copy.sendKnowledgeBaseToGetOblicOverwrite}
          disabledReason={copy.sendKnowledgeBaseToGetOblicDisabled}
          disabled={!hasCurrentKnowledgeBase}
          state={knowledgeBaseState}
          onClick={() => void sendKnowledgeBase()}
        />
      </div>
      {descriptionState.error ? (
        <div className="text-sm text-red-300" role="alert">
          {descriptionState.error}
        </div>
      ) : null}
      {knowledgeBaseState.error ? (
        <div className="text-sm text-red-300" role="alert">
          {knowledgeBaseState.error}
        </div>
      ) : null}
    </div>
  );
}

function OutboundAction({
  icon,
  iconClassName,
  buttonClassName,
  label,
  sendingLabel,
  successLabel,
  title,
  disabledReason,
  disabled,
  state,
  onClick,
}: {
  icon: ReactNode;
  iconClassName: string;
  buttonClassName: string;
  label: string;
  sendingLabel: string;
  successLabel: string;
  title: string;
  disabledReason: string;
  disabled: boolean;
  state: OutboundActionState;
  onClick: () => void;
}) {
  const buttonDisabled = disabled || state.pending;
  const caption = state.pending
    ? sendingLabel
    : state.success
      ? successLabel
      : label;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={buttonDisabled}
      aria-busy={state.pending}
      title={disabled ? disabledReason : title}
      className={buttonClassName}
    >
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-xl ${iconClassName}`}
      >
        {icon}
      </span>
      {caption}
    </button>
  );
}

function readErrorMessage(
  error: { message?: string } | string | undefined,
  fallback: string,
): string {
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  if (
    error &&
    typeof error === "object" &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message.trim();
  }
  return fallback;
}
