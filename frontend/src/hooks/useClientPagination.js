import { useState, useEffect, useMemo } from "react";

/**
 * Client-side pagination for in-memory lists.
 * Resets to page 1 when `items` length or `resetKey` changes.
 */
export function useClientPagination(items, pageSize = 10, resetKey = "") {
  const [page, setPage] = useState(1);

  const totalItems = items?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize) || 1);

  useEffect(() => {
    setPage(1);
  }, [resetKey, totalItems]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const safePage = Math.min(Math.max(1, page), totalPages);

  const slice = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  return {
    page: safePage,
    setPage,
    totalPages,
    totalItems,
    pageSize,
    slice,
  };
}
