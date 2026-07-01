/**
 * LLM module entry point
 * LLM 模块入口点
 */
import { OpenAIClient } from './OpenAIClient'
import { DEFAULT_TEMPERATURE, LLM_MAX_RETRIES } from './constants'
import { InvokeError, InvokeErrorTypes } from './errors'
import type { InvokeOptions, InvokeResult, LLMClient, LLMConfig, Message, Tool } from './types'

export { InvokeError, InvokeErrorTypes }
export type { InvokeOptions, InvokeResult, LLMClient, LLMConfig, Message, Tool }

/**
 * Parse and validate LLM configuration, filling in defaults.
 * 解析并验证 LLM 配置，填充默认值。
 */
export function parseLLMConfig(config: LLMConfig): Required<LLMConfig> {
	// Runtime validation as defensive programming (types already guarantee these)
	// 运行时验证作为防御性编程（类型已保证这些）
	if (!config.baseURL || !config.model) {
		throw new Error(
			'[PageAgent] LLM configuration required. Please provide: baseURL, model. ' +
				'See: https://alibaba.github.io/page-agent/docs/features/models'
		)
	}

	return {
		baseURL: config.baseURL,
		model: config.model,
		apiKey: config.apiKey || '',
		temperature: config.temperature ?? DEFAULT_TEMPERATURE,
		maxRetries: config.maxRetries ?? LLM_MAX_RETRIES,
		transformRequestBody: config.transformRequestBody ?? ((requestBody) => requestBody),
		disableNamedToolChoice: config.disableNamedToolChoice ?? false,
		customFetch: (config.customFetch ?? fetch).bind(globalThis), // fetch will be illegal unless bound
		// fetch 必须绑定，否则会非法
	}
}

/**
 * LLM class - main interface for invoking language models with tool support.
 * LLM 类——用于调用支持工具的语言模型的主接口。
 */
export class LLM extends EventTarget {
	config: Required<LLMConfig>
	client: LLMClient

	constructor(config: LLMConfig) {
		super()
		this.config = parseLLMConfig(config)

		// Default to OpenAI client
		// 默认使用 OpenAI 客户端
		this.client = new OpenAIClient(this.config)
	}

	/**
	 * - call llm api *once*
	 * - 调用 LLM API *一次*
	 * - invoke tool call *once*
	 * - 执行工具调用 *一次*
	 * - return the result of the tool
	 * - 返回工具执行的结果
	 */
	async invoke(
		messages: Message[],
		tools: Record<string, Tool>,
		abortSignal: AbortSignal,
		options?: InvokeOptions
	): Promise<InvokeResult> {
		return await withRetry(async () => this.client.invoke(messages, tools, abortSignal, options), {
			maxRetries: this.config.maxRetries,
			onRetry: (attempt, lastError) => {
				this.dispatchEvent(
					new CustomEvent('retry', {
						detail: { attempt, maxAttempts: this.config.maxRetries, lastError },
					})
				)
			},
		})
	}
}

/**
 * Retry a function until it succeeds or reaches the maximum number of retries.
 * 重试一个函数，直到成功或达到最大重试次数。
 */
async function withRetry<T>(
	fn: () => Promise<T>,
	settings: {
		maxRetries: number
		onRetry: (attempt: number, lastError: Error) => void
	}
): Promise<T> {
	let attempt = 0
	while (true) {
		try {
			return await fn()
		} catch (error: unknown) {
			if ((error as any)?.name === 'AbortError') throw error
			if (error instanceof InvokeError && !error.retryable) throw error
			attempt++
			if (attempt > settings.maxRetries) throw error

			console.debug('[LLM] retryable failure, will retry:', error)
			settings.onRetry(attempt, error as Error)

			await new Promise((resolve) => setTimeout(resolve, 100))
		}
	}
}