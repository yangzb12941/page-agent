import chalk from 'chalk'

export * from './autoFixer'

/**
 * Wait for `seconds`. If a `signal` is provided, the wait is cancellable:
 * aborting rejects with the signal's reason (an `AbortError`).
 * 等待 `seconds` 秒。如果提供了 `signal`，等待可取消：
 * 取消时使用信号的 reason（一个 `AbortError`）拒绝 Promise。
 */
export async function waitFor(seconds: number, signal?: AbortSignal): Promise<void> {
	if (!signal) {
		await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
		return
	}
	signal.throwIfAborted()
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			signal.removeEventListener('abort', onAbort)
			resolve()
		}, seconds * 1000)
		const onAbort = () => {
			clearTimeout(timer)
			// reason is a DOMException AbortError.
			// reason 是一个 DOMException AbortError。
			reject(signal.reason as DOMException)
		}
		signal.addEventListener('abort', onAbort, { once: true })
	})
}

//


export function truncate(text: string, maxLength: number): string {
	if (text.length > maxLength) {
		return text.substring(0, maxLength) + '...'
	}
	return text
}

//


export function randomID(existingIDs?: string[]): string {
	let id = Math.random().toString(36).substring(2, 11)

	if (!existingIDs) {
		return id
	}

	const MAX_TRY = 1000
	let tryCount = 0

	while (existingIDs.includes(id)) {
		id = Math.random().toString(36).substring(2, 11)
		tryCount++
		if (tryCount > MAX_TRY) {
			throw new Error('randomID: too many tries')
		}
	}

	return id
}

//
const _global = globalThis as any

if (!_global.__PAGE_AGENT_IDS__) {
	_global.__PAGE_AGENT_IDS__ = []
}

const ids = _global.__PAGE_AGENT_IDS__

/**
 * Generate a random ID.
 * 生成一个随机 ID。
 * @note Unique within this window.
 * @note 在当前窗口内唯一。
 */
export function uid() {
	const id = randomID(ids)
	ids.push(id)
	return id
}

const llmsTxtCache = new Map<string, string | null>()

/** Fetch /llms.txt for a URL's origin. Cached per origin, `null` = tried and not found. */
/** 获取 URL 来源的 /llms.txt。按来源缓存，`null` 表示尝试过但未找到。 */
export async function fetchLlmsTxt(url: string): Promise<string | null> {
	let origin: string
	try {
		origin = new URL(url).origin
	} catch {
		return null // Invalid URL
		// 无效 URL
	}
	// about:blank, data:, file:
	// about:blank, data:, file: 等
	if (origin === 'null') return null

	if (llmsTxtCache.has(origin)) return llmsTxtCache.get(origin)!

	const endpoint = `${origin}/llms.txt`
	let result: string | null = null
	try {
		console.log(chalk.gray(`[llms.txt] Fetching ${endpoint}`))
		const res = await fetch(endpoint, { signal: AbortSignal.timeout(3000) })
		if (res.ok) {
			result = await res.text()
			console.log(chalk.green(`[llms.txt] Found (${result.length} chars)`))
			if (result.length > 1000) {
				console.log(chalk.yellow(`[llms.txt] Truncating to 1000 chars`))
				result = truncate(result, 1000)
			}
		} else {
			console.debug(chalk.gray(`[llms.txt] ${res.status} for ${endpoint}`))
		}
	} catch (e) {
		console.debug(chalk.gray(`[llms.txt] not found for ${endpoint}`), e)
	}
	llmsTxtCache.set(origin, result)
	return result
}

/**
 * Simple assertion function that throws an error if the condition is falsy
 * 简单的断言函数，如果条件为假则抛出错误
 * @param condition - The condition to assert
 * @param condition - 要断言的条件
 * @param message - Optional error message
 * @param message - 可选的错误信息
 * @throws Error if condition is falsy
 * @throws 如果条件为假则抛出 Error
 */
export function assert(condition: unknown, message?: string, silent?: boolean): asserts condition {
	if (!condition) {
		const errorMessage = message ?? 'Assertion failed'

		if (!silent) console.error(chalk.red(`❌ assert: ${errorMessage}`))

		throw new Error(errorMessage)
	}
}

/**
 * Suppress errors from a function.
 * 抑制函数中的错误。
 */
export async function suppress<T>(fn: () => T | Promise<T>): Promise<Awaited<T> | undefined> {
	try {
		return await fn()
	} catch (error) {
		console.error(error)
		return undefined
	}
}