// apps/web/app/product-explorer/components/CategoryOption.tsx
// 呈現商品探索頁分類篩選使用的單一 radio 選項。

interface CategoryOptionProps {
  checked: boolean;
  label: string;
  subLabel: string;
  value: string;
  onChange: () => void;
}

// 顯示分類名稱與來源站分類名稱，並把選取狀態交給原生 radio input。
export function CategoryOption({ checked, label, subLabel, value, onChange }: CategoryOptionProps) {
  return (
    <label className={checked ? "category-option is-active" : "category-option"}>
      <input checked={checked} name="category" type="radio" value={value} onChange={onChange} />
      <span className="option-copy">
        <span>{label}</span>
        <small>{subLabel}</small>
      </span>
    </label>
  );
}
