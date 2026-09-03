import { Router as ExpressRouter } from "express";

// Express 4 does NOT automatically catch a rejected promise thrown inside
// an async route handler — it becomes an unhandled rejection (logged by
// the process.on("unhandledRejection", ...) handler in server.js) and the
// HTTP request is simply never answered. The client is left hanging
// (spinner forever) instead of getting a clean error.
//
// This showed up for real during testing: when the database was
// momentarily unreachable, POST /api/auth/login hung indefinitely instead
// of returning a 500, because the query wasn't wrapped in try/catch.
//
// Rather than manually wrap every controller function, this file wraps
// every handler registered through it — so any future route/controller
// automatically gets the same safety net, with nothing extra to remember.
function wrap(handler) {
  return async function wrapped(req, res, next) {
    try {
      await handler(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

const METHODS = ["get", "post", "put", "patch", "delete", "use"];

/** Drop-in replacement for express.Router() — same API, but every
 * handler passed to .get/.post/.put/.patch/.delete/.use is wrapped so a
 * rejected promise reaches Express's error-handling middleware (and thus
 * the client) instead of hanging forever. */
export function Router(options) {
  const router = ExpressRouter(options);
  for (const method of METHODS) {
    const original = router[method].bind(router);
    router[method] = (...args) => {
      const wrapped = args.map((a) => (typeof a === "function" ? wrap(a) : a));
      return original(...wrapped);
    };
  }
  return router;
}
