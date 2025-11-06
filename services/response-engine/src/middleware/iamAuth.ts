/**
 * IAM Authentication Middleware
 *
 * Verifies that incoming requests to /execute-tool are authenticated
 * using Google Cloud IAM and come from authorized service accounts.
 *
 * Security Model:
 * - Requires valid Bearer token in Authorization header
 * - Verifies token is from authorized Vertex AI Agent service account
 * - Returns 401 for missing/invalid tokens
 * - Returns 403 for valid but unauthorized service accounts
 */

import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';

// Authorized service accounts that can call this Tool Server
// This should be the Vertex AI Agent service account
const AUTHORIZED_SERVICE_ACCOUNTS = [
  `vtx-agent-fds-tool-invoker@${process.env.PROJECT_ID || 'fdsanalytics'}.iam.gserviceaccount.com`
];

// OAuth2 client for token verification
const authClient = new OAuth2Client();

/**
 * IAM Authentication Middleware
 *
 * Validates Bearer tokens and ensures caller is authorized
 */
export async function iamAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn(JSON.stringify({
        severity: 'WARNING',
        message: 'IAM auth failed: Missing or invalid Authorization header',
        path: req.path,
        method: req.method
      }));

      res.status(401).json({
        status: 'error',
        error: {
          message: 'Authentication required',
          code: 'MISSING_AUTH_TOKEN'
        }
      });
      return;
    }

    // Extract token from "Bearer <token>"
    const token = authHeader.substring(7);

    // Verify the token using Google Auth Library
    let ticket;
    try {
      ticket = await authClient.verifyIdToken({
        idToken: token,
        audience: process.env.SERVICE_URL // Cloud Run service URL
      });
    } catch (verifyError: any) {
      console.warn(JSON.stringify({
        severity: 'WARNING',
        message: 'IAM auth failed: Invalid token',
        error: verifyError.message,
        path: req.path
      }));

      res.status(401).json({
        status: 'error',
        error: {
          message: 'Invalid authentication token',
          code: 'INVALID_AUTH_TOKEN'
        }
      });
      return;
    }

    // Extract email from verified token
    const payload = ticket.getPayload();
    const email = payload?.email;

    if (!email) {
      console.error(JSON.stringify({
        severity: 'ERROR',
        message: 'IAM auth failed: Token has no email claim',
        path: req.path
      }));

      res.status(401).json({
        status: 'error',
        error: {
          message: 'Invalid token: missing email claim',
          code: 'INVALID_TOKEN_PAYLOAD'
        }
      });
      return;
    }

    // Check if the service account is authorized
    if (!AUTHORIZED_SERVICE_ACCOUNTS.includes(email)) {
      console.warn(JSON.stringify({
        severity: 'WARNING',
        message: 'IAM auth failed: Unauthorized service account',
        email,
        authorized_accounts: AUTHORIZED_SERVICE_ACCOUNTS,
        path: req.path
      }));

      res.status(403).json({
        status: 'error',
        error: {
          message: 'Forbidden: Service account not authorized',
          code: 'UNAUTHORIZED_SERVICE_ACCOUNT'
        }
      });
      return;
    }

    // Authentication successful - attach email to request for logging
    (req as any).authenticatedEmail = email;

    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'IAM authentication successful',
      email,
      path: req.path,
      method: req.method
    }));

    // Proceed to next middleware/handler
    next();
  } catch (error: any) {
    console.error(JSON.stringify({
      severity: 'ERROR',
      message: 'IAM auth middleware error',
      error: error.message,
      stack: error.stack,
      path: req.path
    }));

    res.status(500).json({
      status: 'error',
      error: {
        message: 'Internal authentication error',
        code: 'AUTH_ERROR'
      }
    });
  }
}

/**
 * Development-only bypass for local testing
 * DO NOT USE IN PRODUCTION
 *
 * Set BYPASS_IAM_AUTH=true in local .env to skip auth checks
 */
export function iamAuthOrBypass(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (process.env.ENVIRONMENT === 'development' && process.env.BYPASS_IAM_AUTH === 'true') {
    console.warn(JSON.stringify({
      severity: 'WARNING',
      message: 'IAM auth bypassed (development mode)',
      path: req.path
    }));
    (req as any).authenticatedEmail = 'dev-bypass@local';
    next();
    return;
  }

  // Use standard IAM auth
  iamAuth(req, res, next);
}
