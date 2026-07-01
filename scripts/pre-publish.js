#!/usr/bin/env node
/**
 * Backup package.json, then rewrite it for publish:
 * 备份 package.json，然后为发布重写它：
 *   - Promote `publishConfig` fields to top level
 *   - 将 `publishConfig` 字段提升到顶层
 *   - Remove `publishConfig` (npm doesn't need the wrapper)
 *   - 移除 `publishConfig`（npm 不需要这个包装）
 *   - Copy LICENSE (and README.md for the main package)
 *   - 复制 LICENSE（以及主包的 README.md）
 *
 * Usage: node ../../scripts/pre-publish.js   (from a package dir)
 * 用法：node ../../scripts/pre-publish.js   （在包目录下执行）
 */
import { copyFileSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const pkgPath = join(process.cwd(), 'package.json')
const raw = readFileSync(pkgPath, 'utf-8')
const pkg = JSON.parse(raw)

const publishConfig = pkg.publishConfig
if (!publishConfig) {
	console.log('  No publishConfig found, skipping manifest rewrite.')
	console.log('  未找到 publishConfig，跳过清单重写。')
	process.exit(0)
}

// Backup the original file byte-for-byte
// 逐字节备份原始文件
copyFileSync(pkgPath, pkgPath + '.bak')
console.log('  ✓ package.json backed up')
console.log('  ✓ package.json 已备份')

for (const [field, value] of Object.entries(publishConfig)) {
	pkg[field] = value
}
delete pkg.publishConfig

writeFileSync(pkgPath, JSON.stringify(pkg, null, '    ') + '\n')
console.log(`  ✓ Manifest rewritten for publish (${Object.keys(publishConfig).join(', ')})`)
console.log(`  ✓ 清单已为发布重写 (${Object.keys(publishConfig).join(', ')})`)

const root = join(process.cwd(), '../..')
copyFileSync(join(root, 'LICENSE'), join(process.cwd(), 'LICENSE'))
console.log('  ✓ LICENSE copied')
console.log('  ✓ LICENSE 已复制')

if (pkg.name === 'page-agent') {
	copyFileSync(join(root, 'README.md'), join(process.cwd(), 'README.md'))
	console.log('  ✓ README.md copied')
	console.log('  ✓ README.md 已复制')
}