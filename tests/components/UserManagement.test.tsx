/** @vitest-environment jsdom */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useQueryMock = vi.fn();
const invalidateQueriesMock = vi.fn();
const setTermMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const exportToCSVMock = vi.fn();
const createUserMock = vi.fn();
const updateRoleMock = vi.fn();
const updateLocationMock = vi.fn();
const deleteUserMock = vi.fn();
const resetPasswordMock = vi.fn();

const usersData = {
  items: [
    {
      id: "1",
      user_id: "user-1",
      email: "head@example.com",
      first_name: "Office",
      last_name: "Head",
      role: "office_head",
      activeRole: "office_head",
      roles: ["office_head"],
      location_id: "office-1",
      location_name: "Central Office",
      created_at: "2026-03-01T00:00:00.000Z",
    },
    {
      id: "2",
      user_id: "user-2",
      email: "caretaker@example.com",
      first_name: "Care",
      last_name: "Taker",
      role: "caretaker",
      activeRole: "caretaker",
      roles: ["caretaker"],
      location_id: "office-2",
      location_name: "District Lab",
      created_at: "2026-03-02T00:00:00.000Z",
    },
  ],
  page: 1,
  limit: 50,
  total: 2,
  hasMore: false,
};

const locationsData = [
  { id: "office-1", name: "Central Office" },
  { id: "office-2", name: "District Lab" },
];

function findSelectItems(children: React.ReactNode): Array<{ value: string; label: React.ReactNode }> {
  const items: Array<{ value: string; label: React.ReactNode }> = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if ((child.type as { displayName?: string }).displayName === "SelectItem") {
      items.push({ value: String(child.props.value), label: child.props.children });
      return;
    }
    if (child.props?.children) {
      items.push(...findSelectItems(child.props.children));
    }
  });
  return items;
}

vi.mock("@tanstack/react-query", () => ({
  useQuery: (config: { queryKey: unknown[] }) => useQueryMock(config),
  useMutation: (config: {
    mutationFn: (variables: any) => Promise<unknown>;
    onSuccess?: (data: unknown) => void | Promise<void>;
    onError?: (error: Error) => void;
  }) => ({
    isPending: false,
    mutateAsync: async (variables: unknown) => {
      try {
        const result = await config.mutationFn(variables);
        await config.onSuccess?.(result);
        return result;
      } catch (error) {
        config.onError?.(error as Error);
        throw error;
      }
    },
    mutate: async (variables: unknown) => {
      try {
        const result = await config.mutationFn(variables);
        await config.onSuccess?.(result);
        return result;
      } catch (error) {
        config.onError?.(error as Error);
      }
    },
  }),
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock("@/components/layout/MainLayout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/shared/PageHeader", () => ({
  PageHeader: ({ title, action, extra }: { title: string; action?: { label: string; onClick: () => void }; extra?: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {action ? <button type="button" onClick={action.onClick}>{action.label}</button> : null}
      {extra}
    </div>
  ),
}));

vi.mock("@/components/shared/SearchableSelect", () => ({
  SearchableSelect: ({ value, onValueChange, options }: { value?: string; onValueChange?: (value: string) => void; options?: Array<{ value: string; label: string }> }) => (
    <select aria-label="searchable-select" value={value || ""} onChange={(e) => onValueChange?.(e.target.value)}>
      {(options || []).map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  ),
}));

vi.mock("@/components/ui/select", () => {
  const ReactModule = require("react") as typeof React;
  const SelectContext = ReactModule.createContext<{ value?: string; onValueChange?: (value: string) => void; items: Array<{ value: string; label: React.ReactNode }> }>({ items: [] });

  const Select = ({ value, onValueChange, children }: { value?: string; onValueChange?: (value: string) => void; children: React.ReactNode }) => {
    const items = findSelectItems(children);
    return (
      <SelectContext.Provider value={{ value, onValueChange, items }}>
        <div>{children}</div>
      </SelectContext.Provider>
    );
  };
  const SelectTrigger = ({ children, className }: { children: React.ReactNode; className?: string }) => {
    const ctx = ReactModule.useContext(SelectContext);
    return (
      <select aria-label="select-trigger" className={className} value={ctx.value || ""} onChange={(e) => ctx.onValueChange?.(e.target.value)}>
        <option value="">Select</option>
        {ctx.items.map((item) => (
          <option key={item.value} value={item.value}>{item.value}</option>
        ))}
      </select>
    );
  };
  const SelectContent = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  const SelectItem = ({ children, value }: { children: React.ReactNode; value: string }) => <div data-value={value}>{children}</div>;
  (SelectItem as any).displayName = "SelectItem";
  const SelectValue = () => null;
  return { Select, SelectTrigger, SelectContent, SelectItem, SelectValue };
});

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div role="dialog">{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div role="alertdialog">{children}</div> : null),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) => <button type="button" className={className} onClick={onClick}>{children}</button>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: ({ placeholder }: { placeholder?: string }) => <input aria-label={placeholder || "command-input"} />,
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => <button type="button" onClick={onSelect}>{children}</button>,
}));

vi.mock("@/components/ui/table", () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableCell: ({ children, colSpan, className }: { children: React.ReactNode; colSpan?: number; className?: string }) => <td colSpan={colSpan} className={className}>{children}</td>,
}));

vi.mock("@/contexts/PageSearchContext", () => ({
  usePageSearch: () => ({ term: "", setTerm: setTermMock }),
}));

