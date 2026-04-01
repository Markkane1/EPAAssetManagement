import * as React from "react";

export type LayerAlign = "start" | "center" | "end";
export type LayerSide = "top" | "bottom";

export function composeRefs<T>(
  ...refs: Array<React.Ref<T> | undefined>
): React.RefCallback<T> {
  return (value) => {
    refs.forEach((ref) => {
      if (!ref) return;
      if (typeof ref === "function") {
        ref(value);
        return;
      }
      (ref as React.MutableRefObject<T | null>).current = value;
    });
  };
}

export function callEventHandler<E>(
  handler: ((event: E) => void) | undefined,
  event: E
) {
  handler?.(event);
}

export function useControllableState({
  value,
  defaultValue,
  onChange,
}: {
  value?: boolean;
  defaultValue?: boolean;
  onChange?: (nextValue: boolean) => void;
}) {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? false);
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;

  const setValue = React.useCallback(
    (nextValue: boolean) => {
      if (!isControlled) {
        setInternalValue(nextValue);
      }
      onChange?.(nextValue);
    },
    [isControlled, onChange]
  );

  return [currentValue, setValue] as const;
}

export function useDismissableLayer({
  open,
  onDismiss,
  contentRef,
  triggerRef,
}: {
  open: boolean;
  onDismiss: () => void;
  contentRef: React.RefObject<HTMLElement>;
  triggerRef?: React.RefObject<HTMLElement>;
}) {
  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (contentRef.current?.contains(target)) return;
      if (triggerRef?.current?.contains(target)) return;
      onDismiss();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [contentRef, onDismiss, open, triggerRef]);
}

export function useBodyScrollLock(open: boolean) {
  React.useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);
}

export function useAnchoredPosition({
  open,
  triggerRef,
  contentRef,
  align = "center",
  side = "bottom",
  sideOffset = 4,
}: {
  open: boolean;
  triggerRef: React.RefObject<HTMLElement>;
  contentRef: React.RefObject<HTMLElement>;
  align?: LayerAlign;
  side?: LayerSide;
  sideOffset?: number;
}) {
  const [style, setStyle] = React.useState<React.CSSProperties>({});
  const hiddenStyle = React.useMemo<React.CSSProperties>(
    () => ({
      position: "fixed",
      top: 0,
      left: 0,
      visibility: "hidden",
      pointerEvents: "none",
      zIndex: 50,
    }),
    []
  );

  React.useLayoutEffect(() => {
    if (!open) {
      setStyle({});
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const content = contentRef.current;
      if (!trigger || !content) return;

      const rect = trigger.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const viewportPadding = 8;

      let left = rect.left;
      if (align === "center") {
        left = rect.left + rect.width / 2 - contentRect.width / 2;
      } else if (align === "end") {
        left = rect.right - contentRect.width;
      }

      let top = side === "top"
        ? rect.top - contentRect.height - sideOffset
        : rect.bottom + sideOffset;

      left = Math.min(
        Math.max(left, viewportPadding),
        window.innerWidth - contentRect.width - viewportPadding
      );
      top = Math.min(
        Math.max(top, viewportPadding),
        window.innerHeight - contentRect.height - viewportPadding
      );

      setStyle({
        ...hiddenStyle,
        top,
        left,
        minWidth: `${Math.min(rect.width, window.innerWidth - viewportPadding * 2)}px`,
        visibility: "visible",
        pointerEvents: undefined,
        ["--popover-trigger-width" as string]: `${rect.width}px`,
        ["--radix-popover-trigger-width" as string]: `${rect.width}px`,
      });
    };

    setStyle(hiddenStyle);
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [align, contentRef, hiddenStyle, open, side, sideOffset, triggerRef]);

  return open ? { ...hiddenStyle, ...style } : style;
}
