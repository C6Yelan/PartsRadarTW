interface CategoryOptionProps {
  checked: boolean;
  label: string;
  subLabel: string;
  value: string;
  onChange: () => void;
}

export function CategoryOption({
  checked,
  label,
  subLabel,
  value,
  onChange,
}: CategoryOptionProps) {
  return (
    <label className={checked ? "category-option is-active" : "category-option"}>
      <input checked={checked} name="igrp" type="radio" value={value} onChange={onChange} />
      <span className="option-copy">
        <span>{label}</span>
        <small>{subLabel}</small>
      </span>
    </label>
  );
}
