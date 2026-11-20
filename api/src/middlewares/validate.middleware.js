/**
 * Validates parts of the request with zod schemas and replaces them with the
 * parsed (typed, trimmed, defaulted) values. A failure becomes a 400 response
 * through the error middleware.
 *
 * @example router.post('/accounts', validate({ body: createAccountSchema }), controller.create)
 * @param {{ body?: import('zod').ZodType, query?: import('zod').ZodType, params?: import('zod').ZodType }} schemas
 */
export const validate = (schemas) => (req, _res, next) => {
  if (schemas.params) req.params = schemas.params.parse(req.params);
  if (schemas.query) req.validatedQuery = schemas.query.parse(req.query);
  if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
  next();
};
