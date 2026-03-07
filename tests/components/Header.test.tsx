/** @vitest-environment jsdom */
import React from "react";
import { render, screen, within } from "@testing-library/react";
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

const getAvatarButton = () => screen.getAllByRole("button").at(-1) as HTMLButtonElement;

describe("Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canAccessPageMock.mockReturnValue(true);
    useMarkAllNotificationsReadMock.mockReturnValue({ mutate: markAllReadMutateMock, isPending: false });
    useNotificationsMock.mockReturnValue({ data: { data: [] }, isLoading: false });
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

    expect(useNotificationsMock).toHaveBeenCalledWith(expect.objectContaining({ scopeKey: "user-1", enabled: false }));
  });

  it("should render search controls and trigger the menu callback when provided", async () => {
    const onSearchChange = vi.fn();
    const onMenuClick = vi.fn();
    useAuthMock.mockReturnValue({
      user: { id: "user-1", email: "admin@example.com" },
      role: "org_admin",
      activeRole: "org_admin",
      isOrgAdmin: true,
      isAuthenticated: true,
      isLoading: false,
      logout: vi.fn(),
    });

    render(
      <Header
        title="Dashboard"
        description="Overview"
        searchValue="lap"
        searchPlaceholder="Search assets"
        onSearchChange={onSearchChange}
        onMenuClick={onMenuClick}
      />
    );

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText("Search assets")).toHaveLength(2);
    await userEvent.type(screen.getAllByPlaceholderText("Search assets")[0], "top");
    expect(onSearchChange).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /open navigation menu/i }));
    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });

  it("should render the active role label and include settings for authorized users", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "user-1", email: "procurement@example.com" },
      role: "office_head",
      activeRole: "procurement_officer",
      isOrgAdmin: false,
      isAuthenticated: true,
      isLoading: false,
      logout: vi.fn(),
    });

    render(<Header title="Dashboard" />);

    await userEvent.click(getAvatarButton());
    expect(screen.getByText("Procurement Officer")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /settings/i })).toBeInTheDocument();
  });

  it("should omit settings when page access does not allow it", async () => {
    canAccessPageMock.mockReturnValue(false);
    useAuthMock.mockReturnValue({
      user: { id: "user-1", email: "procurement@example.com" },
      role: "office_head",
      activeRole: "procurement_officer",
      isOrgAdmin: false,
      isAuthenticated: true,
      isLoading: false,
      logout: vi.fn(),
    });

    render(<Header title="Dashboard" />);

    await userEvent.click(getAvatarButton());
    expect(screen.queryByRole("menuitem", { name: /settings/i })).not.toBeInTheDocument();
  });

  it("should mark notifications read on open, render the list, and navigate from notification actions", async () => {
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
          { id: "n-1", title: "Pending PO", message: "Purchase order requires review", is_read: false, created_at: new Date("2026-03-06T10:00:00.000Z").toISOString() },
          { id: "n-2", title: "Approved", message: "Request approved", is_read: true, created_at: new Date("2026-03-06T11:00:00.000Z").toISOString() },
        ],
      },
      isLoading: false,
    });

    const { container } = render(<Header title="Dashboard" />);
    expect(screen.getByText("1")).toBeInTheDocument();
    const bellButton = container.querySelector("button.relative.text-muted-foreground") as HTMLButtonElement;
    await userEvent.click(bellButton);

    expect(markAllReadMutateMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Pending PO")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Pending PO"));
    expect(navigateMock).toHaveBeenCalledWith("/settings/notifications");
  });

  it("should render loading notification state without marking all read when there are no unread items", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "user-1", email: "employee@example.com" },
      role: "employee",
      activeRole: "employee",
      isOrgAdmin: false,
      isAuthenticated: true,
      isLoading: false,
      logout: vi.fn(),
    });
    useNotificationsMock.mockReturnValue({ data: { data: [] }, isLoading: true });

    const { container } = render(<Header title="Dashboard" />);
    await userEvent.click(container.querySelector("button.relative.text-muted-foreground") as HTMLButtonElement);
    expect(screen.getByText("Loading notifications...")).toBeInTheDocument();
    expect(markAllReadMutateMock).not.toHaveBeenCalled();
  });

  it("should render empty notification state without marking all read when there are no unread items", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "user-1", email: "employee@example.com" },
      role: "employee",
      activeRole: "employee",
      isOrgAdmin: false,
      isAuthenticated: true,
      isLoading: false,
      logout: vi.fn(),
    });
    useNotificationsMock.mockReturnValue({ data: { data: [] }, isLoading: false });

    const { container } = render(<Header title="Dashboard" />);
    await userEvent.click(container.querySelector("button.relative.text-muted-foreground") as HTMLButtonElement);
    expect(screen.getByText("No notifications yet.")).toBeInTheDocument();
    expect(markAllReadMutateMock).not.toHaveBeenCalled();
  });

  it("should not mark all notifications read while a mark-all request is pending", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "user-1", email: "admin@example.com" },
      role: "org_admin",
      activeRole: "org_admin",
      isOrgAdmin: true,
      isAuthenticated: true,
      isLoading: false,
      logout: vi.fn(),
    });
    useMarkAllNotificationsReadMock.mockReturnValue({ mutate: markAllReadMutateMock, isPending: true });
    useNotificationsMock.mockReturnValue({
      data: { data: [{ id: "n-1", title: "Alert", message: "Unread", is_read: false, created_at: new Date("2026-03-06T10:00:00.000Z").toISOString() }] },
      isLoading: false,
    });

    const { container } = render(<Header title="Dashboard" />);
    await userEvent.click(container.querySelector("button.relative.text-muted-foreground") as HTMLButtonElement);
    expect(markAllReadMutateMock).not.toHaveBeenCalled();
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
    await userEvent.click(getAvatarButton());
    const menu = screen.getByRole("menu");
    await userEvent.click(within(menu).getByRole("menuitem", { name: /sign out/i }));

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith("/login");
  });
});
