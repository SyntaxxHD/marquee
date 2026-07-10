export class MarqueeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MarqueeError'
  }
}
