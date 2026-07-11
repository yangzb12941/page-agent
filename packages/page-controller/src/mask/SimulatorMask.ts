import { Motion } from 'ai-motion'

import { isPageDark } from './checkDarkMode'

import styles from './SimulatorMask.module.css'
import cursorStyles from './cursor.module.css'

/**
 * 主要功能模块如下：
 * 页面遮罩层 (Mask Wrapper)：
 * 在 document.body 中创建一个全屏的 div 容器，用于覆盖底层页面。
 * 添加 data-browser-use-ignore 属性，避免被浏览器自动捕获。添加 data-page-agent-ignore 等属性，避免被其他自动化脚本重复捕获。
 * 可选地集成 ai-motion 动画效果（支持深色/浅色模式）。
 * 拦截交互事件：通过 stopPropagation() 和 preventDefault() 阻止所有鼠标、滚轮和键盘事件传递给底层页面，确保模拟过程的独立性。
 *
 * 全局事件通信：
 * 通过监听自定义事件（如 PageAgent::MovePointerTo、PageAgent::ClickPointer 等）接收外部控制指令。
 * 支持动态切换穿透模式（pointerEvents = 'none' / 'auto'），在需要时允许事件穿透遮罩层与底层页面交互。
 *
 * AI 虚拟光标 (Cursor)：
 * 自定义游标由多个 CSS 层组成（边框、填充、点击涟漪效果）。
 * 平滑移动算法：使用 requestAnimationFrame 和缓动系数（0.2）实现光标从当前位置向目标位置的平滑过渡动画。
 * 提供 triggerClickAnimation() 方法触发点击时的视觉反馈动画。
 *
 * 生命周期与状态控制：
 * show()：显示遮罩层，启动动画，初始化光标位置。
 * hide()：隐藏遮罩层，停止动画并淡出。
 * dispose()：销毁实例，清理动画资源，移除 DOM 元素，并移除全局事件监听器。
 * 应用场景：通常配合 AI Agent 使用，当 AI 需要自动浏览或操作网页时，显示 AI 的“虚拟手”在页面上移动和点击，同时屏蔽用户的真实输入干扰。
 */
export class SimulatorMask extends EventTarget {
	shown: boolean = false
	wrapper = document.createElement('div')
	motion: Motion | null = null

	#disposed = false

	#cursor = document.createElement('div')

	#currentCursorX = 0
	#currentCursorY = 0

	#targetCursorX = 0
	#targetCursorY = 0

	constructor() {
		super()

		this.wrapper.id = 'page-agent-runtime_simulator-mask'
		this.wrapper.className = styles.wrapper
		this.wrapper.setAttribute('data-browser-use-ignore', 'true')
		this.wrapper.setAttribute('data-page-agent-ignore', 'true')

		try {
			const motion = new Motion({
				mode: isPageDark() ? 'dark' : 'light',
				styles: { position: 'absolute', inset: '0' },
			})
			this.motion = motion
			this.wrapper.appendChild(motion.element)
			motion.autoResize(this.wrapper)
		} catch (e) {
			console.warn('[SimulatorMask] Motion overlay unavailable:', e)
		}

		// Capture all mouse, keyboard, and wheel events
		this.wrapper.addEventListener('click', (e) => {
			e.stopPropagation()
			e.preventDefault()
		})
		this.wrapper.addEventListener('mousedown', (e) => {
			e.stopPropagation()
			e.preventDefault()
		})
		this.wrapper.addEventListener('mouseup', (e) => {
			e.stopPropagation()
			e.preventDefault()
		})
		this.wrapper.addEventListener('mousemove', (e) => {
			e.stopPropagation()
			e.preventDefault()
		})
		this.wrapper.addEventListener('wheel', (e) => {
			e.stopPropagation()
			e.preventDefault()
		})
		this.wrapper.addEventListener('keydown', (e) => {
			e.stopPropagation()
			e.preventDefault()
		})
		this.wrapper.addEventListener('keyup', (e) => {
			e.stopPropagation()
			e.preventDefault()
		})

		// Create AI cursor
		this.#createCursor()
		// this.show()

		document.body.appendChild(this.wrapper)

		this.#moveCursorToTarget()

		// global events
		// @note Mask should be isolated from the rest of the code.
		// Global events are easier to manage and cleanup.

		const movePointerToListener = (event: Event) => {
			const { x, y } = (event as CustomEvent).detail
			this.setCursorPosition(x, y)
		}
		const clickPointerListener = () => {
			this.triggerClickAnimation()
		}
		const enablePassThroughListener = () => {
			this.wrapper.style.pointerEvents = 'none'
		}
		const disablePassThroughListener = () => {
			this.wrapper.style.pointerEvents = 'auto'
		}

		window.addEventListener('PageAgent::MovePointerTo', movePointerToListener)
		window.addEventListener('PageAgent::ClickPointer', clickPointerListener)
		window.addEventListener('PageAgent::EnablePassThrough', enablePassThroughListener)
		window.addEventListener('PageAgent::DisablePassThrough', disablePassThroughListener)

		this.addEventListener('dispose', () => {
			window.removeEventListener('PageAgent::MovePointerTo', movePointerToListener)
			window.removeEventListener('PageAgent::ClickPointer', clickPointerListener)
			window.removeEventListener('PageAgent::EnablePassThrough', enablePassThroughListener)
			window.removeEventListener('PageAgent::DisablePassThrough', disablePassThroughListener)
		})
	}

