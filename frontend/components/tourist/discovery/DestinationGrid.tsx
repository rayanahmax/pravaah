"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { EmptyState } from "@/components/tourist/ui";
import type { DestinationRow, CapacityDto } from "@/types/tourist";
import { DestinationCard } from "./DestinationCard";
import styles from "./discovery.module.css";

export type DestinationWithCapacity = {
  destination: DestinationRow;
  capacity?: CapacityDto;
};

interface DestinationGridProps {
  items: DestinationWithCapacity[];
}

type FilterOption = "ALL" | "OPEN" | "RESTRICTED" | "CLOSED";

export function DestinationGrid({ items }: DestinationGridProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterOption>("ALL");

  const filteredItems = items.filter(({ destination }) => {
    const matchesSearch =
      search.trim() === "" ||
      destination.name.toLowerCase().includes(search.toLowerCase()) ||
      destination.description?.toLowerCase().includes(search.toLowerCase()) ||
      destination.type?.toLowerCase().includes(search.toLowerCase());

    const matchesFilter =
      filter === "ALL" || destination.access_status === filter;

    return matchesSearch && matchesFilter;
  });

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <div className={styles.searchBox}>
          <Search size={18} className={styles.searchIcon} aria-hidden="true" />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by destination name, type or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search destinations"
          />
        </div>

        <div className={styles.filterGroup} role="radiogroup" aria-label="Access status filter">
          {(["ALL", "OPEN", "RESTRICTED", "CLOSED"] as FilterOption[]).map((status) => (
            <button
              key={status}
              type="button"
              className={`${styles.filterBtn} ${
                filter === status ? styles.filterBtnActive : ""
              }`}
              onClick={() => setFilter(status)}
              role="radio"
              aria-checked={filter === status}
            >
              {status === "ALL" ? "All statuses" : status}
            </button>
          ))}
        </div>
      </div>

      {filteredItems.length > 0 ? (
        <div className={styles.grid}>
          {filteredItems.map(({ destination, capacity }) => (
            <DestinationCard
              key={destination.id}
              destination={destination}
              capacity={capacity}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Search size={24} />}
          title="No destinations found"
          message={
            search || filter !== "ALL"
              ? "Try adjusting your search query or status filter."
              : "There are currently no regulated destinations registered in the system."
          }
        />
      )}
    </div>
  );
}
