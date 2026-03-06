/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useAuthMock = vi.fn();
const useNotificationsMock = vi.fn();
const useMarkAllNotificationsReadMock = vi.fn();
const canAccessPageMock = vi.fn();
const navigateMock = vi.fn();
const markAllReadMutateMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: (args: unknown) => useNotificationsMock(args),
  useMarkAllNotificationsRead: () => useMarkAllNotificationsReadMock(),
}));

vi.mock("@/config/pagePermissions", () => ({
  canAccessPage: (args: unknown) => canAccessPageMock(args),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import { Header } from "../../client/src/components/layout/Header";

describe("Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canAccessPageMock.mockReturnValue(true);
    useMarkAllNotificationsReadMock.mockReturnValue({
      mutate: markAllReadMutateMock,
      isPending: false,
    });
    useNotificationsMock.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    });
  });

  it("should disable notification fetching while auth state is still loading", () => {
    useAuthMock.mockReturnValue({
      user: { id: "user-1", email: "admin@example.com" },
      role: "org_admin",
      activeRole: "org_admin",
      isOrgAdmin: true,
      isAuthenticated: true,
      isLoading: true,
      logout: vi.fn(),
    });

    render(<Header title="Dashboard" />);

    expect(useNotificationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeKey: "user-1",
        enabled: false,
      })
    );
  });

  it("should render the active role label in the user menu and unread notification badge for authenticated users", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "user-1", email: "procurement@example.com" },
      role: "office_head",
      activeRole: "procurement_officer",
      isOrgAdmin: false,
      isAuthenticated: true,
      isLoading: false,
      logout: vi.fn(),
    });
    useNotificationsMock.mockReturnValue({
      data: {
        data: [
          {
            id: "n-1",
            title: "Pending PO",
            message: "Purchase order requires review",
            is_read: false,
            created_at: new Date("2026-03-06T10:00:00.000Z").toISOString(),
          },
          {
            id: "n-2",
            title: "Approved",
            message: "Request approved",
            is_read: true,
            created_at: new Date("2026-03-06T11:00:00.000Z").toISOString(),
          },
        ],
      },
      isLoading: false,
    });

    render(<Header title="Dashboard" />);

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(useNotificationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeKey: "user-1",
        enabled: true,
      })
    );

    await userEvent.click(screen.getByRole("button", { name: "PR" }));

    expect(screen.getByText("Procurement Officer")).toBeInTheDocument();
  });

  it("should log out and navigate to the login page when the logout action is triggered", async () => {
    const logoutMock = vi.fn();
    useAuthMock.mockReturnValue({
      user: { id: "user-1", email: "admin@example.com" },
      role: "org_admin",
      activeRole: "org_admin",
      isOrgAdmin: true,
      isAuthenticated: true,
      isLoading: false,
      logout: logoutMock,
    });

    render(<Header title="Dashboard" />);

    await userEvent.click(screen.getByRole("button", { name: "AD" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith("/login");
  });
});
