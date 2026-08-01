import { useCallback, useState } from 'react'

export function useAsyncAction(action) {
  const [state, setState] = useState({ busy: false, result: null, error: null })
  const run = useCallback(async (...args) => {
    // Preserve the last successful result during refreshes so tables do not
    // disappear or jump back to an empty loading state.
    setState((current) => ({ ...current, busy: true, error: null }))
    try {
      const result = await action(...args)
      setState({ busy: false, result, error: null })
      return result
    } catch (error) {
      setState((current) => ({ ...current, busy: false, error }))
      return null
    }
  }, [action])
  const reset = useCallback(() => setState({ busy: false, result: null, error: null }), [])
  return { ...state, run, reset }
}
