import { cn } from "@/lib/utils";

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "mx-auto grid max-3xl grid-cols-1 gap-1 md:grid-cols-[1fr_1fr] md:grid-template-rows: 75% 25%",
        className,
      )}
    >
      {children}
    </div>
  );
};

export const BentoGridItem = ({
  className,
  title,
  description,
  header,
  icon,
  onClick,
  children,
}: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "group/bento shadow-input flex flex-col justify-between space-y-4 rounded-lg border p-4 dark:border-white/[0.2] dark:shadow-none",
        onClick && "cursor-pointer hover:scale-105",
        className,
      )}
      style={{
        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
        boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
        border: '1px inset rgba(60, 60, 60, 0.5)',
      }}
      onClick={onClick}
    >
      {header}
      <div className={cn("flex flex-col", (!title && !description) && "flex-1 min-h-0")}>
        {icon}
        {title != null && title !== "" && (
          <div className="mt-1 mb-0.5 font-poppins font-bold text-white dark:text-white text-center">
            {title}
          </div>
        )}
        {description != null && description !== "" && (
          <div className="font-poppins text-xs font-normal text-white dark:text-white text-center">
            {description}
          </div>
        )}
        <div className={cn(!title && !description && "flex-1 min-h-0 flex flex-col")}>
          {children}
        </div>
      </div>
    </div>
  );
};
