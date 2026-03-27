import { useEffect, useState } from "react";
import { toast as sonnerToast } from "sonner";

type ToastInput = {
  id?: string;
  title?: string;
  description?: string;
  open?: boolean;
};

type ToastRecord = Required<Pick<ToastInput, "id">> &
  Omit<ToastInput, "id"> & {
    open: boolean;
  };

type ToastState = {
  toasts: ToastRecord[];
};

type ToastAction = {
  id: string;
  dismiss: () => void;
  update: (patch: Partial<ToastInput>) => void;
};

const listeners = new Set<(state: ToastState) => void>();
let state: ToastState = { toasts: [] };

function emit() {
  listeners.forEach((listener) => listener(state));
}

function setState(next: ToastState) {
  state = next;
  emit();
}

function createToastRecord(input: ToastInput): ToastRecord {
  return {
    id: input.id || crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title,
    description: input.description,
    open: input.open ?? true,
  };
}

export function toast(input: ToastInput): ToastAction {
  const record = createToastRecord(input);
  setState({
    toasts: [record, ...state.toasts.filter((toastItem) => toastItem.id !== record.id)],
  });

  if (typeof sonnerToast === "function") {
    sonnerToast(record.title || "", {
      id: record.id,
      description: record.description,
    });
  }

  return {
    id: record.id,
    dismiss: () => dismiss(record.id),
    update: (patch) => update(record.id, patch),
  };
}

export function dismiss(id?: string) {
  if (!id) {
    setState({
      toasts: state.toasts.map((toastItem) => ({ ...toastItem, open: false })),
    });
    return;
  }

  setState({
    toasts: state.toasts.map((toastItem) =>
      toastItem.id === id ? { ...toastItem, open: false } : toastItem
    ),
  });
}

export function update(id: string, patch: Partial<ToastInput>) {
  setState({
    toasts: state.toasts.map((toastItem) =>
      toastItem.id === id ? { ...toastItem, ...patch, id } : toastItem
    ),
  });
}

export function useToast() {
  const [localState, setLocalState] = useState(state);

  useEffect(() => {
    listeners.add(setLocalState);
    return () => {
      listeners.delete(setLocalState);
    };
  }, []);

  return {
    toasts: localState.toasts,
    toast,
    dismiss,
  };
}
