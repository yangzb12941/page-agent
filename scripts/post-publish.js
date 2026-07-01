#!/usr/bin/env node
/**
 * Restore package.json from the backup created by pre-publish.js,
 * 从 pre-publish.js 创建的备份中恢复 package.json，
 * then clean up temporary files (backup, LICENSE, README.md).
 * 然后清理临时文件（备份、LICENSE、README.md）。
 *
 * Usage: node ../../scripts/post-publish.js   (from a package dir)
 * 用法：node ../../scripts/post-publish.js   （在包目录下执行）
 */
import { existsSync, readFileSync, renameSync, rmSync } from 'fs'
import { join } from 'path'

const pkgPath = join(process.cwd(), 'package.json')
const bakPath = pkgPath + '.bak'

if (!existsSync(bakPath)) {
	console.log('  No backup found, nothing to restore.')
	console.log('  未找到备份，无需恢复。')
	process.exit(0)
}

const name = JSON.parse(readFileSync(pkgPath, 'utf-8')).name

renameSync(bakPath, pkgPath)
console.log('  ✓ package.json restored from backup')
console.log('  ✓ package.json 已从备份恢复')

rmSync(join(process.cwd(), 'LICENSE'), { force: true })
console.log('  ✓ LICENSE removed')
console.log('  ✓ LICENSE 已移除')

if (name === 'page-agent') {
	rmSync(join(process.cwd(), 'README.md'), { force: true })
	console.log('  ✓ README.md removed')
	console.log('  ✓ README.md 已移除')
}