vi.mock("@/services/userService", () => ({
  userService: {
    getPaged: vi.fn(),
    updateRole: (...args: unknown[]) => updateRoleMock(...args),
    updateLocation: (...args: unknown[]) => updateLocationMock(...args),
    create: (...args: unknown[]) => createUserMock(...args),
    delete: (...args: unknown[]) => deleteUserMock(...args),
    resetPassword: (...args: unknown[]) => resetPasswordMock(...args),
  },
}));

vi.mock("@/services/locationService", () => ({
  locationService: {
    getAll: vi.fn(),
  },
}));

vi.mock("@/services/userPermissionService", () => ({
  userPermissionService: {
    getRolePermissions: vi.fn(),
  },
}));

vi.mock("@/lib/exportUtils", () => ({
  exportToCSV: (...args: unknown[]) => exportToCSVMock(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

import UserManagement from "../../client/src/pages/UserManagement";

describe("UserManagement page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createUserMock.mockResolvedValue({ id: "user-3" });
    updateRoleMock.mockResolvedValue({});
    updateLocationMock.mockResolvedValue({});
    deleteUserMock.mockResolvedValue({});
    resetPasswordMock.mockResolvedValue({});
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      const key = queryKey[0];
      if (key === "users-management") {
        return { data: usersData, isLoading: false };
      }
      if (key === "locations-management") {
        return { data: locationsData, isLoading: false };
      }
      if (key === "settings") {
        return {
          data: {
            roles: [
              { id: "org_admin", name: "Org Admin" },
              { id: "office_head", name: "Office Head" },
              { id: "caretaker", name: "Caretaker" },
              { id: "employee", name: "Employee" },
            ],
          },
          isLoading: false,
        };
      }
      return { data: undefined, isLoading: false };
    });
  });

  it("should render a loading state while users are being fetched", () => {
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[0] === "users-management") {
        return { data: undefined, isLoading: true };
      }
      if (queryKey[0] === "locations-management") {
        return { data: locationsData, isLoading: false };
      }
      return { data: { roles: [] }, isLoading: false };
    });

    const { container } = render(<UserManagement />);

    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("should export the currently visible users", async () => {
    render(<UserManagement />);

    await userEvent.click(screen.getByRole("button", { name: /csv/i }));

    expect(exportToCSVMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ email: "head@example.com" }),
        expect.objectContaining({ email: "caretaker@example.com" }),
      ]),
      expect.any(Array),
      expect.stringMatching(/^user-management-/)
    );
  });

  it("should create a new user from the create dialog", async () => {
    render(<UserManagement />);

    await userEvent.click(screen.getByRole("button", { name: /add user/i }));
    const dialog = screen.getByRole("dialog");

    await userEvent.type(within(dialog).getByLabelText(/first name/i), "John");
    await userEvent.type(within(dialog).getByLabelText(/last name/i), "Doe");
    await userEvent.type(within(dialog).getByLabelText(/^email/i), "john@example.com");
    await userEvent.type(within(dialog).getByLabelText(/^password/i), "Secret123");
    await userEvent.selectOptions(within(dialog).getAllByLabelText("select-trigger")[0], "employee");
    await userEvent.click(within(dialog).getByRole("button", { name: /district lab/i }));
    await userEvent.click(within(dialog).getByRole("button", { name: /^create user$/i }));

    await waitFor(() => {
      expect(createUserMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "john@example.com",
          password: "Secret123",
          firstName: "John",
          lastName: "Doe",
          role: "employee",
          roles: ["employee"],
          activeRole: "employee",
          locationId: "office-2",
        })
      );
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("User created successfully");
  });

  it("should edit an existing user role and location", async () => {
    render(<UserManagement />);

    await userEvent.click(screen.getAllByTitle(/edit user/i)[0]);
    const dialog = screen.getByRole("dialog");

    await userEvent.selectOptions(within(dialog).getAllByLabelText("select-trigger")[0], "caretaker");
    await userEvent.selectOptions(within(dialog).getByLabelText("searchable-select"), "office-2");
    await userEvent.click(within(dialog).getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(updateRoleMock).toHaveBeenCalledWith("user-1", {
        role: "caretaker",
        activeRole: "caretaker",
        roles: ["caretaker"],
      });
    });
    expect(updateLocationMock).toHaveBeenCalledWith("user-1", "office-2");
  });

  it("should delete users and reset passwords", async () => {
    render(<UserManagement />);

    await userEvent.click(screen.getAllByTitle(/delete user/i)[0]);
    const alert = screen.getByRole("alertdialog");
    await userEvent.click(within(alert).getByRole("button", { name: /^delete$/i }));
    await waitFor(() => expect(deleteUserMock).toHaveBeenCalledWith("user-1"));

    await userEvent.click(screen.getAllByTitle(/reset password/i)[0]);
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/^new password$/i), "Secret123");
    await userEvent.type(within(dialog).getByLabelText(/confirm password/i), "Mismatch123");
    expect(within(dialog).getByText(/passwords do not match/i)).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText(/confirm password/i));
    await userEvent.type(within(dialog).getByLabelText(/confirm password/i), "Secret123");
    await userEvent.click(within(dialog).getByRole("button", { name: /reset password/i }));

    await waitFor(() => expect(resetPasswordMock).toHaveBeenCalledWith("user-1", "Secret123"));
  });
});
