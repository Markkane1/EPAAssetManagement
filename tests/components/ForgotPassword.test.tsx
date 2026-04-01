/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiPostMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

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
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  };
});

import ForgotPassword from "../../client/src/pages/ForgotPassword";

describe("ForgotPassword page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiPostMock.mockResolvedValue({ message: "ok" });
  });

  it("should block submission when the email is invalid", async () => {
    render(<ForgotPassword />);

    await userEvent.type(screen.getByLabelText(/email/i), "invalid-email");
    fireEvent.submit(screen.getByRole("button", { name: /request reset/i }).closest("form")!);

    expect(screen.getAllByText(/please enter a valid email address/i).length).toBeGreaterThan(0);
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("should normalize the email before submitting the request", async () => {
    render(<ForgotPassword />);

    await userEvent.type(screen.getByLabelText(/email/i), "  USER@Example.COM  ");
    await userEvent.click(screen.getByRole("button", { name: /request reset/i }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith("/auth/forgot-password", { email: "user@example.com" });
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Password request submitted");
  });
});
