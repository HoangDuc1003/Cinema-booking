# Server Instructions

## Architecture
- Routes map endpoints.
- Controllers translate HTTP requests and responses.
- Services own business logic.
- Models own persistence schema.
- Keep controllers thin.

## Data integrity
- Do not trust URLs, MIME types, dimensions, duration, or storage IDs sent by the client.
- Verify Cloudinary assets server-side.
- Update active assets atomically.
- Invalidate Redis only after successful state changes.

## API behavior
- Return explicit errors.
- Do not silently convert server failures into successful responses.
- Preserve backward-compatible public contracts unless migration is included.

## Security
- Admin mutations require `protectAdmin`.
- Never expose public IDs, secrets, internal failure details, or credentials.
- Validate all environment variables at startup.

## Validation
- `npm test`
- `npm start` or a syntax/startup verification
