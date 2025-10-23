/**
 * OAuth token management for Gmail API
 */

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface OAuthCredentials {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
}

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expiry_date?: number;
}

export class OAuth {
  private secretManager: SecretManagerServiceClient;
  private projectId: string;
  private secretName: string;

  constructor(projectId: string, secretName: string) {
    this.secretManager = new SecretManagerServiceClient({});
    this.projectId = projectId;
    this.secretName = secretName;
  }

  /**
   * Load OAuth credentials from Secret Manager
   */
  async loadCredentials(): Promise<OAuthCredentials> {
    const secretPath = `projects/${this.projectId}/secrets/${this.secretName}/versions/latest`;

    const [version] = await this.secretManager.accessSecretVersion({
      name: secretPath,
    });

    const payloadData = version.payload?.data;
    if (!payloadData) {
      throw new Error('OAuth credentials secret is empty');
    }

    const payload = typeof payloadData === 'string'
      ? payloadData
      : Buffer.from(payloadData as Uint8Array).toString('utf8');

    return JSON.parse(payload) as OAuthCredentials;
  }

  /**
   * Create OAuth2 client with credentials
   */
  async createOAuth2Client(): Promise<OAuth2Client> {
    const credentials = await this.loadCredentials();

    const oauth2Client = new google.auth.OAuth2(
      credentials.client_id,
      credentials.client_secret,
      credentials.redirect_uris[0]
    );

    return oauth2Client;
  }

  /**
   * Set tokens on OAuth2 client
   */
  setTokens(oauth2Client: OAuth2Client, tokens: OAuthTokens): void {
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    });
  }

  /**
   * Refresh access token if expired
   */
  async refreshTokenIfNeeded(oauth2Client: OAuth2Client): Promise<void> {
    const credentials = oauth2Client.credentials;

    // Check if token is expired or will expire soon (within 5 minutes)
    const expiryDate = credentials.expiry_date || 0;
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    if (expiryDate < now + fiveMinutes) {
      console.log('Access token expired or expiring soon, refreshing...');

      try {
        const { credentials: newCredentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(newCredentials);
        console.log('Access token refreshed successfully');
      } catch (error) {
        console.error('Failed to refresh access token', error);
        throw new Error('Failed to refresh Gmail OAuth token');
      }
    }
  }

  /**
   * Create authenticated Gmail client
   */
  async createGmailClient(tokens: OAuthTokens): Promise<gmail_v1.Gmail> {
    const oauth2Client = await this.createOAuth2Client();
    this.setTokens(oauth2Client, tokens);
    await this.refreshTokenIfNeeded(oauth2Client);

    return google.gmail({ version: 'v1', auth: oauth2Client });
  }
}
