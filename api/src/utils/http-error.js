/**
 * An error with an HTTP status. Throw it anywhere (service, controller…);
 * the error middleware turns it into a JSON response:
 *   { "message": "...", "code": "NOT_FOUND" }
 */
export class HttpError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} message Message safe to show to the user
   * @param {string} [code] Stable machine-readable code
   */
  constructor(status, message, code = HttpError.codeFor(status)) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }

  static codeFor(status) {
    return (
      {
        400: 'BAD_REQUEST',
        401: 'UNAUTHORIZED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        409: 'CONFLICT',
        413: 'PAYLOAD_TOO_LARGE',
        429: 'TOO_MANY_REQUESTS',
      }[status] ?? 'ERROR'
    );
  }

  static badRequest = (message) => new HttpError(400, message);
  static unauthorized = (message = 'Not logged in') => new HttpError(401, message);
  static forbidden = (message = 'You are not allowed to do this') => new HttpError(403, message);
  static notFound = (message = 'Not found') => new HttpError(404, message);
  static conflict = (message) => new HttpError(409, message);
}
