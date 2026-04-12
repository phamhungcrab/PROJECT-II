import { useEffect, useRef, useState } from 'react'

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unexpected error while loading data.'
}

export function useApiResource<T>(
  loader: () => Promise<T>,
  dependencies: readonly unknown[] = [],
) {
  const loaderRef = useRef(loader)
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const dependencyKey = JSON.stringify(dependencies)

  loaderRef.current = loader

  useEffect(() => {
    let active = true

    const run = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const nextData = await loaderRef.current()
        if (!active) {
          return
        }

        setData(nextData)
      } catch (requestError) {
        if (!active) {
          return
        }

        setError(getErrorMessage(requestError))
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void run()

    return () => {
      active = false
    }
  }, [dependencyKey, reloadToken])

  return {
    data,
    isLoading,
    error,
    reload: () => setReloadToken((value) => value + 1),
  }
}
