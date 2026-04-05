"use client";
import { cn } from "@/lib/utils";
import React, { useState, createContext, useContext, useCallback, useEffect, useRef } from "react";
import { IconMenu2, IconX } from "@tabler/icons-react";

const DESKTOP_SIDEBAR_PIN_STORAGE_KEY = "global-main-nav-desktop-pinned";

interface Links {
  label: string;
  href: string;
  icon: React.JSX.Element | React.ReactNode;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
  mobileBarContent?: React.ReactNode;
  mobileBarCenterContent?: React.ReactNode;
  disabled?: boolean;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(
  undefined
);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
  mobileBarContent,
  mobileBarCenterContent,
  disabled = false,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
  mobileBarContent?: React.ReactNode;
  mobileBarCenterContent?: React.ReactNode;
  disabled?: boolean;
}) => {
  const [openState, setOpenState] = useState(false);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  // When disabled, force sidebar closed
  const effectiveOpen = disabled ? false : open;
  const effectiveSetOpen: React.Dispatch<React.SetStateAction<boolean>> = disabled
    ? () => {} // no-op when disabled
    : setOpen;

  return (
    <SidebarContext.Provider value={{ open: effectiveOpen, setOpen: effectiveSetOpen, animate: animate, mobileBarContent, mobileBarCenterContent, disabled }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate,
  mobileBarContent,
  mobileBarCenterContent,
  disabled,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
  mobileBarContent?: React.ReactNode;
  mobileBarCenterContent?: React.ReactNode;
  disabled?: boolean;
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate} mobileBarContent={mobileBarContent} mobileBarCenterContent={mobileBarCenterContent} disabled={disabled}>
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = (props: React.ComponentProps<"div">) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...props} />
    </>
  );
};

export const DesktopSidebar = ({
  className,
  children,
  style,
}: React.ComponentProps<"div">) => {
  const { open, setOpen, animate, disabled } = useSidebar();
  const [pinned, setPinned] = useState(false);
  const [pinPreferenceLoaded, setPinPreferenceLoaded] = useState(false);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearOpenTimer = useCallback(() => {
    if (!openTimerRef.current) return;
    clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (!closeTimerRef.current) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (disabled || pinned) return;
    if (!animate) {
      setOpen(true);
      return;
    }
    clearCloseTimer();
    clearOpenTimer();
    openTimerRef.current = setTimeout(() => setOpen(true), 90);
  }, [animate, clearCloseTimer, clearOpenTimer, disabled, pinned, setOpen]);

  const handleMouseLeave = useCallback(() => {
    if (disabled || pinned) return;
    if (!animate) {
      setOpen(false);
      return;
    }
    clearOpenTimer();
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setOpen(false), 140);
  }, [animate, clearCloseTimer, clearOpenTimer, disabled, pinned, setOpen]);

  const handleTogglePinned = useCallback(() => {
    if (disabled) return;
    clearOpenTimer();
    clearCloseTimer();
    setPinned((prev) => {
      const next = !prev;
      setOpen(next);
      return next;
    });
  }, [clearCloseTimer, clearOpenTimer, disabled, setOpen]);

  useEffect(() => () => {
    clearOpenTimer();
    clearCloseTimer();
  }, [clearOpenTimer, clearCloseTimer]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DESKTOP_SIDEBAR_PIN_STORAGE_KEY);
      const persistedPinned = raw === "1";
      setPinned(persistedPinned);
      setOpen(persistedPinned);
    } catch {
      // Ignore storage errors and continue with default unpinned behavior.
    } finally {
      setPinPreferenceLoaded(true);
    }
  }, [setOpen]);

  useEffect(() => {
    if (!pinPreferenceLoaded) return;
    try {
      window.localStorage.setItem(DESKTOP_SIDEBAR_PIN_STORAGE_KEY, pinned ? "1" : "0");
    } catch {
      // Ignore storage write failures.
    }
  }, [pinned, pinPreferenceLoaded]);

  useEffect(() => {
    if (!disabled) return;
    setPinned(false);
  }, [disabled]);

  return (
    <>
      <div
        className={cn(
          // z-20: sit above page-level fixed full-viewport layers (e.g. home bg) that share the viewport
          "min-h-screen px-3 py-4 hidden md:flex md:flex-col shrink-0 overflow-hidden rounded-r-xl relative z-20",
          className
        )}
        style={{
          width: animate ? (open ? 300 : 60) : 300,
          ...(style as React.CSSProperties),
        }}
        data-sidebar-open={open}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <button
          type="button"
          onClick={handleTogglePinned}
          className={cn(
            "absolute right-2 top-2 z-30 h-7 rounded-md px-2 text-[10px] font-semibold tracking-wide border",
            "transition-colors",
            pinned
              ? "text-cyan-300 border-cyan-400/60 bg-cyan-500/15"
              : "text-white/70 border-white/20 bg-black/20 hover:text-white hover:bg-white/10",
            disabled ? "pointer-events-none opacity-40" : undefined
          )}
          aria-label={pinned ? "Unpin sidebar" : "Pin sidebar"}
          aria-pressed={pinned}
          title={pinned ? "Unpin sidebar" : "Pin sidebar"}
        >
          {pinned ? "PINNED" : "PIN"}
        </button>
        {children as React.ReactNode}
      </div>
    </>
  );
};

