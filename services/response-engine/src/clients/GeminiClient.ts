import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { GoogleGenerativeAI, GenerativeModel, FunctionDeclaration } from '@google/generative-ai';

interface GeminiFunction {
  name: string;
  description?: string;
  parameters?: any;
}

interface GeminiMessage {
  role: 'user' | 'model' | 'function';
  parts: any[];
}

interface GenerateResponseInput {
  userMessage: string;
  context?: string;
  availableFunctions?: GeminiFunction[];
}

interface GenerateResponseOutput {
  text?: string;
  functionCall?: {
    name: string;
    args: Record<string, any>;
  };
}

interface GenerateChatResponseInput {
  userMessage: string;
  systemInstruction: string;
  conversationHistory: Array<{
    role: 'user' | 'model';
    content: string;
  }>;
  availableFunctions?: GeminiFunction[];
}

/**
 * GeminiClient - Interface to Google Gemini Pro API
 *
 * Handles:
 * - Loading API key from Secret Manager
 * - Generating responses with Gemini 2.5 Pro
 * - Function calling for MCP tool orchestration
 * - Retry with backoff on rate limits
 */
export class GeminiClient {
  private genAI: GoogleGenerativeAI | null = null;
  private model: GenerativeModel | null = null;
  private apiKey: string | null = null;

  constructor(
    private projectId: string,
    private geminiSecretName: string,
    private modelName: string = 'gemini-2.5-pro'
  ) {}

  /**
   * Initialize the Gemini client by loading API key
   */
  async initialize(): Promise<void> {
    if (this.genAI) {
      return; // Already initialized
    }

    try {
      this.apiKey = await this.loadApiKey();
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      this.model = this.genAI.getGenerativeModel({ model: this.modelName });
    } catch (error: any) {
      console.error('Failed to initialize GeminiClient', { error: error.message });
      throw new Error('Failed to initialize Gemini API');
    }
  }

  /**
   * Load Gemini API key from Secret Manager
   */
  private async loadApiKey(): Promise<string> {
    try {
      const client = new SecretManagerServiceClient();
      const secretPath = `projects/${this.projectId}/secrets/${this.geminiSecretName}/versions/latest`;

      const [version] = await client.accessSecretVersion({ name: secretPath });
      const apiKey = version.payload?.data?.toString();

      if (!apiKey) {
        throw new Error('API key is empty');
      }

      return apiKey;
    } catch (error: any) {
      console.error('Failed to load Gemini API key from Secret Manager', {
        error: error.message,
        secretName: this.geminiSecretName
      });
      throw error;
    }
  }

  /**
   * Generate response using Gemini Pro
   */
  async generateResponse(input: GenerateResponseInput): Promise<GenerateResponseOutput> {
    await this.initialize();

    if (!this.model) {
      throw new Error('Gemini model not initialized');
    }

    try {
      // Build prompt with context
      let prompt = input.userMessage;
      if (input.context) {
        prompt = `Context: ${input.context}\n\nUser query: ${input.userMessage}`;
      }

      // If functions available, use function calling
      if (input.availableFunctions && input.availableFunctions.length > 0) {
        return await this.generateWithFunctions(prompt, input.availableFunctions);
      }

      // Regular generation without functions
      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text?.() || '';

      return { text };
    } catch (error: any) {
      console.error('Gemini API error', { error: error.message });

      // Check for rate limit
      if (error.message?.includes('quota') || error.message?.includes('rate limit')) {
        console.warn('Gemini rate limit hit, waiting and retrying...');
        await this.sleep(10000); // Wait 10 seconds
        return await this.generateResponse(input); // Retry once
      }

      throw new Error(`Gemini API error: ${error.message}`);
    }
  }

