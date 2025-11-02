const ReviewOrderSkeleton = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header skeleton */}
      <div className="py-5 sm:py-7 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="container max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between">
            <div className="h-8 bg-gray-200 rounded w-64 animate-pulse"></div>
            <div className="h-8 bg-blue-200 rounded-full w-24 animate-pulse"></div>
          </div>
        </div>
      </div>

      <section className="py-8 md:py-10">
        <div className="container max-w-6xl mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-6">
            {/* Main column skeleton */}
            <div className="md:col-span-2 space-y-6">
              {/* Articles section */}
              <div className="bg-white shadow rounded-lg p-6">
                <div className="h-6 bg-gray-200 rounded w-32 mb-4 animate-pulse"></div>
                <div className="space-y-4">
                  {[1, 2, 3].map((index) => (
                    <div
                      key={index}
                      className="flex items-start space-x-4 pb-4 border-b last:border-b-0"
                    >
                      <div className="w-20 h-20 bg-gray-200 rounded-lg animate-pulse"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/4 animate-pulse"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/3 animate-pulse"></div>
                      </div>
                      <div className="h-5 bg-gray-200 rounded w-20 animate-pulse"></div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment info section */}
              <div className="bg-white shadow rounded-lg p-6">
                <div className="h-6 bg-gray-200 rounded w-48 mb-4 animate-pulse"></div>
                <div className="space-y-3">
                  {[1, 2, 3].map((index) => (
                    <div key={index} className="flex justify-between py-2">
                      <div className="h-4 bg-gray-200 rounded w-32 animate-pulse"></div>
                      <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Info message */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="h-4 bg-blue-200 rounded w-full animate-pulse"></div>
                <div className="h-4 bg-blue-200 rounded w-3/4 mt-2 animate-pulse"></div>
              </div>
            </div>

            {/* Sidebar skeleton */}
            <div className="md:col-span-1">
              <div className="bg-white shadow rounded-lg p-6">
                <div className="h-6 bg-gray-200 rounded w-40 mb-4 animate-pulse"></div>

                <div className="space-y-3 mb-6">
                  {[1, 2].map((index) => (
                    <div key={index} className="flex justify-between">
                      <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
                      <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
                    </div>
                  ))}
                  <div className="border-t pt-3">
                    <div className="flex justify-between">
                      <div className="h-5 bg-gray-200 rounded w-28 animate-pulse"></div>
                      <div className="h-5 bg-blue-200 rounded w-24 animate-pulse"></div>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="space-y-3">
                  <div className="h-12 bg-green-200 rounded-md animate-pulse"></div>
                  <div className="h-12 bg-gray-200 rounded-md animate-pulse"></div>
                </div>

                {/* Security badges */}
                <div className="mt-6 pt-6 border-t">
                  <div className="h-4 bg-gray-200 rounded w-32 mx-auto animate-pulse"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ReviewOrderSkeleton;
