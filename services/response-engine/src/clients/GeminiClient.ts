import { VertexAI, GenerativeModel, FunctionDeclaration } from '@google-cloud/vertexai';

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
 * GeminiClient - Interface to Vertex AI Gemini API
 *
 * Handles:
 * - Connecting to Vertex AI in us-central1 region (co-located with Cloud Run & BigQuery)
 * - Generating responses with Gemini models
 * - Function calling for analytics tool execution
 * - Retry with backoff on rate limits
 *
 * REGIONAL OPTIMIZATION:
 * Uses Vertex AI with explicit location=us-central1 to ensure all API calls
 * stay in the same region as Cloud Run and BigQuery, eliminating cross-region latency.
 */
export class GeminiClient {
  private vertexAI: VertexAI;
  private model: GenerativeModel | null = null;
  private readonly location = 'us-central1';  // Co-located with Cloud Run & BigQuery

  constructor(
    private projectId: string,
    private geminiSecretName: string,  // Kept for backwards compatibility but not used
    private modelName: string = 'gemini-2.5-pro'
  ) {
    // Initialize Vertex AI with regional endpoint
    this.vertexAI = new VertexAI({
      project: this.projectId,
      location: this.location
    });

    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'VertexAI client initialized',
      project: this.projectId,
      location: this.location,
      defaultModel: this.modelName
    }));
  }

  /**
   * Initialize the Gemini client
   * With Vertex AI, this uses Application Default Credentials (no API key needed)
   */
  async initialize(): Promise<void> {
    if (this.model) {
      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'GeminiClient already initialized, skipping'
      }));
      return;
    }

    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'Initializing Vertex AI Gemini model',
      model: this.modelName,
      location: this.location
    }));

    try {
      this.model = this.vertexAI.getGenerativeModel({
        model: this.modelName
      });

      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'Vertex AI Gemini model initialized',
        authentication: 'Application Default Credentials',
        location: this.location
      }));
    } catch (error: any) {
      console.error('Failed to initialize Vertex AI Gemini', {
        error: error.message,
        location: this.location
      });
      throw new Error('Failed to initialize Vertex AI Gemini');
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
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

      return { text };
    } catch (error: any) {
      console.error('Vertex AI Gemini API error', { error: error.message });

      // Check for rate limit
      if (error.message?.includes('quota') || error.message?.includes('rate limit')) {
        console.warn('Gemini rate limit hit, waiting and retrying...');
        await this.sleep(10000); // Wait 10 seconds
        return await this.generateResponse(input); // Retry once
      }

      throw new Error(`Vertex AI Gemini API error: ${error.message}`);
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
      message: 'Vertex AI initialization completed',
      durationMs: initDuration,
      location: this.location
    }));

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
      const model = this.vertexAI.getGenerativeModel(modelConfig);
      const modelDuration = Date.now() - modelStart;

      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Generative model created',
        durationMs: modelDuration,
        location: this.location
      }));

      let result;

      // Optimization: Use direct generateContent() when history is empty (faster)
      const apiCallStart = Date.now();
      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Starting Vertex AI API call',
        model: modelToUse,
        hasHistory: history.length > 0,
        functionCount: functionDeclarations.length,
        messageLength: input.userMessage.length,
        location: this.location
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
        message: 'Vertex AI API call completed',
        model: modelToUse,
        durationMs: apiCallDuration,
        hasHistory: history.length > 0,
        location: this.location
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

      const text = candidates[0]?.content?.parts?.[0]?.text || '';
      return { text };
    } catch (error: any) {
      console.error('Vertex AI chat API error', { error: error.message });

      // Handle rate limits
      if (error.message?.includes('quota') || error.message?.includes('rate limit')) {
        console.warn('Gemini rate limit hit, waiting and retrying...');
        await this.sleep(10000);
        return await this.generateChatResponse(input, modelOverride); // Retry once
      }

      throw new Error(`Vertex AI chat API error: ${error.message}`);
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
    // Convert to Gemini function declarations
    const functionDeclarations: FunctionDeclaration[] = functions.map(fn => ({
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters
    }));

    // Create model with functions
    const model = this.vertexAI.getGenerativeModel({
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
    const text = candidates[0]?.content?.parts?.[0]?.text || '';
    return { text };
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
      const model = this.vertexAI.getGenerativeModel({ model: modelToUse });

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
      const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return text;
    } catch (error: any) {
      console.error('Failed to generate final response', { error: error.message });
      throw new Error('Failed to generate final response from Vertex AI Gemini');
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
      durationMs: initDuration,
      location: this.location
    }));

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
      const model = this.vertexAI.getGenerativeModel(modelConfig);
      const chat = model.startChat({
        history: history
      });
      const modelDuration = Date.now() - modelStart;

      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Chat session started with AUTO mode',
        durationMs: modelDuration,
        location: this.location
      }));

      // Step 1: Send user message (Gemini will decide whether to call function or generate text)
      const apiCall1Start = Date.now();
      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Sending initial message (AUTO mode - Gemini chooses function or text)',
        messageLength: input.userMessage.length,
        location: this.location
      }));

      const result1 = await chat.sendMessage(input.userMessage);
      const apiCall1Duration = Date.now() - apiCall1Start;

      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'Initial response received',
        model: modelToUse,
        durationMs: apiCall1Duration,
        location: this.location
      }));

      // Check for function call
      const response1 = result1.response;
      const candidates = response1.candidates || [];

      if (candidates.length === 0 || !candidates[0].content?.parts) {
        // No function call, return text response
        const text = candidates[0]?.content?.parts?.[0]?.text || 'I\'m not sure how to help with that.';
        return { responseText: text };
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
        const text = candidates[0]?.content?.parts?.[0]?.text || 'I\'m not sure how to help with that.';
        return { responseText: text };
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

      // Log function result details
      const resultSize = JSON.stringify(functionResult).length;
      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Function executed',
        functionName: functionCall.name,
        durationMs: toolExecutionMs,
        resultSize,
        resultType: typeof functionResult,
        resultKeys: typeof functionResult === 'object' && functionResult ? Object.keys(functionResult) : []
      }));

      // Step 3: Send function result back to chat and handle multiple function call rounds
      let currentResult = await chat.sendMessage([{
        functionResponse: {
          name: functionCall.name,
          response: functionResult
        }
      }]);

      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Received response after sending functionResponse',
        hasCandidates: !!(currentResult.response.candidates && currentResult.response.candidates.length > 0)
      }));

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
          let responseText = candidates[0]?.content?.parts?.[0]?.text || '';

          // Log response details
          const logData: any = {
            severity: responseText.length === 0 ? 'WARNING' : 'INFO',
            message: 'Final text response received',
            rounds: roundCount,
            textLength: responseText.length,
            responsePreview: responseText.substring(0, 200) // First 200 chars for debugging
          };

          // WORKAROUND: If empty response but we have function result, retry with explicit prompt
          if (responseText.length === 0 && functionResult) {
            console.log(JSON.stringify({
              ...logData,
              message: 'Empty response detected, falling back to new chat session with fake history'
            }));

            try {
              // FALLBACK: Create a NEW chat session with functionResponse in history
              const fallbackModel = this.vertexAI.getGenerativeModel({
                model: modelToUse,
                systemInstruction: input.systemInstruction,
                generationConfig: {
                  temperature: 1,
                  topP: 0.95
                }
              });

              const fallbackChat = fallbackModel.startChat({
                history: [
                  {
                    role: 'user',
                    parts: [{ text: input.userMessage }]
                  },
                  {
                    role: 'model',
                    parts: [{
                      functionCall: {
                        name: functionCall.name,
                        args: functionCall.args
                      }
                    }]
                  },
                  {
                    role: 'function',
                    parts: [{
                      functionResponse: {
                        name: functionCall.name,
                        response: functionResult
                      }
                    }]
                  }
                ]
              });

              // Ask for response in new session
              const fallbackResult = await fallbackChat.sendMessage(
                'Please provide a natural language response based on this data.'
              );
              responseText = fallbackResult.response.candidates?.[0]?.content?.parts?.[0]?.text || '';

              console.log(JSON.stringify({
                severity: responseText.length > 0 ? 'INFO' : 'WARNING',
                message: 'Fallback response received',
                fallbackTextLength: responseText.length,
                fallbackSuccessful: responseText.length > 0
              }));
            } catch (fallbackError: any) {
              console.log(JSON.stringify({
                severity: 'ERROR',
                message: 'Fallback failed',
                error: fallbackError.message
              }));
            }
          }

          console.log(JSON.stringify(logData));

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

        const nextResultSize = JSON.stringify(nextFunctionResult).length;
        console.log(JSON.stringify({
          severity: 'DEBUG',
          message: 'Additional function executed',
          functionName: nextFunctionCall.name,
          durationMs: nextToolDuration,
          resultSize: nextResultSize
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
      console.error('Vertex AI continuous chat error', { error: error.message });

      // Check for rate limit
      if (error.message?.includes('quota') || error.message?.includes('rate limit')) {
        console.warn('Gemini rate limit hit, waiting and retrying...');
        await this.sleep(10000);
        return await this.generateWithFunctionCalling(input, executeFunction, modelOverride);
      }

      throw new Error(`Vertex AI continuous chat error: ${error.message}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
