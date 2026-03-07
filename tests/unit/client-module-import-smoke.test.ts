/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/lib/api", () => ({
  default: apiMock,
  apiBaseUrl: "/api",
  resolveApiBaseUrl: () => "/api",
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

describe("client module import smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockResolvedValue([]);
    apiMock.post.mockResolvedValue({});
    apiMock.put.mockResolvedValue({});
    apiMock.patch.mockResolvedValue({});
    apiMock.delete.mockResolvedValue({});
  });

  it("should import client ui, hooks, services, and library modules without crashing", async () => {
    const groups = [
      import.meta.glob("../../client/src/components/ui/*.{ts,tsx}"),
      import.meta.glob("../../client/src/hooks/*.{ts,tsx}"),
      import.meta.glob("../../client/src/services/*.ts"),
      import.meta.glob("../../client/src/lib/*.ts"),
      import.meta.glob("../../client/src/components/forms/*.{ts,tsx}"),
      import.meta.glob("../../client/src/components/shared/*.{ts,tsx}"),
      import.meta.glob("../../client/src/components/reports/*.{ts,tsx}"),
      import.meta.glob("../../client/src/components/consumables/*.{ts,tsx}"),
      import.meta.glob("../../client/src/components/auth/*.{ts,tsx}"),
      import.meta.glob("../../client/src/contexts/*.{ts,tsx}"),
      import.meta.glob("../../client/src/config/*.{ts,tsx}"),
    ];

    for (const group of groups) {
      for (const [file, load] of Object.entries(group)) {
        const mod = await load();
        expect(mod, `expected module to load: ${file}`).toBeTruthy();
      }
    }
  }, 60000);
});
