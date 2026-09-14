// Unknown API routes answer in the same JSON shape as every other API error,
// instead of Express's default HTML page.
export const notFoundHandler = (req, res) => {
    res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.originalUrl} does not exist.`,
    });
};

// Last line of defence for errors a controller did not handle. The stack trace
// and internal message stay in the server log; the client gets a stable code
// and the request ID it can quote when reporting the problem.
// eslint-disable-next-line no-unused-vars -- Express recognises error handlers by their four arguments.
export const errorHandler = (error, req, res, next) => {
    const requestedStatus = Number(error?.statusCode || error?.status);
    const status = requestedStatus >= 400 && requestedStatus < 600 ? requestedStatus : 500;
    // body-parser marks malformed JSON as `entity.parse.failed`.
    const code = error?.type === 'entity.parse.failed' ? 'INVALID_JSON' : (error?.code || 'INTERNAL_ERROR');

    console.error(JSON.stringify({
        event: 'unhandled-request-error',
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status,
        errorCode: code,
        message: error?.message,
    }));

    if (res.headersSent) return;
    res.status(status).json({
        success: false,
        code: typeof code === 'string' ? code : 'INTERNAL_ERROR',
        // A 5xx message may describe internals, so only client errors echo it.
        message: status < 500 && error?.message ? error.message : 'Something went wrong. Please try again.',
        requestId: req.requestId,
    });
};
