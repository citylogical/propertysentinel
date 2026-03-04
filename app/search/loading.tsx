export default function SearchLoading() {
  return (
    <main className="min-h-screen px-6 py-12" style={{ backgroundColor: '#F5F5F5' }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between gap-6 mb-8">
          <div className="space-y-2">
            <div className="h-9 w-64 bg-slate-200 rounded animate-pulse" />
            <div className="h-5 w-48 bg-slate-200 rounded animate-pulse" />
          </div>
          <div className="h-10 w-28 bg-slate-200 rounded-lg animate-pulse" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Complaint section skeleton */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl bg-white border border-slate-200 p-5">
                <div className="h-3 w-24 bg-slate-200 rounded animate-pulse mb-3" />
                <div className="h-9 w-16 bg-slate-200 rounded animate-pulse mt-2" />
                <div className="h-3 w-32 bg-slate-200 rounded animate-pulse mt-2" />
              </div>
              <div className="rounded-xl bg-white border border-slate-200 p-5 sm:col-span-2">
                <div className="h-3 w-36 bg-slate-200 rounded animate-pulse mb-3" />
                <div className="h-6 w-full max-w-xs bg-slate-200 rounded animate-pulse mt-2" />
                <div className="h-4 w-24 bg-slate-200 rounded animate-pulse mt-2" />
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="h-4 w-40 bg-slate-200 rounded animate-pulse mb-3" />
              <div className="space-y-2">
                <div className="h-4 w-full bg-slate-200 rounded animate-pulse" />
                <div className="h-4 w-[85%] bg-slate-200 rounded animate-pulse" />
                <div className="h-4 w-3/4 max-w-md bg-slate-200 rounded animate-pulse" />
              </div>
            </div>

            {/* Violations section skeleton */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="h-3 w-32 bg-slate-200 rounded animate-pulse mb-4" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="h-4 w-28 bg-slate-200 rounded animate-pulse" />
                <div className="sm:col-span-2 space-y-2">
                  <div className="h-5 w-48 bg-slate-200 rounded animate-pulse" />
                  <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
                </div>
              </div>
              <div className="mt-4 rounded bg-slate-100 p-4">
                <div className="h-4 w-full bg-slate-200 rounded animate-pulse" />
                <div className="h-4 w-5/6 bg-slate-200 rounded animate-pulse mt-2" />
              </div>
            </div>

            {/* Permit section skeleton */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="h-3 w-28 bg-slate-200 rounded animate-pulse mb-4" />
              <div className="h-4 w-full max-w-sm bg-slate-200 rounded animate-pulse" />
              <div className="h-4 w-64 bg-slate-200 rounded animate-pulse mt-2" />
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
              <div className="h-4 w-full bg-slate-200 rounded animate-pulse mt-3" />
              <div className="h-4 w-full max-w-sm bg-slate-200 rounded animate-pulse mt-2" />
              <div className="h-10 w-24 bg-slate-200 rounded-lg animate-pulse mt-4" />
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
