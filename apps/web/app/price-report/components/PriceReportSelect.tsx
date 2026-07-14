// apps/web/app/price-report/components/PriceReportSelect.tsx
// 提供價格變動總覽專用、可鍵盤操作的單選清單。

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDownIcon } from "../../_shared/icons";

export interface PriceReportSelectOption<T extends string> {
  value: T;
  label: string;
}

interface PriceReportSelectProps<T extends string> {
  ariaLabel: string;
  options: readonly PriceReportSelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function PriceReportSelect<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: PriceReportSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedOption = options[selectedIndex];

  useEffect(() => {
    if (!isOpen) return;

    setActiveIndex(selectedIndex);
    listboxRef.current?.focus();
  }, [isOpen, selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;

    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [isOpen]);

  function openMenu() {
    setActiveIndex(selectedIndex);
    setIsOpen(true);
  }

  function closeMenu(restoreTriggerFocus = false) {
    setIsOpen(false);
    if (restoreTriggerFocus) triggerRef.current?.focus();
  }

  function selectOption(index: number) {
    const option = options[index];
    if (!option) return;

    onChange(option.value);
    closeMenu(true);
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      openMenu();
    }
  }

  function handleListboxKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + direction + options.length) % options.length);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOption(activeIndex);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (event.key === "Tab") setIsOpen(false);
  }

  return (
    <div className={isOpen ? "price-report-select is-open" : "price-report-select"} ref={rootRef}>
      <button
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="price-report-select-trigger"
        ref={triggerRef}
        type="button"
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selectedOption?.label ?? ""}</span>
        <ChevronDownIcon className="price-report-select-chevron" />
      </button>

      {isOpen ? (
        <div
          aria-activedescendant={`${listboxId}-option-${activeIndex}`}
          aria-label={ariaLabel}
          className="price-report-select-listbox"
          id={listboxId}
          ref={listboxRef}
          role="listbox"
          tabIndex={-1}
          onKeyDown={handleListboxKeyDown}
        >
          {options.map((option, index) => (
            <button
              aria-selected={option.value === value}
              className={index === activeIndex ? "price-report-select-option is-active" : "price-report-select-option"}
              id={`${listboxId}-option-${index}`}
              key={option.value}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              role="option"
              tabIndex={-1}
              type="button"
              onClick={() => selectOption(index)}
              onPointerMove={() => setActiveIndex(index)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
