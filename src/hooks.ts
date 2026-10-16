import { useEffect, useState } from 'preact/hooks'

export const useNow = (tickMs: number): number => {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const update = (): void => setNow(Date.now())
    const id = setInterval(update, tickMs)
    document.addEventListener('visibilitychange', update)
    update()
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', update)
    }
  }, [tickMs])
  return now
}
