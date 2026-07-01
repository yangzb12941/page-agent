import { ComponentPropsWithoutRef } from 'react'

import { cn } from '@/lib/utils'

interface MarqueeProps extends ComponentPropsWithoutRef<'div'> {
	/**
	 * Optional CSS class name to apply custom styles
	 * 可选的 CSS 类名，用于应用自定义样式
	 */
	className?: string
	/**
	 * Whether to reverse the animation direction
	 * 是否反转动画方向
	 * @default false
	 */
	reverse?: boolean
	/**
	 * Whether to pause the animation on hover
	 * 悬停时是否暂停动画
	 * @default false
	 */
	pauseOnHover?: boolean
	/**
	 * Content to be displayed in the marquee
	 * 在跑马灯中显示的内容
	 */
	children: React.ReactNode
	/**
	 * Whether to animate vertically instead of horizontally
	 * 是否垂直而非水平动画
	 * @default false
	 */
	vertical?: boolean
	/**
	 * Number of times to repeat the content
	 * 内容重复的次数
	 * @default 4
	 */
	repeat?: number
}

export function Marquee({
	className,
	reverse = false,
	pauseOnHover = false,
	children,
	vertical = false,
	repeat = 4,
	...props
}: MarqueeProps) {
	return (
		<div
			{...props}
			className={cn(
				'group flex [gap:var(--gap)] overflow-hidden p-2 [--duration:40s] [--gap:1rem]',
				{
					'flex-row': !vertical,
					'flex-col': vertical,
				},
				className
			)}
		>
			{Array(repeat)
				.fill(0)
				.map((_, i) => (
					<div
						key={i}
						className={cn('flex shrink-0 justify-around [gap:var(--gap)]', {
							'animate-marquee flex-row': !vertical,
							'animate-marquee-vertical flex-col': vertical,
							'group-hover:[animation-play-state:paused]': pauseOnHover,
							'[animation-direction:reverse]': reverse,
						})}
					>
						{children}
					</div>
				))}
		</div>
	)
}