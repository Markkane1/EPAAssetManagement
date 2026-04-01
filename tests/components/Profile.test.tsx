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

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, disabled, children }: any) => (
    <select aria-label="Active Role Select" value={value} disabled={disabled} onChange={(event) => onValueChange?.(event.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
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
    useAuthMock.mockReturnValue({ user: null, roles: [], activeRole: null, switchActiveRole: vi.fn(), logout: vi.fn() });
    render(<Profile />);
    expect(screen.getByText("User not found")).toBeInTheDocument();
  });

  it("should render available roles and the active role badge label", () => {
    useAuthMock.mockReturnValue({
      user: { id: "user-1", email: "compliance@example.com", role: "org_admin", roles: ["org_admin", "compliance_auditor"] },
      roles: ["org_admin", "compliance_auditor"],
      activeRole: "compliance_auditor",
      switchActiveRole: vi.fn(),
      logout: vi.fn(),
    });

    render(<Profile />);

    expect(screen.getAllByText("Compliance Auditor").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Administrator").length).toBeGreaterThan(0);
    expect(screen.getAllByText("compliance@example.com").length).toBeGreaterThan(1);
  });

  it("should block password submission when the new passwords do not match", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "user-1", email: "admin@example.com", role: "org_admin", roles: ["org_admin"] },
      roles: ["org_admin"],
      activeRole: "org_admin",
      switchActiveRole: vi.fn(),
      logout: vi.fn(),
    });

    render(<Profile />);
    await userEvent.type(screen.getByLabelText("Current Password"), "OldPass123!Aa");
    await userEvent.type(screen.getByLabelText("New Password"), "NewStrong123!");
    await userEvent.type(screen.getByLabelText("Confirm New Password"), "Different123!");
    fireEvent.submit(screen.getByRole("button", { name: /update password/i }).closest("form")!);
    expect(screen.getByText("New passwords do not match")).toBeInTheDocument();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("should block password submission when the new password is too weak", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "user-1", email: "admin@example.com", role: "org_admin", roles: ["org_admin"] },
      roles: ["org_admin"],
      activeRole: "org_admin",
      switchActiveRole: vi.fn(),
      logout: vi.fn(),
    });

    render(<Profile />);
    await userEvent.type(screen.getByLabelText("Current Password"), "OldPass123!Aa");
    await userEvent.type(screen.getByLabelText("New Password"), "weakpass");
    await userEvent.type(screen.getByLabelText("Confirm New Password"), "weakpass");
    await userEvent.click(screen.getByRole("button", { name: /update password/i }));

    expect(
      screen.getByText(/password must be at least 12 characters and include uppercase, lowercase, number, and symbol/i)
    ).toBeInTheDocument();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("should submit a password change request, show success feedback, and clear the form", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "user-1", email: "admin@example.com", role: "org_admin", roles: ["org_admin", "office_head"] },
      roles: ["org_admin", "office_head"],
      activeRole: "org_admin",
      switchActiveRole: vi.fn(),
      logout: vi.fn(),
    });

    render(<Profile />);
    await userEvent.type(screen.getByLabelText("Current Password"), "OldPass123!Aa");
    await userEvent.type(screen.getByLabelText("New Password"), "NewStrong123!");
    await userEvent.type(screen.getByLabelText("Confirm New Password"), "NewStrong123!");
    await userEvent.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith("/auth/change-password", { oldPassword: "OldPass123!Aa", newPassword: "NewStrong123!" });
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Password updated");
    expect(screen.getByLabelText("Current Password")).toHaveValue("");
  });

  it("should surface password update failures from Error instances", async () => {
    apiPostMock.mockRejectedValue(new Error("Backend said no"));
    useAuthMock.mockReturnValue({
      user: { id: "user-1", email: "admin@example.com", role: "org_admin", roles: ["org_admin"] },
      roles: ["org_admin"],
      activeRole: "org_admin",
      switchActiveRole: vi.fn(),
      logout: vi.fn(),
    });

    render(<Profile />);
    await userEvent.type(screen.getByLabelText("Current Password"), "OldPass123!Aa");
    await userEvent.type(screen.getByLabelText("New Password"), "NewStrong123!");
    await userEvent.type(screen.getByLabelText("Confirm New Password"), "NewStrong123!");
    await userEvent.click(screen.getByRole("button", { name: /update password/i }));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("Backend said no"));
  });

  it("should switch active roles and show success feedback", async () => {
    const switchActiveRoleMock = vi.fn().mockResolvedValue(undefined);
    useAuthMock.mockReturnValue({
      user: { id: "user-1", email: "head@example.com", role: "office_head", roles: ["office_head", "procurement_officer"] },
      roles: ["office_head", "procurement_officer"],
      activeRole: "office_head",
      switchActiveRole: switchActiveRoleMock,
      logout: vi.fn(),
    });

    render(<Profile />);
    await userEvent.selectOptions(screen.getByLabelText("Active Role Select"), "procurement_officer");
    await waitFor(() => expect(switchActiveRoleMock).toHaveBeenCalledWith("procurement_officer"));
    expect(toastSuccessMock).toHaveBeenCalledWith("Active role switched");
  });

  it("should show an error toast when role switching fails", async () => {
    const switchActiveRoleMock = vi.fn().mockRejectedValue(new Error("Switch failed"));
    useAuthMock.mockReturnValue({
      user: { id: "user-1", email: "head@example.com", role: "office_head", roles: ["office_head", "procurement_officer"] },
      roles: ["office_head", "procurement_officer"],
      activeRole: "office_head",
      switchActiveRole: switchActiveRoleMock,
      logout: vi.fn(),
    });

    render(<Profile />);
    await userEvent.selectOptions(screen.getByLabelText("Active Role Select"), "procurement_officer");
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("Switch failed"));
  });

  it("should execute logout and navigate back to the login page", async () => {
    const logoutMock = vi.fn();
    useAuthMock.mockReturnValue({
      user: { id: "user-1", email: "admin@example.com", role: "org_admin", roles: ["org_admin"] },
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
