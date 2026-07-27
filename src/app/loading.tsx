export default function Loading() {
  return (
    <main className="min-h-screen bg-[#F5F6F8] p-6" aria-busy="true" aria-label="Loading reconciliation dashboard">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <div className="skeleton-pulse h-14 rounded-xl bg-[#E4E7EC]" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="skeleton-pulse h-28 rounded-xl bg-[#E4E7EC]" />)}
        </div>
        <div className="skeleton-pulse h-[520px] rounded-xl bg-[#E4E7EC]" />
      </div>
    </main>
  );
}
