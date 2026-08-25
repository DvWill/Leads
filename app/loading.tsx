export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6" aria-label="Carregando">
      <div className="skeleton h-9 w-64" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => <div key={index} className="skeleton h-28" />)}
      </div>
      <div className="skeleton h-96" />
    </div>
  );
}
