"use client";
import { cn } from "@/lib/utils";
import React, { useState, createContext, useContext } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconMenu2, IconX } from "@tabler/icons-react";
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

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...(props as unknown as React.ComponentProps<"div">)} />
    </>
  );
};

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen, animate } = useSidebar();
  return (
    <>
      <motion.div
        className={cn(
          "min-h-screen px-3 py-4 hidden md:flex md:flex-col w-[300px] shrink-0 overflow-hidden rounded-r-xl",
          className
        )}
        animate={{
          width: animate ? (open ? "300px" : "60px") : "300px",
        }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        {...props}
      >
        {children}
      </motion.div>
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
          "fixed top-0 left-0 right-0 z-[99999] h-14 px-4 py-4 flex flex-row md:hidden items-center justify-between gap-2 bg-slate-950/40 border-b border-white/10 w-full"
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
        <AnimatePresence>
          {open && (
            <>
              {/* Backdrop - tap to close */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black/50 z-[99998] md:hidden"
                onClick={() => setOpen(false)}
                aria-hidden
              />
              <motion.div
                initial={{ x: "-100%", opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: "-100%", opacity: 0 }}
                transition={{
                  duration: 0.3,
                  ease: "easeInOut",
                }}
                className={cn(
                  "fixed left-0 top-0 bottom-0 w-1/2 min-w-[160px] max-w-[220px] pl-3 pr-2 py-4 z-[99999] flex flex-col justify-between overflow-y-auto",
                  className
                )}
                style={style}
              >
                <div
                  className="absolute right-2 top-3 z-50 text-white/80 hover:text-white cursor-pointer p-1"
                  onClick={() => setOpen(!open)}
                >
                  <IconX className="w-5 h-5" />
                </div>
                {children}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

export type SidebarLinkProps = {
  link: Links;
  className?: string;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className'>;

export const SidebarLink = ({
  link,
  className,
  ...props
}: SidebarLinkProps) => {
  const { open, animate } = useSidebar();
  return (
    <a
      href={link.href}
      className={cn(
        "flex items-center justify-start gap-2 group/sidebar py-2",
        className
      )}
      {...props}
    >
      {link.icon}

      <motion.span
        animate={{
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="text-inherit text-sm group-hover/sidebar:translate-x-1 transition-transform duration-150 whitespace-nowrap inline-block !p-0 !m-0"
      >
        {link.label}
      </motion.span>
    </a>
  );
};

export interface SidebarButtonProps {
  label: string;
  icon: React.JSX.Element | React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}

export const SidebarButton = ({
  label,
  icon,
  onClick,
  active = false,
  className,
}: SidebarButtonProps) => {
  const { open, animate } = useSidebar();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-start gap-2 group/sidebar py-2 w-full text-left",
        className
      )}
    >
      {icon}
      <motion.span
        animate={{
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="text-inherit text-sm group-hover/sidebar:translate-x-1 transition-transform duration-150 whitespace-nowrap inline-block !p-0 !m-0"
      >
        {label}
      </motion.span>
    </button>
  );
};
