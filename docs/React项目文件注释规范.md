# React 项目文件注释规范

> 目标：每个文件都有一致、简洁的说明，让新人能快速看懂每个文件的职责和用法。

## 一、注释格式（只有两类）

| 场景 | 格式 | 说明 |
| --- | --- | --- |
| 文件头 / 组件 / 函数 / Hook / 接口 | `/** ... */` | JSDoc 块注释，支持 IDE 悬停提示 |
| 行内关键逻辑、边界处理 | `//` | 单行注释，写「原因 / 边界」 |

## 二、内容顺序（所有注释通用）

**功能是什么 → 关键输入（Props/参数）→ 输出（返回值）→ 注意事项**

- 每项一句话即可，不写废话。
- TypeScript 项目里类型本身就是说明，注释不要再重复类型名。

## 三、各文件类型范例

### 1. 组件（.tsx / .jsx）— 文件头 + 组件注释

```tsx
/**
 * @file 用户列表页
 * @description 展示用户信息并支持搜索分页，供「用户管理」模块使用
 * @author 张三
 * @date 2026-10-07
 */
import { User } from '@/types';

/**
 * @description 用户列表组件
 * @param {Props} props - 列表数据、搜索回调
 */
export default function UserList({ users, onSearch }: Props) {
  // 空数据时直接提示，不渲染列表
  if (!users.length) return <Empty />;
  return <List data={users} />;
}
```

### 2. Hook（use*.ts）— 文件头 + 函数注释

```ts
/**
 * @file useDebounce 防抖 Hook
 * @description 将高频变化的值延迟返回，用于搜索框等场景
 * @author 张三
 * @date 2026-10-07
 */

/**
 * @description 返回防抖后的值
 * @param {T} value - 原始值
 * @param {number} delay - 延迟毫秒数，默认 300
 * @returns {T} 防抖后的值
 */
export function useDebounce<T>(value: T, delay = 300): T { ... }
```

### 3. 工具函数（utils/*.ts）— JSDoc 函数注释

```ts
/**
 * @description 格式化金额：保留两位小数并加千分位
 * @param {number} amount - 金额数值
 * @param {string} [currency='¥'] - 货币符号，默认 ¥
 * @returns {string} 格式化结果，如 ¥1,234.50
 */
export function formatMoney(amount: number, currency = '¥'): string { ... }
```

### 4. 接口请求（api/*.ts）— 额外写异常

```ts
/**
 * @description 获取用户列表
 * @param {UserQuery} params - 分页与筛选参数
 * @returns {Promise<PageResult<User>>} 分页结果
 * @throws {ApiError} 网络错误或 4xx / 5xx
 */
export async function fetchUsers(params: UserQuery): Promise<PageResult<User>> { ... }
```

### 5. 样式 / 配置 / 常量 — 单行或短块注释

```ts
// 主题色统一配置：组件禁止写死色值
export const COLORS = { primary: '#1677ff', danger: '#ff4d4f' };
```

```css
/* 列表卡片：桌面端三列，移动端单列 */
.user-card { display: grid; grid-template-columns: repeat(3, 1fr); }
```

### 6. 行内逻辑 — 单行注释写「原因 / 边界」

```ts
// 防抖：避免输入过快触发多次请求
// 边界：amount 为 NaN 时直接返回 '--'
```

## 四、使用要点

| 文件类型 | 必加注释 | 最低要求 |
| --- | --- | --- |
| 组件 .tsx/.jsx | 文件头 + 组件注释 | 功能、Props |
| Hook use*.ts | 文件头 + 函数注释 | 功能、入参、返回值 |
| 工具/接口 utils·api | 函数注释 | 参数、返回、异常 |
| 样式/配置/常量 | 单行/短块注释 | 用途一句话 |
| 复杂行内逻辑 | 行注释 | 分支、边界、原因 |

1. **文件头每个文件必加**，写清作用、作者、日期。
2. **声明上方必加**：组件、函数、Hook、接口。
3. **行内只注释关键分支、边界和「为什么」**，不注释显而易见的代码。
4. 注释随代码一起更新，改代码时同步改注释。
