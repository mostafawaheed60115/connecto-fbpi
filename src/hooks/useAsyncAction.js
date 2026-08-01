import { useCallback, useState } from 'react'

export function useAsyncAction(action) {
  const [state, setState] = useState({ busy: false, result: null, error: null })
  const run = useCallback(async (...args) => {
    setState({ busy: true, result: null, error: null })
    try {
      const result = await action(...args)
      setState({ busy: false, result, error: null })
      return result
    } catch (error) {
      setState({ busy: false, result: null, error })
      return null
    }
  }, [action])
  const reset = useCallback(() => setState({ busy: false, result: null, error: null }), [])
  return { ...state, run, reset }
}
