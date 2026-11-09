// Worker entry point. The Workers runtime only accepts handlers and classes as exports here,
// so the API code lives in api.ts.
import { handleApi, type Env } from './api'

export { Inbox } from './inbox'

export default {
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname.startsWith('/api/')) return handleApi(request, env, undefined, ctx)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
