import { useEffect, useRef, useState } from "react";
import type { ProductVendorOption } from "../types";

interface VendorFilterProps {
  options: readonly ProductVendorOption[];
  disabledLabel: string;
  selectedCategoryName: string;
  selectedOptions: ProductVendorOption[];
  selectedValues: string[];
  onClear: () => void;
  onToggle: (vendor: string) => void;
}

export function VendorFilter({
  options,
  disabledLabel,
  selectedCategoryName,
  selectedOptions,
  selectedValues,
  onClear,
  onToggle,
}: VendorFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isAvailable = options.length > 0;
  const summaryLabel =
    selectedOptions.length === 0
      ? "全部廠商"
      : selectedOptions.length <= 2
        ? selectedOptions.map((option) => option.name).join("、")
        : `${selectedOptions.length} 個廠商`;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeOnOutsideClick(event: PointerEvent) {
      const menu = menuRef.current;

      if (menu && !menu.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isAvailable) {
      setIsOpen(false);
    }
  }, [isAvailable]);

  return (
    <div className="vendor-filter">
      <span>廠商</span>
      {isAvailable ? (
        <div className={isOpen ? "vendor-menu is-open" : "vendor-menu"} ref={menuRef}>
          <button
            aria-expanded={isOpen}
            aria-haspopup="menu"
            className="vendor-menu-trigger"
            type="button"
            onClick={() => setIsOpen((current) => !current)}
          >
            <span>{summaryLabel}</span>
            <span className="filter-chevron" aria-hidden="true" />
          </button>
          {isOpen ? (
            <div className="vendor-menu-popover">
              <div className="vendor-menu-header">
                <span>{selectedCategoryName}</span>
                {selectedValues.length > 0 ? (
                  <button type="button" onClick={onClear}>
                    清除
                  </button>
                ) : null}
              </div>
              <div className="vendor-option-list">
                {options.map((option) => {
                  const checked = selectedValues.includes(option.slug);

                  return (
                    <label
                      className={checked ? "vendor-option is-active" : "vendor-option"}
                      key={option.slug}
                    >
                      <input
                        checked={checked}
                        type="checkbox"
                        value={option.slug}
                        onChange={() => onToggle(option.slug)}
                      />
                      <span>{option.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <span className="vendor-filter-disabled">{disabledLabel}</span>
      )}
    </div>
  );
}
