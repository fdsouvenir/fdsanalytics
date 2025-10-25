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
      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'GeminiClient already initialized, skipping'
      }));
      return; // Already initialized
    }

    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'GeminiClient not initialized, loading from Secret Manager'
    }));

    try {
      const loadStart = Date.now();
      this.apiKey = await this.loadApiKey();
      const loadDuration = Date.now() - loadStart;

      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'API key loaded from Secret Manager',
        durationMs: loadDuration
      }));

      this.genAI = new GoogleGenerativeAI(this.apiKey);
      this.model = this.genAI.getGenerativeModel({ model: this.modelName });

      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'GeminiClient initialization complete'
      }));
    } catch (error: any) {
      console.error('Failed to initialize GeminiClient', { error: error.message });
      throw new Error('Failed to initialize Gemini API');
    }
  }

  /**
   * Load Gemini API key from environment variable or Secret Manager
   * Prioritizes environment variable for faster startup (0ms vs 50s)
   */
  private async loadApiKey(): Promise<string> {
    // Check for environment variable first (fast path)
    const envApiKey = process.env.GEMINI_API_KEY;
    if (envApiKey) {
      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'API key loaded from environment variable'
      }));
      return envApiKey;
    }

    // Fall back to Secret Manager (slow path - 50s)
    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'No GEMINI_API_KEY env var, falling back to Secret Manager'
    }));

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
    const initStart = Date.now();
    await this.initialize();
    const initDuration = Date.now() - initStart;

    console.log(JSON.stringify({
      severity: 'DEBUG',
      message: 'Gemini initialization completed',
      durationMs: initDuration
    }));

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

      const prepStart = Date.now();
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

      const prepDuration = Date.now() - prepStart;
      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Function declarations prepared',
        durationMs: prepDuration,
        functionCount: functionDeclarations.length
      }));

      const modelStart = Date.now();
      const model = this.genAI.getGenerativeModel(modelConfig);
      const modelDuration = Date.now() - modelStart;

      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Generative model created',
        durationMs: modelDuration
      }));

      let result;

      // Optimization: Use direct generateContent() when history is empty (faster)
      // This matches AI Studio behavior and eliminates chat session overhead
      const apiCallStart = Date.now();
      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Starting Gemini API call',
        model: modelToUse,
        hasHistory: history.length > 0,
        functionCount: functionDeclarations.length,
        messageLength: input.userMessage.length
      }));

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

      const apiCallDuration = Date.now() - apiCallStart;
      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'Gemini API call completed',
        model: modelToUse,
        durationMs: apiCallDuration,
        hasHistory: history.length > 0
      }));

      const parseStart = Date.now();
      const response = result.response;

      // Check for function call
      const candidates = response.candidates || [];
      if (candidates.length > 0 && candidates[0].content?.parts) {
        for (const part of candidates[0].content.parts) {
          if (part.functionCall) {
            const parseDuration = Date.now() - parseStart;
            console.log(JSON.stringify({
              severity: 'DEBUG',
              message: 'Response parsed (function call found)',
              durationMs: parseDuration
            }));

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
      const parseDuration = Date.now() - parseStart;
      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Response parsed (text response)',
        durationMs: parseDuration
      }));

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
    functionArgs: Record<string, any>,
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
                args: functionArgs
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

  /**
   * Generate response with function calling in ONE continuous chat session
   * This eliminates the "fake history" overhead of two separate API calls
   */
  async generateWithFunctionCalling(
    input: GenerateChatResponseInput,
    executeFunction: (name: string, args: Record<string, any>) => Promise<any>,
    modelOverride?: string
  ): Promise<{
    functionCall?: { name: string; args: Record<string, any> };
    functionResult?: any;
    responseText: string;
    toolExecutionMs?: number;
  }> {
    const initStart = Date.now();
    await this.initialize();
    const initDuration = Date.now() - initStart;

    console.log(JSON.stringify({
      severity: 'DEBUG',
      message: 'Starting continuous chat session',
      durationMs: initDuration
    }));

    if (!this.genAI) {
      throw new Error('Gemini not initialized');
    }

    try {
      // Use override model if provided, otherwise use default
      const modelToUse = modelOverride || this.modelName;

      if (modelOverride) {
        console.log(JSON.stringify({
          severity: 'DEBUG',
          message: 'Using model override for continuous chat',
          defaultModel: this.modelName,
          overrideModel: modelToUse
        }));
      }

      const prepStart = Date.now();
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
        // Use AUTO mode (default) - let Gemini decide when to call functions vs generate text
        // This is more reliable than forcing mode: 'ANY' which can cause infinite loops
      }

      const prepDuration = Date.now() - prepStart;
      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Continuous chat prepared',
        durationMs: prepDuration,
        functionCount: functionDeclarations.length
      }));

      // Start chat session with AUTO mode (no toolConfig = Gemini decides)
      const modelStart = Date.now();
      const model = this.genAI.getGenerativeModel(modelConfig);
      const chat = model.startChat({
        history: history
      });
      const modelDuration = Date.now() - modelStart;

      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Chat session started with AUTO mode',
        durationMs: modelDuration
      }));

      // Step 1: Send user message (Gemini will decide whether to call function or generate text)
      const apiCall1Start = Date.now();
      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Sending initial message (AUTO mode - Gemini chooses function or text)',
        messageLength: input.userMessage.length
      }));

      const result1 = await chat.sendMessage(input.userMessage);
      const apiCall1Duration = Date.now() - apiCall1Start;

      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'Initial response received',
        model: modelToUse,
        durationMs: apiCall1Duration
      }));

      // Check for function call
      const response1 = result1.response;
      const candidates = response1.candidates || [];

      if (candidates.length === 0 || !candidates[0].content?.parts) {
        // No function call, return text response
        return {
          responseText: response1.text() || 'I\'m not sure how to help with that.'
        };
      }

      let functionCall: { name: string; args: Record<string, any> } | undefined;

      for (const part of candidates[0].content.parts) {
        if (part.functionCall) {
          functionCall = {
            name: part.functionCall.name,
            args: part.functionCall.args as Record<string, any>
          };
          break;
        }
      }

      if (!functionCall) {
        // No function call, return text
        return {
          responseText: response1.text() || 'I\'m not sure how to help with that.'
        };
      }

      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Function call extracted',
        functionName: functionCall.name,
        args: functionCall.args
      }));

      // Step 2: Execute function
      const toolStart = Date.now();
      const functionResult = await executeFunction(functionCall.name, functionCall.args);
      const toolExecutionMs = Date.now() - toolStart;

      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Function executed',
        functionName: functionCall.name,
        durationMs: toolExecutionMs
      }));

      // Step 3: Send function result back to chat and handle multiple function call rounds
      // Gemini may call the function multiple times before generating text (like in AI Studio)
      let currentResult = await chat.sendMessage([{
        functionResponse: {
          name: functionCall.name,
          response: functionResult
        }
      }]);

      let roundCount = 1;
      const maxRounds = 3;  // Prevent infinite loops

      // Keep handling function calls until Gemini returns text
      while (roundCount < maxRounds) {
        const response = currentResult.response;
        const candidates = response.candidates || [];

        // Check if Gemini returned another function call
        let nextFunctionCall: { name: string; args: Record<string, any> } | undefined;

        if (candidates.length > 0 && candidates[0].content?.parts) {
          for (const part of candidates[0].content.parts) {
            if (part.functionCall) {
              nextFunctionCall = {
                name: part.functionCall.name,
                args: part.functionCall.args as Record<string, any>
              };
              break;
            }
          }
        }

        if (!nextFunctionCall) {
          // No more function calls, we got text!
          const responseText = response.text() || '';

          console.log(JSON.stringify({
            severity: 'INFO',
            message: 'Final text response received',
            rounds: roundCount,
            textLength: responseText.length
          }));

          return {
            functionCall,
            functionResult,
            responseText,
            toolExecutionMs
          };
        }

        // Gemini wants to call another function
        console.log(JSON.stringify({
          severity: 'INFO',
          message: 'Gemini requested another function call',
          round: roundCount + 1,
          functionName: nextFunctionCall.name
        }));

        // Execute the next function
        const nextToolStart = Date.now();
        const nextFunctionResult = await executeFunction(nextFunctionCall.name, nextFunctionCall.args);
        const nextToolDuration = Date.now() - nextToolStart;

        console.log(JSON.stringify({
          severity: 'DEBUG',
          message: 'Additional function executed',
          functionName: nextFunctionCall.name,
          durationMs: nextToolDuration
        }));

        // Send the next function result
        currentResult = await chat.sendMessage([{
          functionResponse: {
            name: nextFunctionCall.name,
            response: nextFunctionResult
          }
        }]);

        roundCount++;
      }

      // Reached max rounds without getting text
      console.warn('Reached maximum function call rounds without text response');
      return {
        functionCall,
        functionResult,
        responseText: 'I analyzed the data but encountered an issue generating the final response. Please try rephrasing your question.',
        toolExecutionMs
      };
    } catch (error: any) {
      console.error('Continuous chat API error', { error: error.message });

      // Check for rate limit
      if (error.message?.includes('quota') || error.message?.includes('rate limit')) {
        console.warn('Gemini rate limit hit, waiting and retrying...');
        await this.sleep(10000);
        return await this.generateWithFunctionCalling(input, executeFunction, modelOverride);
      }

      throw new Error(`Gemini continuous chat error: ${error.message}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
