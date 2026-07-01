// ======= type guards =======
// ======= 类型守卫 =======
// @note instanceof fails for elements inside iframes
// @注意 对于 iframe 内的元素，instanceof 会失效

export function isHTMLElement(el: unknown): el is HTMLElement {
	// @todo either specify to HTMLElement or allow Element here.
	// @todo 此处要么明确指定为 HTMLElement，要么允许 Element。
	return !!el && (el as Node).nodeType === 1
}

export function isInputElement(el: Element): el is HTMLInputElement {
	return el?.nodeType === 1 && el.tagName === 'INPUT'
}

export function isTextAreaElement(el: Element): el is HTMLTextAreaElement {
	return el?.nodeType === 1 && el.tagName === 'TEXTAREA'
}

export function isSelectElement(el: Element): el is HTMLSelectElement {
	return el?.nodeType === 1 && el.tagName === 'SELECT'
}

export function isAnchorElement(el: Element): el is HTMLAnchorElement {
	return el?.nodeType === 1 && el.tagName === 'A'
}

// ======= iframe helpers =======
// ======= iframe 辅助函数 =======

/** Iframe offset for translating element coordinates to top-frame viewport. */
/** 用于将元素坐标转换到顶层视口的 iframe 偏移量。 */
export function getIframeOffset(element: HTMLElement): { x: number; y: number } {
	const frame = element.ownerDocument.defaultView?.frameElement as HTMLElement | null
	if (!frame) return { x: 0, y: 0 }
	const rect = frame.getBoundingClientRect()
	return { x: rect.left, y: rect.top }
}

/**
 * Get native value setter from the element's own prototype (iframe-safe).
 * 从元素自身的原型获取原生值设置器（iframe 安全）。
 * @note for React
 * @注意 用于 React
 */
export function getNativeValueSetter(element: HTMLInputElement | HTMLTextAreaElement) {
	// eslint-disable-next-line @typescript-eslint/unbound-method
	return Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element) as object, 'value')!
		.set as (v: string) => void
}

// ======= general utils =======
// ======= 通用工具函数 =======

export async function waitFor(seconds: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
}

// ======= mask events =======
// ======= 遮罩事件 =======

/**
 * Move the visual pointer to a position within an element.
 * 将视觉指针移动到元素内的指定位置。
 * @param x - x coordinate in the element's document viewport
 * @param x - 元素文档视口中的 x 坐标
 * @param y - y coordinate in the element's document viewport
 * @param y - 元素文档视口中的 y 坐标
 */
export async function movePointerToElement(element: HTMLElement, x: number, y: number) {
	const offset = getIframeOffset(element)

	window.dispatchEvent(
		new CustomEvent('PageAgent::MovePointerTo', {
			detail: { x: x + offset.x, y: y + offset.y },
		})
	)

	await waitFor(0.3)
}

export async function clickPointer() {
	window.dispatchEvent(new CustomEvent('PageAgent::ClickPointer'))
}

export async function enablePassThrough() {
	window.dispatchEvent(new CustomEvent('PageAgent::EnablePassThrough'))
}

export async function disablePassThrough() {
	window.dispatchEvent(new CustomEvent('PageAgent::DisablePassThrough'))
}