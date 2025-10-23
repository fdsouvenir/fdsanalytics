import { Request, Response } from 'express';

interface SetupRequest {
  workspaceId: string;
  userId: string;
  gmailAuthCode?: string;
}

interface SetupResponse {
  success: boolean;
  tenantId?: string;
  message: string;
  backfillJobId?: string;
}

/**
 * Handle /setup command
 *
 * V1: Not implemented (hardcoded tenant)
 * Future: Will create tenant and start backfill
 */
export async function handleSetupCommand(req: Request, res: Response): Promise<void> {
  try {
    const response: SetupResponse = {
      success: false,
      message: 'Setup is not required in V1. Your account is already configured for Senso Sushi.'
    };

    res.json({
      text: response.message
    });
  } catch (error: any) {
    console.error('Error in setup handler', {
      error: error.message
    });

    res.status(500).json({
      text: 'Sorry, I encountered an error during setup. Please contact support.'
    });
  }
}
