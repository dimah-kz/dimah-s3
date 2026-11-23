/** What an audit event records. */
export type AuditEventType = "upload" | "download" | "delete" | "note";

/** One audit event. Every field is JSON, so the client receives it as is. */
export type AuditEvent = {
  id: string;
  type: AuditEventType;
  route: string;
  key: string;
  /** ISO time the event was recorded. */
  at: string;
  /** Bytes S3 verified, on `upload`. */
  size?: number;
  /** The text of a `note`. */
  message?: string;
};

/** An event before the store gives it an id and a time. */
export type AuditEventInput = Omit<AuditEvent, "id" | "at">;

export type AuditQuery = {
  /** Only this route's events. */
  route?: string;
  /** Most events to return. */
  limit: number;
};

/** Where events are kept. Back it with your database in production. */
export type AuditStore = {
  add: (event: AuditEventInput) => Promise<AuditEvent>;
  /** Newest first. */
  list: (query: AuditQuery) => Promise<AuditEvent[]>;
};

/** An {@link AuditStore} in memory that keeps the newest `maxEvents`. */
export function memoryAuditStore(
  options: { maxEvents?: number } = {},
): AuditStore {
  const maxEvents = options.maxEvents ?? 1000;
  const events: AuditEvent[] = [];
  let count = 0;
  return {
    add: async (input) => {
      count += 1;
      const event: AuditEvent = {
        ...input,
        id: String(count),
        at: new Date().toISOString(),
      };
      events.unshift(event);
      events.length = Math.min(events.length, maxEvents);
      return event;
    },
    list: async ({ route, limit }) =>
      events
        .filter((event) => route === undefined || event.route === route)
        .slice(0, limit),
  };
}
