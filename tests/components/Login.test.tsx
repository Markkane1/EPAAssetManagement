/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

const loginMock = vi.fn();
const navigateMock = vi.fn();
const isAccountLockedMock = vi.fn();
const recordFailedAttemptMock = vi.fn();
const clearLoginAttemptsMock = vi.fn();
const loginSuccessMock = vi.fn();
const loginFailedMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    login: loginMock,
  }),
}));

vi.mock("@/lib/securityUtils", async () => {
  const actual = await vi.importActual<typeof import("../../client/src/lib/securityUtils")>(
    "../../client/src/lib/securityUtils"
  );
  return {
    ...actual,
    isAccountLocked: () => isAccountLockedMock(),
    recordFailedAttempt: () => recordFailedAttemptMock(),
    clearLoginAttempts: () => clearLoginAttemptsMock(),
  };
});

vi.mock("@/lib/auditLog", () => ({
  auditLog: {
    loginSuccess: (...args: unknown[]) => loginSuccessMock(...args),
    loginFailed: (...args: unknown[]) => loginFailedMock(...args),
  },
}));

vi.mock("@/components/auth/CaptchaChallenge", () => ({
  CaptchaChallenge: ({
    onVerify,
    isVerified,
  }: {
    onVerify: (isValid: boolean) => void;
    isVerified: boolean;
  }) => (
    <div>
      <button type="button" onClick={() => onVerify(true)}>
        Verify captcha
      </button>
      <span>{isVerified ? "captcha-verified" : "captcha-pending"}</span>
    </div>
  ),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({
      state: {
        from: {
          pathname: "/dashboard",
        },
      },
    }),
  };
});

import Login from "../../client/src/pages/Login";

const renderLogin = () =>
  render(
    <MemoryRouter future={routerFuture}>
      <Login />
    </MemoryRouter>
  );

describe("Login page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loginMock.mockResolvedValue(undefined);
    isAccountLockedMock.mockReturnValue({ locked: false, remainingMinutes: 0 });
    recordFailedAttemptMock.mockReturnValue({
      isLocked: false,
      remainingAttempts: 3,
      lockoutMinutes: 15,
    });
  });

  it("should render the login form and keep submit disabled until the captcha is verified", () => {
    renderLogin();

    expect(screen.getByText("Staff Login")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(screen.getByText("captcha-pending")).toBeInTheDocument();
  });

  it("should show inline validation errors when the email is malformed and password is empty", async () => {
    renderLogin();

    await userEvent.click(screen.getByRole("button", { name: "Verify captcha" }));
    await userEvent.type(screen.getByLabelText("Email"), "invalid-email");
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);

    expect(await screen.findByText("Please enter a valid email address")).toBeInTheDocument();
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("should show a captcha error when the security check has not been completed", async () => {
    renderLogin();

    await userEvent.type(screen.getByLabelText("Email"), "user@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "Secret123!");
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);

    expect(await screen.findByText("Please complete the security check")).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("should call login, clear attempt tracking, write an audit event, and navigate on success", async () => {
    renderLogin();

    await userEvent.click(screen.getByRole("button", { name: "Verify captcha" }));
    await userEvent.type(screen.getByLabelText("Email"), "admin@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "Admin123!");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith("admin@example.com", "Admin123!");
    });
    expect(clearLoginAttemptsMock).toHaveBeenCalledTimes(1);
    expect(loginSuccessMock).toHaveBeenCalledWith("admin@example.com");
    expect(navigateMock).toHaveBeenCalledWith("/dashboard", { replace: true });
  });

  it("should show remaining attempts after a failed login that does not lock the account", async () => {
    loginMock.mockRejectedValue(new Error("Invalid credentials"));
    recordFailedAttemptMock.mockReturnValue({
      isLocked: false,
      remainingAttempts: 2,
      lockoutMinutes: 15,
    });

    renderLogin();

    await userEvent.click(screen.getByRole("button", { name: "Verify captcha" }));
    await userEvent.type(screen.getByLabelText("Email"), "admin@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid credentials (2 attempts remaining)")).toBeInTheDocument();
    expect(loginFailedMock).toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("should show the lockout state and disable the form when the account is already locked", () => {
    isAccountLockedMock.mockReturnValue({ locked: true, remainingMinutes: 7 });

    renderLogin();

    expect(screen.getByText(/Account temporarily locked/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(screen.getByLabelText("Email")).toBeDisabled();
    expect(screen.getByLabelText("Password")).toBeDisabled();
  });
});
