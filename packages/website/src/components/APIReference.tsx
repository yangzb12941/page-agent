/**
 * API Reference component for displaying TypeScript interface definitions
 * API 参考组件，用于显示 TypeScript 接口定义
 *
 * Provides a beautiful, readable table for documenting API interfaces
 * 提供美观、可读的表格用于文档化 API 接口
 */
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================
// 类型定义

export interface PropDefinition {
	/** Property name */
	/** 属性名称 */
	name: string
	/** TypeScript type (can include generics, unions, etc.) */
	/** TypeScript 类型（可包含泛型、联合类型等） */
	type: string
	/** Whether the property is required */
	/** 属性是否为必需 */
	required?: boolean
	/** Default value if any */
	/** 默认值（如果有） */
	defaultValue?: string
	/** Description of the property */
	/** 属性的描述 */
	description: React.ReactNode
	/** Mark as experimental/deprecated */
	/** 标记为实验性/已弃用 */
	status?: 'experimental' | 'deprecated'
}

export interface APIReferenceProps {
	/** Title for the API section */
	/** API 部分的标题 */
	title?: string
	/** Optional description */
	/** 可选的描述 */
	description?: React.ReactNode
	/** Property definitions */
	/** 属性定义列表 */
	properties: PropDefinition[]
	/** Display variant: 'properties' for fields, 'methods' for methods */
	/** 显示变体：'properties' 表示字段，'methods' 表示方法 */
	variant?: 'properties' | 'methods'
	/** Additional CSS classes */
	/** 额外的 CSS 类 */
	className?: string
}

// ============================================================================
// Component
// ============================================================================
// 组件

export function APIReference({
	title,
	description,
	properties,
	variant = 'properties',
	className,
}: APIReferenceProps) {
	const isMethodsVariant = variant === 'methods'
	return (
		<div className={cn('my-6', className)}>
			{title && (
				<h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
			)}
			{description && (
				<p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{description}</p>
			)}

			<div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
				<table className="w-full text-sm">
					<thead>
						<tr className="bg-gray-50 dark:bg-gray-800/50">
							<th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
								{isMethodsVariant ? 'Method' : 'Property'}
								{isMethodsVariant ? '方法' : '属性'}
							</th>
							<th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
								{isMethodsVariant ? 'Return Type' : 'Type'}
								{isMethodsVariant ? '返回类型' : '类型'}
							</th>
							<th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300 hidden md:table-cell">
								Default
								默认值
							</th>
							<th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
								Description
								描述
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-100 dark:divide-gray-800">
						{properties.map((prop) => (
							<PropRow key={prop.name} {...prop} />
						))}
					</tbody>
				</table>
			</div>
		</div>
	)
}

function PropRow({ name, type, required, defaultValue, description, status }: PropDefinition) {
	return (
		<tr className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
			{/* Property name */}
			{/* 属性名称 */}
			<td className="px-4 py-3 align-top">
				<div className="flex items-center gap-2 flex-wrap">
					<code className="font-mono text-sm font-medium text-indigo-600 dark:text-indigo-400">
						{name}
					</code>
					{required && (
						<Badge
							variant="outline"
							className="text-[10px] px-1.5 py-0 border-red-300 text-red-600 dark:border-red-800 dark:text-red-400"
						>
							required
							必需
						</Badge>
					)}
					{status === 'experimental' && (
						<Badge
							variant="outline"
							className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-600 dark:border-amber-800 dark:text-amber-400"
						>
							experimental
							实验性
						</Badge>
					)}
					{status === 'deprecated' && (
						<Badge
							variant="outline"
							className="text-[10px] px-1.5 py-0 border-gray-300 text-gray-500 dark:border-gray-700 dark:text-gray-500 line-through"
						>
							deprecated
							已弃用
						</Badge>
					)}
				</div>
			</td>

			{/* Type */}
			{/* 类型 */}
			<td className="px-4 py-3 align-top">
				<code className="font-mono text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded wrap-break-word">
					{type}
				</code>
			</td>

			{/* Default value */}
			{/* 默认值 */}
			<td className="px-4 py-3 align-top hidden md:table-cell">
				{defaultValue ? (
					<code className="font-mono text-xs text-gray-600 dark:text-gray-400">{defaultValue}</code>
				) : (
					<span className="text-gray-400 dark:text-gray-600">-</span>
				)}
			</td>

			{/* Description */}
			{/* 描述 */}
			<td className="px-4 py-3 align-top text-gray-600 dark:text-gray-400">{description}</td>
		</tr>
	)
}

// ============================================================================
// Utility Components
// ============================================================================
// 辅助组件

/** Code inline span for type references in descriptions */
/** 用于描述中类型引用的行内代码 */
export function TypeRef({ children }: { children: React.ReactNode }) {
	return (
		<code className="font-mono text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-1 py-0.5 rounded">
			{children}
		</code>
	)
}

/** Section divider for grouping related APIs */
/** 用于分组相关 API 的区域分隔线 */
export function APIDivider({ title }: { title: string }) {
	return (
		<div className="flex items-center gap-4 my-8">
			<div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent" />
			<span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
				{title}
			</span>
			<div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent" />
		</div>
	)
}