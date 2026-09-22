import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  noun?: string;
}

export function Pagination({
  page,
  pages,
  total,
  pageSize,
  onPageChange,
  noun = "results",
}: PaginationProps) {
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-4 border-t border-border px-4 py-3 text-[13px] text-muted-foreground"
    >
      <p>
        <span className="font-mono text-foreground">
          {first}–{last}
        </span>{" "}
        of <span className="font-mono text-foreground">{total}</span> {noun}
      </p>
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline">
          Page <span className="font-mono text-foreground">{page}</span> of{" "}
          <span className="font-mono text-foreground">{Math.max(pages, 1)}</span>
        </span>
        <Button
          variant="secondary"
          size="icon-sm"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="secondary"
          size="icon-sm"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
