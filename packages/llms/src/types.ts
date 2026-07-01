/**
 * Core types for LLM integration
 * LLM 集成的核心类型
 */
import type * as z from 'zod/v4'

/**
 * Message format - OpenAI standard (industry standard)
 * 消息格式 - OpenAI 标准（行业标准）
 */
export interface Message {
	role: 'system' | 'user' | 'assistant' | 'tool'
	content?: string | null
	tool_calls?: {
		id: string
		type: 'function'
		function: {
			name: string
			arguments: string // JSON string
		}
	}[]
	tool_call_id?: string
	name?: string
}

/**
 * Tool definition - uses Zod schema (LLM-agnostic)
 * 工具定义 - 使用 Zod 模式（与 LLM 无关）
 * Supports generics for type-safe parameters and return values
 * 支持泛型以实现类型安全的参数和返回值
 */
export interface Tool<TParams = any, TResult = any> {
	// name: string
	description?: string
	inputSchema: z.ZodType<TParams>
	execute: (args: TParams) => Promise<TResult>
}

/**
 * Invoke options for LLM call
 * LLM 调用的调用选项
 */
export interface InvokeOptions {
	/**
	 * Force LLM to call a specific tool by name.
	 * 强制 LLM 按名称调用特定工具。
	 * If provided: tool_choice = { type: 'function', function: { name: toolChoiceName } }
	 * 如果提供：tool_choice = { type: 'function', function: { name: toolChoiceName } }
	 * If not provided: tool_choice = 'required' (must call some tool, but model chooses which)
	 * 如果未提供：tool_choice = 'required'（必须调用某个工具，但模型选择调用哪个）
	 */
	toolChoiceName?: string
	/**
	 * Response normalization function.
	 * 响应规范化函数。
	 * Called before parsing the response.
	 * 在解析响应之前调用。
	 * Used to fix various response format errors from the model.
	 * 用于修复模型的各种响应格式错误。
	 */
	normalizeResponse?: (response: any) => any
}

/**
 * LLM Client interface
 * LLM 客户端接口
 * Note: Does not use generics because each tool in the tools array has different types
 * 注意：不使用泛型，因为 tools 数组中的每个工具具有不同的类型
 */
export interface LLMClient {
	invoke(
		messages: Message[],
		tools: Record<string, Tool>,
		abortSignal?: AbortSignal,
		options?: InvokeOptions
	): Promise<InvokeResult>
}

/**
 * Invoke result (strict typing, supports generics)
 * 调用结果（严格类型，支持泛型）
 */
export interface InvokeResult<TResult = unknown> {
	toolCall: {
		// id?: string // OpenAI's tool_call_id
		name: string
		args: any
	}
	toolResult: TResult // Supports generics, but defaults to unknown
	// 支持泛型，但默认为 unknown
	usage: {
		promptTokens: number
		completionTokens: number
		totalTokens: number
		cachedTokens?: number // Prompt cache hits
		// 提示缓存命中
		reasoningTokens?: number // OpenAI o1 series reasoning tokens
		// OpenAI o1 系列推理令牌
	}
	rawResponse?: unknown // Raw response for debugging
	// 原始响应，用于调试
	rawRequest?: unknown // Raw request for debugging
	// 原始请求，用于调试
}

/**
 * LLM configuration
 * LLM 配置
 */
export interface LLMConfig {
	baseURL: string
	model: string
	apiKey?: string

	temperature?: number
	maxRetries?: number

	/**
	 * Transform the final request body before sending it to the provider.
	 * 在将最终请求体发送给提供商之前进行转换。
	 * Use this to implement provider-specific request tweaks such as caching hints or custom flags.
	 * 使用此函数实现特定提供商的请求调整，如缓存提示或自定义标志。
	 *
	 * Return a new object, or mutate the input object and return undefined.
	 * 返回一个新对象，或修改输入对象并返回 undefined。
	 */
	transformRequestBody?: (
		requestBody: Record<string, unknown>
	) => Record<string, unknown> | undefined

	/**
	 * remove the tool_choice field from the request.
	 * 从请求中移除 tool_choice 字段。
	 * @note fix "Invalid tool_choice type: 'object'" for some LLMs.
	 * @note 修复某些 LLM 的 "Invalid tool_choice type: 'object'" 问题。
	 */
	disableNamedToolChoice?: boolean

	/**
	 * Custom fetch function for LLM API requests.
	 * 用于 LLM API 请求的自定义 fetch 函数。
	 * Use this to customize headers, credentials, proxy, etc.
	 * 使用此函数自定义 headers、credentials、代理等。
	 * The response should follow OpenAI API format.
	 * 响应应遵循 OpenAI API 格式。
	 */
	customFetch?: typeof globalThis.fetch
}