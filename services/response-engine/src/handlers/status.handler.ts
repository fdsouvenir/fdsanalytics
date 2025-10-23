import { Request, Response } from 'express';

interface StatusRequest {
  workspaceId: string;
  userId: string;
}

interface StatusResponse {
  status: 'not_started' | 'running' | 'completed' | 'failed';
  progress?: {
    totalReports: number;
    processedReports: number;
    failedReports: number;
    percentComplete: number;
    currentDate?: string;
    estimatedMinutesRemaining?: number;
  };
  message: string;
}

/**
 * Handle /status command
 *
 * V1: Returns static status (all data already loaded)
 * Future: Will query ingestion_log table for backfill status
 */
export async function handleStatusCommand(req: Request, res: Response): Promise<void> {
  try {
    const response: StatusResponse = {
      status: 'completed',
      message: 'All historical data has been loaded. Your analytics are ready!'
    };

    res.json({
      text: response.message
    });
  } catch (error: any) {
    console.error('Error in status handler', {
      error: error.message
    });

    res.status(500).json({
      text: 'Sorry, I encountered an error checking status. Please try again.'
    });
  }
}
