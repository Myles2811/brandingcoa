export default function DataState({
  loading, error, empty, emptyMessage = 'No records match the current filters.', children,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyMessage?: string;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="space-y-2 py-2" aria-busy="true">
        {Array.from({ length: 6 }, (_, index) => <div key={index} className="skeleton-pulse h-14 rounded-lg border border-[#E1E7F0] bg-white" />)}
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-10 text-center">
        <p className="font-semibold text-red-900">Unable to load reconciliation data</p>
        <p className="mt-1 text-sm text-red-700">{error}</p>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="rounded-lg border border-dashed border-[#CBD5E1] bg-white px-5 py-14 text-center text-sm text-[#667085]">
        {emptyMessage}
      </div>
    );
  }
  return children;
}
