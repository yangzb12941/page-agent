import { AnimatePresence, MotionProps, Variants, motion } from 'motion/react'
import { ElementType, memo } from 'react'

import { cn } from '@/lib/utils'

type AnimationType = 'text' | 'word' | 'character' | 'line'
type AnimationVariant =
	| 'fadeIn'
	| 'blurIn'
	| 'blurInUp'
	| 'blurInDown'
	| 'slideUp'
	| 'slideDown'
	| 'slideLeft'
	| 'slideRight'
	| 'scaleUp'
	| 'scaleDown'

interface TextAnimateProps extends MotionProps {
	/**
	 * The text content to animate
	 * 要动画的文本内容
	 */
	children: string
	/**
	 * The class name to be applied to the component
	 * 应用于组件的类名
	 */
	className?: string
	/**
	 * The class name to be applied to each segment
	 * 应用于每个片段的类名
	 */
	segmentClassName?: string
	/**
	 * The delay before the animation starts
	 * 动画开始前的延迟时间
	 */
	delay?: number
	/**
	 * The duration of the animation
	 * 动画的持续时间
	 */
	duration?: number
	/**
	 * Custom motion variants for the animation
	 * 动画的自定义运动变体
	 */
	variants?: Variants
	/**
	 * The element type to render
	 * 要渲染的元素类型
	 */
	as?: ElementType
	/**
	 * How to split the text ("text", "word", "character")
	 * 如何拆分文本（"text"、"word"、"character"）
	 */
	by?: AnimationType
	/**
	 * Whether to start animation when component enters viewport
	 * 是否在组件进入视口时开始动画
	 */
	startOnView?: boolean
	/**
	 * Whether to animate only once
	 * 是否仅动画一次
	 */
	once?: boolean
	/**
	 * The animation preset to use
	 * 要使用的动画预设
	 */
	animation?: AnimationVariant
	/**
	 * Whether to enable accessibility features (default: true)
	 * 是否启用可访问性功能（默认：true）
	 */
	accessible?: boolean
}

const staggerTimings: Record<AnimationType, number> = {
	text: 0.06,
	word: 0.05,
	character: 0.03,
	line: 0.06,
}

const defaultContainerVariants = {
	hidden: { opacity: 1 },
	show: {
		opacity: 1,
		transition: {
			delayChildren: 0,
			staggerChildren: 0.05,
		},
	},
	exit: {
		opacity: 0,
		transition: {
			staggerChildren: 0.05,
			staggerDirection: -1,
		},
	},
}

const defaultItemVariants: Variants = {
	hidden: { opacity: 0 },
	show: {
		opacity: 1,
	},
	exit: {
		opacity: 0,
	},
}

const defaultItemAnimationVariants: Record<
	AnimationVariant,
	{ container: Variants; item: Variants }
