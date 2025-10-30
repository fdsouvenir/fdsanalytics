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
          topP: 0.95,
          thinkingConfig: {
            thinkingBudget: 1024,
            includeThoughts: true
          }
        }
      };

      if (functionDeclarations.length > 0) {
        modelConfig.tools = [{ functionDeclarations }];
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

      // No function call, extract thinking and return text
      const { thinkingSummaries, answerText } = this.extractThinkingAndAnswer(candidates);

      const parseDuration = Date.now() - parseStart;

      // Log thinking summaries for test analysis
      if (thinkingSummaries.length > 0) {
        console.log(JSON.stringify({
          severity: 'DEBUG',
          message: 'Gemini thinking summary captured',
          thinkingCount: thinkingSummaries.length,
          thinkingPreview: thinkingSummaries[0].substring(0, 200),
          thoughtsTokenCount: (response.usageMetadata as any)?.thoughtsTokenCount || 0
        }));
      }

      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Response parsed (text response)',
        durationMs: parseDuration,
        hasThinking: thinkingSummaries.length > 0
      }));

      return { text: answerText };
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
   * Hybrid stateless-then-stateful approach with function calling
   * Step 1: Force function call with mode: 'ANY' (stateless)
   * Step 2: Execute function
   * Step 3: Get final text response with new chat session (stateful, mode: AUTO)
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
      message: 'Starting hybrid function calling approach',
      durationMs: initDuration,
      location: this.location
    }));

    try {
      const modelToUse = modelOverride || this.modelName;

      if (modelOverride) {
        console.log(JSON.stringify({
          severity: 'DEBUG',
          message: 'Using model override for hybrid function calling',
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

      const prepDuration = Date.now() - prepStart;
      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Hybrid function calling prepared',
        durationMs: prepDuration,
        functionCount: functionDeclarations.length
      }));

      // ============================================================
      // STEP 1: Force function call with mode: 'ANY' (stateless)
      // ============================================================

      // Manually construct contents for stateless call
      const contents: any[] = [
        ...history,
        { role: 'user', parts: [{ text: input.userMessage }] }
      ];

      // Create model config with mode: 'ANY' to force function call
      const modelConfigWithAny: any = {
        model: modelToUse,
        systemInstruction: {
          parts: [{ text: input.systemInstruction }]
        },
        generationConfig: {
          temperature: 1,
          topP: 0.95,
          thinkingConfig: {
            thinkingBudget: 1024,
            includeThoughts: true
          }
        }
      };

      if (functionDeclarations.length > 0) {
        modelConfigWithAny.tools = [{ functionDeclarations }];
        modelConfigWithAny.toolConfig = {
          functionCallingConfig: {
            mode: 'ANY'  // Force function call on this turn only
          }
        };
      }

      const modelForFirstCall = this.vertexAI.getGenerativeModel(modelConfigWithAny);

      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Sending stateless call with mode: ANY to force function call',
        messageLength: input.userMessage.length,
        location: this.location
      }));

      const apiCall1Start = Date.now();
      const result1 = await modelForFirstCall.generateContent({
        contents: contents
      });
      const apiCall1Duration = Date.now() - apiCall1Start;

      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'Stateless function call received',
        model: modelToUse,
        durationMs: apiCall1Duration,
        location: this.location
      }));

      // Extract function calls from response
      const response1 = result1.response;
      const candidates1 = response1.candidates || [];

      if (candidates1.length === 0 || !candidates1[0].content?.parts) {
        throw new Error('No function call received despite mode: ANY');
      }

      // Extract ALL function calls (support parallel function calling)
      const functionCalls: Array<{ name: string; args: Record<string, any> }> = [];
      const functionCallParts: any[] = [];

      for (const part of candidates1[0].content.parts) {
        if (part.functionCall) {
          functionCalls.push({
            name: part.functionCall.name,
            args: part.functionCall.args as Record<string, any>
          });
          functionCallParts.push(part);  // Save original parts for history
        }
      }

      if (functionCalls.length === 0) {
        throw new Error('No function call found in response despite mode: ANY');
      }

      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Function calls extracted from stateless call',
        count: functionCalls.length,
        functions: functionCalls.map(fc => fc.name)
      }));

      // ============================================================
      // STEP 2: Execute ALL functions
      // ============================================================

      const toolStart = Date.now();
      const functionResults: Array<{ name: string; result: any }> = [];

      for (const fc of functionCalls) {
        const result = await executeFunction(fc.name, fc.args);
        functionResults.push({ name: fc.name, result });

        const resultSize = JSON.stringify(result).length;
        console.log(JSON.stringify({
          severity: 'DEBUG',
          message: 'Function executed',
          functionName: fc.name,
          resultSize,
          resultType: typeof result,
          resultKeys: typeof result === 'object' && result ? Object.keys(result) : []
        }));
      }

      const toolExecutionMs = Date.now() - toolStart;

      // ============================================================
      // STEP 3: Get final text response with new chat session (stateful, mode: AUTO)
      // ============================================================

      // Manually construct history for final response call
      const historyForFinalResponse = [
        ...history,
        { role: 'user', parts: [{ text: input.userMessage }] },
        { role: 'model', parts: functionCallParts }  // Model's function call(s)
      ];

      // Create model config WITHOUT mode: ANY (defaults to AUTO)
      const modelConfigForFinal: any = {
        model: modelToUse,
        systemInstruction: {
          parts: [{ text: input.systemInstruction }]
        },
        generationConfig: {
          temperature: 1,
          topP: 0.95,
          thinkingConfig: {
            thinkingBudget: 1024,
            includeThoughts: true
          }
        }
      };

      if (functionDeclarations.length > 0) {
        modelConfigForFinal.tools = [{ functionDeclarations }];
        // NO toolConfig = defaults to mode: AUTO
      }

      const modelForFinalResponse = this.vertexAI.getGenerativeModel(modelConfigForFinal);
      const chatForFinalResponse = modelForFinalResponse.startChat({
        history: historyForFinalResponse
      });

      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Starting new chat session for final response (mode: AUTO)',
        location: this.location
      }));

      // Send function results to get final text
      const functionResponseParts = functionResults.map(fr => ({
        functionResponse: {
          name: fr.name,
          response: fr.result
        }
      }));

      const apiCall2Start = Date.now();
      const result2 = await chatForFinalResponse.sendMessage(functionResponseParts);
      const apiCall2Duration = Date.now() - apiCall2Start;

      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'Final response received',
        model: modelToUse,
        durationMs: apiCall2Duration,
        location: this.location
      }));

      // Extract thinking and answer from final response
      const response2 = result2.response;
      const candidates2 = response2.candidates || [];

      const { thinkingSummaries, answerText } = this.extractThinkingAndAnswer(candidates2);

      // Log thinking summaries for test analysis
      if (thinkingSummaries.length > 0) {
        console.log(JSON.stringify({
          severity: 'DEBUG',
          message: 'Gemini thinking summary captured (hybrid approach)',
          thinkingCount: thinkingSummaries.length,
          thinkingPreview: thinkingSummaries[0].substring(0, 200),
          thoughtsTokenCount: (response2.usageMetadata as any)?.thoughtsTokenCount || 0
        }));
      }

      // Log response details
      const logData: any = {
        severity: answerText.length === 0 ? 'WARNING' : 'INFO',
        message: 'Final text response received (hybrid approach)',
        textLength: answerText.length,
        responsePreview: answerText.substring(0, 200),
        hasThinking: thinkingSummaries.length > 0
      };

      console.log(JSON.stringify(logData));

      return {
        functionCall: functionCalls[0],
        functionResult: functionResults[0].result,
        responseText: answerText,
        toolExecutionMs
      };

    } catch (error: any) {
      console.error('Vertex AI hybrid function calling error', { error: error.message });

      // Check for rate limit
      if (error.message?.includes('quota') || error.message?.includes('rate limit')) {
        console.warn('Gemini rate limit hit, waiting and retrying...');
        await this.sleep(10000);
        return await this.generateWithFunctionCalling(input, executeFunction, modelOverride);
      }

      throw new Error(`Vertex AI hybrid function calling error: ${error.message}`);
    }
  }

  /**
   * Extract thinking summaries and final answer from response parts
   * With thinking mode enabled, response.candidates[0].content.parts contains:
   * - Parts with .thought property = thinking summaries (for logging)
   * - Parts without .thought = final answer (for users)
   */
  private extractThinkingAndAnswer(candidates: any[]): {
    thinkingSummaries: string[];
    answerText: string;
  } {
    const thinkingSummaries: string[] = [];
    const answerParts: string[] = [];

    if (candidates.length === 0 || !candidates[0].content?.parts) {
      return { thinkingSummaries, answerText: '' };
    }

    for (const part of candidates[0].content.parts) {
      if (part.thought) {
        // This part contains thinking summary
        if (part.text) {
          thinkingSummaries.push(part.text);
        }
      } else if (part.text) {
        // This part contains final answer
        answerParts.push(part.text);
      }
    }

    return {
      thinkingSummaries,
      answerText: answerParts.join('')
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
