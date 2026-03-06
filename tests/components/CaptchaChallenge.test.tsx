/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CaptchaChallenge } from "../../client/src/components/auth/CaptchaChallenge";

describe("CaptchaChallenge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render a generated challenge and verify the correct numeric answer", async () => {
    const onVerify = vi.fn();
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0) // num1 = 1
      .mockReturnValueOnce(0.1) // num2 = 2
      .mockReturnValueOnce(0); // operator = +

    render(<CaptchaChallenge onVerify={onVerify} isVerified={false} />);

    expect(screen.getByText("1 + 2 = ?")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("?"), "3");

    expect(onVerify).toHaveBeenLastCalledWith(true);
    expect(screen.queryByText("Incorrect answer")).not.toBeInTheDocument();
  });

  it("should show an error and report false when the entered answer is incorrect", async () => {
    const onVerify = vi.fn();
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0) // num1 = 1
      .mockReturnValueOnce(0.1) // num2 = 2
      .mockReturnValueOnce(0); // operator = +

    render(<CaptchaChallenge onVerify={onVerify} isVerified={false} />);

    await userEvent.type(screen.getByPlaceholderText("?"), "4");

    expect(onVerify).toHaveBeenLastCalledWith(false);
    expect(screen.getByText("Incorrect answer")).toBeInTheDocument();
  });

  it("should sanitize non-numeric characters from the answer input", async () => {
    const onVerify = vi.fn();
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0) // num1 = 1
      .mockReturnValueOnce(0.1) // num2 = 2
      .mockReturnValueOnce(0); // operator = +

    render(<CaptchaChallenge onVerify={onVerify} isVerified={false} />);

    const input = screen.getByPlaceholderText("?") as HTMLInputElement;
    await userEvent.type(input, "3abc-");

    expect(input.value).toBe("3-");
    expect(onVerify).toHaveBeenCalled();
  });

  it("should refresh the challenge, clear the answer, and reset verification state", async () => {
    const onVerify = vi.fn();
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0) // first challenge num1 = 1
      .mockReturnValueOnce(0.1) // first challenge num2 = 2
      .mockReturnValueOnce(0) // first operator = +
      .mockReturnValueOnce(0.2) // refreshed num1 = 3
      .mockReturnValueOnce(0.3) // refreshed num2 = 4
      .mockReturnValueOnce(0.9); // refreshed operator = ×

    render(<CaptchaChallenge onVerify={onVerify} isVerified={false} />);

    const input = screen.getByPlaceholderText("?") as HTMLInputElement;
    await userEvent.type(input, "3");
    await userEvent.click(screen.getByTitle("New challenge"));

    expect(screen.getByText(/3 .* 4 = \?/)).toBeInTheDocument();
    expect(input.value).toBe("");
    expect(onVerify).toHaveBeenLastCalledWith(false);
    expect(screen.queryByText("Incorrect answer")).not.toBeInTheDocument();
  });

  it("should render the verified state instead of the challenge when already verified", () => {
    render(<CaptchaChallenge onVerify={vi.fn()} isVerified={true} />);

    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.queryByText("Security Check")).not.toBeInTheDocument();
  });
});
