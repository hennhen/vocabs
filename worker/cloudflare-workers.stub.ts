// Test-only stand-in for the `cloudflare:workers` module, which only exists in the Workers runtime.
export class DurableObject {
  constructor(
    public ctx: unknown,
    public env: unknown,
  ) {}
}