	#createCursor() {
		this.#cursor.className = cursorStyles.cursor

		// Create ripple effect container
		const rippleContainer = document.createElement('div')
		rippleContainer.className = cursorStyles.cursorRipple
		this.#cursor.appendChild(rippleContainer)

		// Create filling layer
		const fillingLayer = document.createElement('div')
		fillingLayer.className = cursorStyles.cursorFilling
		this.#cursor.appendChild(fillingLayer)

		// Create border layer
		const borderLayer = document.createElement('div')
		borderLayer.className = cursorStyles.cursorBorder
		this.#cursor.appendChild(borderLayer)

		this.wrapper.appendChild(this.#cursor)
	}

	//AI 虚拟光标 (Cursor)：
	// 自定义游标由多个 CSS 层组成（边框、填充、点击涟漪效果）。
	// 平滑移动算法：使用 requestAnimationFrame 和缓动系数（0.2）实现光标从当前位置向目标位置的平滑过渡动画。
	// 提供 triggerClickAnimation() 方法触发点击时的视觉反馈动画。
	#moveCursorToTarget() {
		if (this.#disposed) return

		const newX = this.#currentCursorX + (this.#targetCursorX - this.#currentCursorX) * 0.2
		const newY = this.#currentCursorY + (this.#targetCursorY - this.#currentCursorY) * 0.2

		const xDistance = Math.abs(newX - this.#targetCursorX)
		if (xDistance > 0) {
			if (xDistance < 2) {
				this.#currentCursorX = this.#targetCursorX
			} else {
				this.#currentCursorX = newX
			}
			this.#cursor.style.left = `${this.#currentCursorX}px`
		}

		const yDistance = Math.abs(newY - this.#targetCursorY)
		if (yDistance > 0) {
			if (yDistance < 2) {
				this.#currentCursorY = this.#targetCursorY
			} else {
				this.#currentCursorY = newY
			}
			this.#cursor.style.top = `${this.#currentCursorY}px`
		}

		requestAnimationFrame(() => this.#moveCursorToTarget())
	}

	setCursorPosition(x: number, y: number) {
		if (this.#disposed) return

		this.#targetCursorX = x
		this.#targetCursorY = y
	}

	triggerClickAnimation() {
		if (this.#disposed) return

		this.#cursor.classList.remove(cursorStyles.clicking)
		// Force reflow to restart animation
		void this.#cursor.offsetHeight
		this.#cursor.classList.add(cursorStyles.clicking)
	}

	show() {
		if (this.shown || this.#disposed) return

		this.shown = true
		this.motion?.start()
		this.motion?.fadeIn()

		this.wrapper.classList.add(styles.visible)

		// Initialize cursor position
		this.#currentCursorX = window.innerWidth / 2
		this.#currentCursorY = window.innerHeight / 2
		this.#targetCursorX = this.#currentCursorX
		this.#targetCursorY = this.#currentCursorY
		this.#cursor.style.left = `${this.#currentCursorX}px`
		this.#cursor.style.top = `${this.#currentCursorY}px`
	}

	hide() {
		if (!this.shown || this.#disposed) return

		this.shown = false
		this.motion?.fadeOut()
		this.motion?.pause()

		this.#cursor.classList.remove(cursorStyles.clicking)

		setTimeout(() => {
			this.wrapper.classList.remove(styles.visible)
		}, 800) // Match the animation duration
	}

	dispose() {
		this.#disposed = true
		this.motion?.dispose()
		this.wrapper.remove()
		this.dispatchEvent(new Event('dispose'))
	}
}
