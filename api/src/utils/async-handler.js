/**
 * Wraps an async Express handler so a rejected promise reaches the error
 * middleware (Express 4 does not do this by itself).
 *
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<unknown>} fn
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
