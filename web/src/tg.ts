// Minimal typing for the parts of Telegram.WebApp we use.
// Docs: https://core.telegram.org/bots/webapps
interface TelegramWebApp {
  initData: string
  ready(): void
  expand(): void
  setHeaderColor?(color: string): void
  setBackgroundColor?(color: string): void
  disableVerticalSwipes?(): void
  openInvoice(url: string, cb?: (status: 'paid' | 'cancelled' | 'failed' | 'pending') => void): void
  HapticFeedback?: { impactOccurred(style: 'light' | 'medium' | 'heavy'): void; notificationOccurred(t: 'success' | 'error'): void }
  showAlert?(msg: string): void
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp }
  }
}

export const tg = window.Telegram?.WebApp
export const inTelegram = !!tg?.initData

export function initTelegram() {
  if (!tg) return
  tg.ready()
  tg.expand()
  tg.setHeaderColor?.('#1d1530')
  tg.setBackgroundColor?.('#1d1530')
  tg.disableVerticalSwipes?.()
}

export const haptic = (style: 'light' | 'medium' | 'heavy' = 'light') => tg?.HapticFeedback?.impactOccurred(style)
export const notify = (t: 'success' | 'error') => tg?.HapticFeedback?.notificationOccurred(t)

export function alert(msg: string) {
  if (inTelegram && tg?.showAlert) tg.showAlert(msg)
  else window.alert(msg)
}
