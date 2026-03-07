import { describe, expect, it } from "vitest";

import { API_CONFIG } from "../../client/src/config/api.config";
import {
  NOTIFICATION_AREA_DEFINITIONS,
  NOTIFICATION_TOGGLE_LABELS,
} from "../../client/src/config/notificationAreas";
import { cn } from "../../client/src/lib/utils";

describe("app configuration helpers", () => {
  it("should cap query retry delays and expose stable cache keys", () => {
    expect(API_CONFIG.backend).toBe("rest");
    expect(API_CONFIG.query.retryDelay(0)).toBe(1000);
    expect(API_CONFIG.query.retryDelay(4)).toBe(16000);
    expect(API_CONFIG.query.retryDelay(10)).toBe(30000);
    expect(API_CONFIG.queryKeys.notifications).toEqual(["notifications"]);
    expect(API_CONFIG.messages.transferError).toBe("Failed to process transfer");
  });

  it("should define notification areas with valid toggle labels and unique ids", () => {
    const ids = NOTIFICATION_AREA_DEFINITIONS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(NOTIFICATION_AREA_DEFINITIONS.every((entry) => NOTIFICATION_TOGGLE_LABELS[entry.toggle])).toBe(true);
    expect(NOTIFICATION_AREA_DEFINITIONS.some((entry) => entry.status === "Planned")).toBe(true);
  });

  it("should merge and deduplicate Tailwind class names", () => {
    expect(cn("px-2", undefined, false, "px-4", ["text-sm", null], "font-medium")).toBe(
      "px-4 text-sm font-medium"
    );
  });
});
