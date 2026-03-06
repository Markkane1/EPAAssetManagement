/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useAuthMock = vi.fn();
const navigateMock = vi.fn();
const apiPostMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/components/layout/MainLayout", () => ({
  MainLayout: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

vi.mock("@/lib/api", () => ({
  default: {
    post: (...args: unknown[]) => apiPostMock(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import Profile from "../../client/src/pages/Profile";

describe("Profile page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiPostMock.mockResolvedValue({ message: "ok" });
  });

  it("should render an empty-state message when no authenticated user is available", () => {
    useAuthMock.mockReturnValue({
      user: null,
      roles: [],
      activeRole: null,
      switchActiveRole: vi.fn(),
      logout: vi.fn(),
    });

    render(<Profile />);

    expect(screen.getByText("User not found")).toBeInTheDocument();
  });

  it("should block password submission when the new passwords do not match", async () => {
    useAuthMock.mockReturnValue({
      user: {
        id: "user-1",
        email: "admin@example.com",
        role: "org_admin",
        roles: ["org_admin"],
      },
      roles: ["org_admin"],
      activeRole: "org_admin",
      switchActiveRole: vi.fn(),
      logout: vi.fn(),
    });

    render(<Profile />);

    await userEvent.type(screen.getByLabelText("Current Password"), "OldPass123!");
    await userEvent.type(screen.getByLabelText("New Password"), "NewPass123!");
    await userEvent.type(screen.getByLabelText("Confirm New Password"), "Different123!");
    fireEvent.submit(screen.getByRole("button", { name: /update password/i }).closest("form")!);

    expect(toastErrorMock).toHaveBeenCalledWith("New passwords do not match");
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("should submit a password change request, show success feedback, and clear the form", async () => {
    useAuthMock.mockReturnValue({
      user: {
        id: "user-1",
        email: "admin@example.com",
        role: "org_admin",
        roles: ["org_admin", "office_head"],
      },
      roles: ["org_admin", "office_head"],
      activeRole: "org_admin",
      switchActiveRole: vi.fn(),
      logout: vi.fn(),
    });

    render(<Profile />);

    await userEvent.type(screen.getByLabelText("Current Password"), "OldPass123!");
    await userEvent.type(screen.getByLabelText("New Password"), "NewPass123!");
    await userEvent.type(screen.getByLabelText("Confirm New Password"), "NewPass123!");
    await userEvent.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith("/auth/change-password", {
        oldPassword: "OldPass123!",
        newPassword: "NewPass123!",
      });
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Password updated");
    expect(screen.getByLabelText("Current Password")).toHaveValue("");
    expect(screen.getByLabelText("New Password")).toHaveValue("");
    expect(screen.getByLabelText("Confirm New Password")).toHaveValue("");
  });

  it("should execute logout and navigate back to the login page", async () => {
    const logoutMock = vi.fn();
    useAuthMock.mockReturnValue({
      user: {
        id: "user-1",
        email: "admin@example.com",
        role: "org_admin",
        roles: ["org_admin"],
      },
      roles: ["org_admin"],
      activeRole: "org_admin",
      switchActiveRole: vi.fn(),
      logout: logoutMock,
    });

    render(<Profile />);

    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith("/login");
  });
});
