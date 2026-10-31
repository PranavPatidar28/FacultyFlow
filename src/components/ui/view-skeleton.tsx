export function ViewSkeleton() {
  return (
    <div className="view-skeleton" role="status" aria-label="Loading workspace">
      <span className="sr-only">Loading…</span>
      <div className="skeleton-toolbar" />
      <div className="skeleton-cards">
        {[0, 1, 2, 3].map((n) => (
          <div key={n} />
        ))}
      </div>
      <div className="skeleton-panel" />
    </div>
  );
}
