/**
 * sql.js 加载器（懒加载单例）。
 *
 * 职责：通过 sql.js 在浏览器内解析本地 MBTiles（本质是 SQLite）文件，
 * 把 wasm 二进制经 Vite `?url` 拷贝到构建产物后由 `locateFile` 定位。
 *
 * 类型说明：
 * - `@types/sql.js` 使用 `export = initSqlJs`（CJS 风格）。本项目 tsconfig 采用
 *   `moduleResolution: bundler`（隐式启用 allowSyntheticDefaultImports），
 *   故 `import initSqlJs from 'sql.js'` 既能通过类型检查，运行时由 Vite/esbuild 做 CJS 互操作。
 * - 为彻底规避 `export =` 的具名类型导入歧义，此处使用本地最小化类型接口描述所需 API 面，
 *   仅运行时函数采用默认导入。
 */

/** sql.js 查询结果（exec 返回的单条结果） */
interface SqlJsQueryResult {
  columns: string[]
  values: unknown[][]
}

/** sql.js 标量值 */
type SqlJsValue = number | string | Uint8Array | null

/** sql.js 预编译语句（用于流式遍历 tiles 表，避免一次性载入全部行） */
interface SqlJsStatement {
  /** 推进到下一行，返回是否仍有数据 */
  step(): boolean
  /** 读取当前行为数组（仅 step() 返回 true 后有效） */
  get(params?: unknown[]): SqlJsValue[]
  /** 释放语句资源 */
  free(): void
}

/** sql.js Database 实例所需 API 面 */
export interface SqlJsDatabase {
  exec(sql: string): SqlJsQueryResult[]
  prepare(sql: string): SqlJsStatement
  run(sql: string, params?: unknown): SqlJsDatabase
  close(): void
}

/** sql.js 初始化后的静态对象（构造 Database 用） */
export interface SqlJsStatic {
  Database: new (
    data?: ArrayLike<number> | ArrayBuffer | Uint8Array | null,
  ) => SqlJsDatabase
}

// 默认导入运行时函数（合成 default，见文件头说明）。
import initSqlJs from 'sql.js'
// 经 Vite `?url` 把 wasm 作为静态资源发布，运行时拿到其 URL 交给 locateFile。
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

let sqlPromise: Promise<SqlJsStatic> | null = null

/**
 * 获取（并懒加载缓存）sql.js 静态对象。
 *
 * 多次调用复用同一实例；wasm 仅下载/编译一次。
 * locateFile 始终返回 Vite 产出的 wasm URL，离线可用。
 */
export function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({ locateFile: () => sqlWasmUrl }).then(
      (mod) => mod as unknown as SqlJsStatic,
    )
  }
  return sqlPromise
}
