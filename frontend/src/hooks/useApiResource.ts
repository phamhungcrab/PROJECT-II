import { useCallback, useEffect, useRef, useState } from 'react'
import { presenterRefreshEventName } from '../app/presenterDirector'

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
  const requestIdRef = useRef(0)
  const mountedRef = useRef(false)
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const dependencyKey = JSON.stringify(dependencies)

  loaderRef.current = loader

  const run = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (mountedRef.current) {
      setIsLoading(true)
      setError(null)
    }

    try {
      const nextData = await loaderRef.current()
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return { data: null, succeeded: false } as const
      }

      setData(nextData)
      return { data: nextData, succeeded: true } as const
    } catch (requestError) {
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return { data: null, succeeded: false } as const
      }

      setError(getErrorMessage(requestError))
      return { data: null, succeeded: false } as const
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      requestIdRef.current += 1
    }
  }, [])

  useEffect(() => {
    void run()
  }, [dependencyKey, run])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handlePresenterRefresh = () => {
      void run()
    }

    window.addEventListener(presenterRefreshEventName, handlePresenterRefresh)

    return () => {
      window.removeEventListener(presenterRefreshEventName, handlePresenterRefresh)
    }
  }, [run])

  return {
    data,
    isLoading,
    error,
    reload: run,
  }
}
