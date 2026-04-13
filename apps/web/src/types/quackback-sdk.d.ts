import type { QuackbackAPI } from '@/lib/shared/widget/types'

declare global {
  interface Window {
    Quackback?: QuackbackAPI
  }

  var Quackback: QuackbackAPI
}

export {}
