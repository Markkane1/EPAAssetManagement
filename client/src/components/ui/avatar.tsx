import * as React from "react";

import { cn } from "@/lib/utils";

type AvatarImageStatus = "idle" | "loaded" | "error";

const AvatarContext = React.createContext<{
  imageStatus: AvatarImageStatus;
  setImageStatus: React.Dispatch<React.SetStateAction<AvatarImageStatus>>;
} | null>(null);

const Avatar = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    const [imageStatus, setImageStatus] = React.useState<AvatarImageStatus>("idle");

    return (
      <AvatarContext.Provider value={{ imageStatus, setImageStatus }}>
        <span
          ref={ref}
          className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)}
          {...props}
        />
      </AvatarContext.Provider>
    );
  }
);
Avatar.displayName = "Avatar";

const AvatarImage = React.forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>(
  ({ className, onLoad, onError, ...props }, ref) => {
    const context = React.useContext(AvatarContext);

    return (
      <img
        ref={ref}
        className={cn(
          "aspect-square h-full w-full object-cover",
          context?.imageStatus === "error" ? "hidden" : undefined,
          className
        )}
        onLoad={(event) => {
          context?.setImageStatus("loaded");
          onLoad?.(event);
        }}
        onError={(event) => {
          context?.setImageStatus("error");
          onError?.(event);
        }}
        {...props}
      />
    );
  }
);
AvatarImage.displayName = "AvatarImage";

const AvatarFallback = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => {
    const context = React.useContext(AvatarContext);
    const hidden = context?.imageStatus === "loaded";

    return (
      <span
        ref={ref}
        className={cn(
          "flex h-full w-full items-center justify-center rounded-full bg-muted",
          hidden ? "hidden" : undefined,
          className
        )}
        {...props}
      />
    );
  }
);
AvatarFallback.displayName = "AvatarFallback";

export { Avatar, AvatarImage, AvatarFallback };
