// apps/web/app/build-list/components/BuildListLoadingState.tsx
export default function BuildListLoadingState() {
  return (
    <section className="detail-loading" aria-label="配單載入中">
      <span className="skeleton-box wide" />
      <span className="skeleton-box medium" />
      <span className="skeleton-box short" />
    </section>
  );
}