> = {
	fadeIn: {
		container: defaultContainerVariants,
		item: {
			hidden: { opacity: 0, y: 20 },
			show: {
				opacity: 1,
				y: 0,
				transition: {
					duration: 0.3,
				},
			},
			exit: {
				opacity: 0,
				y: 20,
				transition: { duration: 0.3 },
			},
		},
	},
	blurIn: {
		container: defaultContainerVariants,
		item: {
			hidden: { opacity: 0, filter: 'blur(10px)' },
			show: {
				opacity: 1,
				filter: 'blur(0px)',
				transition: {
					duration: 0.3,
				},
			},
			exit: {
				opacity: 0,
				filter: 'blur(10px)',
				transition: { duration: 0.3 },
			},
		},
	},
	blurInUp: {
		container: defaultContainerVariants,
		item: {
			hidden: { opacity: 0, filter: 'blur(10px)', y: 20 },
			show: {
				opacity: 1,
				filter: 'blur(0px)',
				y: 0,
				transition: {
					y: { duration: 0.3 },
					opacity: { duration: 0.4 },
					filter: { duration: 0.3 },
				},
			},
			exit: {
				opacity: 0,
				filter: 'blur(10px)',
				y: 20,
				transition: {
					y: { duration: 0.3 },
					opacity: { duration: 0.4 },
					filter: { duration: 0.3 },
				},
			},
		},
	},
	blurInDown: {
		container: defaultContainerVariants,
		item: {
			hidden: { opacity: 0, filter: 'blur(10px)', y: -20 },
			show: {
				opacity: 1,
				filter: 'blur(0px)',
				y: 0,
				transition: {
					y: { duration: 0.3 },
					opacity: { duration: 0.4 },
					filter: { duration: 0.3 },
				},
			},
		},
	},
	slideUp: {
		container: defaultContainerVariants,
		item: {
			hidden: { y: 20, opacity: 0 },
			show: {
				y: 0,
				opacity: 1,
				transition: {
					duration: 0.3,
				},
			},
			exit: {
				y: -20,
				opacity: 0,
				transition: {
					duration: 0.3,
				},
			},
		},
	},
	slideDown: {
		container: defaultContainerVariants,
		item: {
			hidden: { y: -20, opacity: 0 },
			show: {
				y: 0,
				opacity: 1,
				transition: { duration: 0.3 },
			},
			exit: {
				y: 20,
				opacity: 0,
				transition: { duration: 0.3 },
			},
		},
	},
	slideLeft: {
		container: defaultContainerVariants,
		item: {
			hidden: { x: 20, opacity: 0 },
			show: {
				x: 0,
				opacity: 1,
				transition: { duration: 0.3 },
			},
			exit: {
				x: -20,
				opacity: 0,
				transition: { duration: 0.3 },
			},
		},
	},
	slideRight: {
		container: defaultContainerVariants,
		item: {
			hidden: { x: -20, opacity: 0 },
			show: {
				x: 0,
				opacity: 1,
				transition: { duration: 0.3 },
			},
			exit: {
				x: 20,
				opacity: 0,
				transition: { duration: 0.3 },
			},
		},
	},
	scaleUp: {
		container: defaultContainerVariants,
		item: {
			hidden: { scale: 0.5, opacity: 0 },
			show: {
				scale: 1,
				opacity: 1,
				transition: {
					duration: 0.3,
					scale: {
						type: 'spring',
						damping: 15,
						stiffness: 300,
					},
				},
			},
			exit: {
				scale: 0.5,
				opacity: 0,
				transition: { duration: 0.3 },
			},
		},
	},
	scaleDown: {
		container: defaultContainerVariants,
		item: {
			hidden: { scale: 1.5, opacity: 0 },
			show: {
				scale: 1,
				opacity: 1,
				transition: {
					duration: 0.3,
					scale: {
						type: 'spring',
						damping: 15,
						stiffness: 300,
					},
				},
			},
			exit: {
				scale: 1.5,
				opacity: 0,
				transition: { duration: 0.3 },
			},
		},
	},
}

const TextAnimateBase = ({
	children,
	delay = 0,
	duration = 0.3,
	variants,
	className,
	segmentClassName,
	as: Component = 'p',
	startOnView = true,
	once = false,
	by = 'word',
	animation = 'fadeIn',
	accessible = true,
	...props
}: TextAnimateProps) => {
	const MotionComponent = motion.create(Component)

	let segments: string[] = []
	switch (by) {
		case 'word':
			segments = children.split(/(\s+)/)
			break
		case 'character':
			segments = children.split('')
			break
		case 'line':
			segments = children.split('\n')
			break
		case 'text':
		default:
			segments = [children]
			break
	}

	const finalVariants = variants
		? {
				container: {
					hidden: { opacity: 0 },
					show: {
						opacity: 1,
						transition: {
							opacity: { duration: 0.01, delay },
							delayChildren: delay,
							staggerChildren: duration / segments.length,
						},
					},
					exit: {
						opacity: 0,
						transition: {
							staggerChildren: duration / segments.length,
							staggerDirection: -1,
						},
					},
				},
				item: variants,
			}
		: animation
			? {
					container: {
						...defaultItemAnimationVariants[animation].container,
						show: {
							...defaultItemAnimationVariants[animation].container.show,
							transition: {
								delayChildren: delay,
								staggerChildren: duration / segments.length,
							},
						},
						exit: {
							...defaultItemAnimationVariants[animation].container.exit,
							transition: {
								staggerChildren: duration / segments.length,
								staggerDirection: -1,
							},
						},
					},
					item: defaultItemAnimationVariants[animation].item,
				}
			: { container: defaultContainerVariants, item: defaultItemVariants }

	return (
		<AnimatePresence mode="popLayout">
			<MotionComponent
				variants={finalVariants.container as Variants}
				initial="hidden"
				whileInView={startOnView ? 'show' : undefined}
				animate={startOnView ? undefined : 'show'}
				exit="exit"
				className={cn('whitespace-pre-wrap', className)}
				viewport={{ once }}
				aria-label={accessible ? children : undefined}
				{...props}
			>
				{accessible && <span className="sr-only">{children}</span>}
				{segments.map((segment, i) => (
					<motion.span
						key={`${by}-${segment}-${i}`}
						variants={finalVariants.item}
						custom={i * staggerTimings[by]}
						className={cn(
							by === 'line' ? 'block' : 'inline-block whitespace-pre',
							by === 'character' && '',
							segmentClassName
						)}
						aria-hidden={accessible ? true : undefined}
					>
						{segment}
					</motion.span>
				))}
			</MotionComponent>
		</AnimatePresence>
	)
}

// Export the memoized version
// 导出记忆化版本
export const TextAnimate = memo(TextAnimateBase)