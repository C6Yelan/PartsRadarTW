const SKELETON_ROWS = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6"];

export function SkeletonRows() {
  return (
    <>
      {SKELETON_ROWS.map((row) => (
        <div className="product-row skeleton-row" key={row}>
          <span className="skeleton-box image" />
          <span className="skeleton-box wide" />
          <span className="skeleton-box short" />
          <span className="skeleton-box short" />
          <span className="skeleton-box short" />
        </div>
      ))}
    </>
  );
}
