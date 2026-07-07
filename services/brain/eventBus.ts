export type BrainEventType =
  | "briefing.approved"
  | "discussion.imported";

export type BrainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  type: BrainEventType;
  payload: TPayload;
  occurredAt: string;
};

type BrainEventHandler<TPayload extends Record<string, unknown> = Record<string, unknown>> = (
  event: BrainEvent<TPayload>
) => Promise<void>;

const handlers = new Map<BrainEventType, BrainEventHandler[]>();

export function onBrainEvent<TPayload extends Record<string, unknown>>(
  type: BrainEventType,
  handler: BrainEventHandler<TPayload>
) {
  const existingHandlers = handlers.get(type) ?? [];
  existingHandlers.push(handler as BrainEventHandler);
  handlers.set(type, existingHandlers);
}

export async function emitBrainEvent<TPayload extends Record<string, unknown>>(
  type: BrainEventType,
  payload: TPayload
) {
  const event: BrainEvent<TPayload> = {
    type,
    payload,
    occurredAt: new Date().toISOString(),
  };

  const eventHandlers = handlers.get(type) ?? [];

  await Promise.all(
    eventHandlers.map((handler) => handler(event))
  );
}