  /**
   * Generate response using chat session with system instructions and history
   */
  async generateChatResponse(
    input: GenerateChatResponseInput,
    modelOverride?: string
  ): Promise<GenerateResponseOutput> {
    await this.initialize();

    if (!this.genAI) {
      throw new Error('Gemini not initialized');
    }

    try {
      // Use override model if provided, otherwise use default
      const modelToUse = modelOverride || this.modelName;

      if (modelOverride) {
        console.log(JSON.stringify({
          severity: 'DEBUG',
          message: 'Using model override for chat response',
          defaultModel: this.modelName,
          overrideModel: modelToUse
        }));
      }

      // Convert conversation history to Gemini format
      const history = this.convertToGeminiHistory(input.conversationHistory);

      // Prepare function declarations
      const functionDeclarations: FunctionDeclaration[] = (input.availableFunctions || []).map(fn => ({
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters
      }));

      // Create model with system instruction and tools
      const modelConfig: any = {
        model: modelToUse,
        systemInstruction: {
          parts: [{ text: input.systemInstruction }]
        },
        generationConfig: {
          temperature: 1,
          topP: 0.95
        }
      };

      if (functionDeclarations.length > 0) {
        modelConfig.tools = [{ functionDeclarations }];

        // Force function calling mode for faster tool selection
        // Mode 'ANY' eliminates "should I call a function?" decision step
        modelConfig.toolConfig = {
          functionCallingConfig: {
            mode: 'ANY'
          }
        };
      }

      const model = this.genAI.getGenerativeModel(modelConfig);

      let result;

      // Optimization: Use direct generateContent() when history is empty (faster)
      // This matches AI Studio behavior and eliminates chat session overhead
      if (history.length === 0) {
        result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: input.userMessage }] }]
        });
      } else {
        // Use chat API when we have history
        const chat = model.startChat({
          history: history
        });
        result = await chat.sendMessage(input.userMessage);
      }

      const response = result.response;

      // Check for function call
      const candidates = response.candidates || [];
      if (candidates.length > 0 && candidates[0].content?.parts) {
        for (const part of candidates[0].content.parts) {
          if (part.functionCall) {
            return {
              functionCall: {
                name: part.functionCall.name,
                args: part.functionCall.args as Record<string, any>
              }
            };
          }
        }
      }

      // No function call, return text
      return {
        text: response.text?.() || ''
      };
    } catch (error: any) {
      console.error('Gemini chat API error', { error: error.message });

      // Handle rate limits
      if (error.message?.includes('quota') || error.message?.includes('rate limit')) {
        console.warn('Gemini rate limit hit, waiting and retrying...');
        await this.sleep(10000);
        return await this.generateChatResponse(input); // Retry once
      }

      throw new Error(`Gemini chat API error: ${error.message}`);
    }
  }

  /**
   * Convert conversation history to Gemini format
   */
  private convertToGeminiHistory(history: Array<{
    role: 'user' | 'model';
    content: string;
  }>): Array<{
    role: string;
    parts: Array<{ text: string }>;
  }> {
    return history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.content }]
    }));
  }

  /**
   * Generate response with function calling
   */
  private async generateWithFunctions(
    prompt: string,
    functions: GeminiFunction[]
  ): Promise<GenerateResponseOutput> {
    if (!this.genAI) {
      throw new Error('Gemini not initialized');
    }

    // Convert to Gemini function declarations
    const functionDeclarations: FunctionDeclaration[] = functions.map(fn => ({
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters
    }));

    // Create model with functions
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      tools: [{ functionDeclarations }]
    });

    // Generate content
    const result = await model.generateContent(prompt);
    const response = result.response;

    // Check if Gemini wants to call a function
    const candidates = response.candidates || [];
    if (candidates.length > 0 && candidates[0].content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.functionCall) {
          return {
            functionCall: {
              name: part.functionCall.name,
              args: part.functionCall.args as Record<string, any>
            }
          };
        }
      }
    }

    // No function call, return text
    return {
      text: response.text?.() || ''
    };
  }

  /**
   * Send function result back to Gemini for final response
   */
  async generateFinalResponse(
    originalPrompt: string,
    functionName: string,
    functionResult: any,
    modelOverride?: string
  ): Promise<string> {
    await this.initialize();

    if (!this.genAI) {
      throw new Error('Gemini not initialized');
    }

    try {
      // Use override model if provided, otherwise use default
      const modelToUse = modelOverride || this.modelName;

      if (modelOverride) {
        console.log(JSON.stringify({
          severity: 'DEBUG',
          message: 'Using model override for final response',
          defaultModel: this.modelName,
          overrideModel: modelToUse
        }));
      }

      // Get the appropriate model instance
      const model = this.genAI.getGenerativeModel({ model: modelToUse });

      // Create chat with function result
      const chat = model.startChat({
        history: [
          {
            role: 'user',
            parts: [{ text: originalPrompt }]
          },
          {
            role: 'model',
            parts: [{
              functionCall: {
                name: functionName,
                args: {}
              }
            }]
          },
          {
            role: 'function',
            parts: [{
              functionResponse: {
                name: functionName,
                response: functionResult
              }
            }]
          }
        ]
      });

      const result = await chat.sendMessage('');
      return result.response.text();
    } catch (error: any) {
      console.error('Failed to generate final response', { error: error.message });
      throw new Error('Failed to generate final response from Gemini');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
