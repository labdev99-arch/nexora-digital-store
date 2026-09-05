import {NextResponse} from 'next/server';

export class ResellerApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message = code,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function apiSuccess(data: unknown, status = 200, meta?: Record<string, unknown>) {
  return NextResponse.json({success: true, data, meta}, {status});
}

export function apiFailure(error: unknown, requestId: string) {
  const known = error instanceof ResellerApiError;
  const status = known ? error.status : 500;
  const code = known ? error.code : 'internal_error';
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message: known ? error.message : 'The request could not be completed.',
        details: known ? error.details : undefined,
        request_id: requestId
      }
    },
    {status}
  );
}
