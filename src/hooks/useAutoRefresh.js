import { useEffect, useRef } from 'react'

/** Refresh visible operational data on an interval and when the tab returns. */
export function useAutoRefresh(callback, intervalMs = 30_000) {
  const callbackRef = useRef(callback)
  const lastRunRef = useRef(Date.now())

  useEffect(() => { callbackRef.current = callback }, [callback])

  useEffect(() => {
    function refresh() {
      const now = Date.now()
      if (document.visibilityState !== 'visible' || now - lastRunRef.current < 1_000) return
      lastRunRef.current = now
      void callbackRef.current()
    }

    const interval = window.setInterval(refresh, intervalMs)
    const handleVisibility = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [intervalMs])
}
