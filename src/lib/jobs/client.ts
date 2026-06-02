import { Inngest } from "inngest";

/**
 * Inngest client singleton.
 *
 * Locally and in production, Inngest functions register with this client.
 * Without INNGEST_EVENT_KEY set, Inngest runs in dev mode using its dev server.
 */
export const inngest = new Inngest({
  id: "atib",
  name: "Atib",
});

/**
 * Type-safe event names used across the app. Add new events here so the
 * sender and the receiver agree on the contract.
 */
export interface AtibEvents {
  "signal/created": {
    data: {
      signalId: string;
      workspaceId: string;
    };
  };
  "positioning/audit-requested": {
    data: {
      workspaceId: string;
      framework: "5c" | "kindergarten" | "need_gap";
    };
  };
}