export const MobileSidebar = ({
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div">) => {
  const { open, setOpen, mobileBarContent, mobileBarCenterContent, disabled } = useSidebar();
  return (
    <>
      <div
        className={cn(
          "fixed top-0 left-0 right-0 z-[99999] h-14 px-4 py-4 flex flex-row md:hidden items-center justify-between gap-2 bg-slate-950/70 border-b border-white/10 w-full"
        )}
        {...props}
      >
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          {mobileBarContent}
        </div>
        <div className="flex-1 flex items-center justify-center min-w-0 p-px">
          {mobileBarCenterContent}
        </div>
        <div className="flex justify-end z-20 shrink-0">
          <IconMenu2
            className={cn("cursor-pointer", disabled ? "text-white/30 pointer-events-none" : "text-white/80 hover:text-white")}
            onClick={() => !disabled && setOpen(!open)}
          />
        </div>
        {open && (
          <>
            {/* Backdrop — plain div (no Framer Motion) to match desktop sidebar reduced motion */}
            <div
              className="fixed inset-0 bg-black/50 z-[99998] md:hidden"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div
              className={cn(
                "fixed left-0 top-0 bottom-0 w-1/2 min-w-[160px] max-w-[220px] z-[99999] flex flex-col overflow-hidden",
                className
              )}
              style={style}
            >
              {/* Dedicated close row: above content so X is never covered by back link. Safe area so X isn't in status bar. */}
              <div
                className="shrink-0 flex items-center justify-end pr-1 min-h-12 pl-3"
                style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
              >
                <button
                  type="button"
                  onClick={() => setOpen(!open)}
                  className="flex items-center justify-center w-10 h-10 -mr-1 text-white/80 hover:text-white cursor-pointer touch-manipulation"
                  aria-label="Close menu"
                >
                  <IconX className="w-6 h-6" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto pl-3 pr-2 pb-4 flex flex-col">
                {children}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export type SidebarLinkProps = {
  link: Links;
  className?: string;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className'>;

export const SidebarLink = React.memo(({
  link,
  className,
  ...props
}: SidebarLinkProps) => {
  return (
    <a
      href={link.href}
      className={cn(
        "sidebar-item flex items-center group/sidebar py-2",
        className
      )}
      {...props}
    >
      {link.icon}
      <span className="sidebar-label text-inherit text-sm !p-0 !m-0">
        {link.label}
      </span>
    </a>
  );
});
SidebarLink.displayName = "SidebarLink";

export interface SidebarButtonProps {
  label: string;
  icon: React.JSX.Element | React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}

export const SidebarButton = React.memo(({
  label,
  icon,
  onClick,
  active = false,
  className,
}: SidebarButtonProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "sidebar-item flex items-center group/sidebar py-2 w-full",
        className
      )}
    >
      {icon}
      <span className="sidebar-label text-inherit text-sm !p-0 !m-0">
        {label}
      </span>
    </button>
  );
});
SidebarButton.displayName = "SidebarButton";
