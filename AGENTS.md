# AGENTS.md

## 项目概述

VNEngine — 基于 TypeScript + Canvas 的视觉小说引擎。架构文档见 `doc/architecture.md`。

## 命令

```bash
npm run dev          # 开发服务器 (Vite)
npm run build        # 构建：先 tsc 类型检查，再 vite build
npm run preview      # 预览构建产物
npm run lint         # ESLint 检查
npm run format       # Prettier 格式化
npm run format:check # Prettier 仅检查
npm run test         # Vitest 单次运行
npm run test:watch   # Vitest watch 模式
npm run spell:check  # cSpell 拼写检查
```

## 技术约束

- **环境**: 浏览器 (DOM API + Canvas)，构建工具 Vite
- **入口**: `src/main.ts`，挂载到 `index.html` 的 `#app` 节点
- **模块系统**: ESM (`"type": "module"`)
- **TypeScript 严格配置**:
  - `verbatimModuleSyntax` 开启 — `import` 仅导入值的语法直接使用，类型导入必须用 `import type { ... }`
  - `erasableSyntaxOnly` 开启 — 禁止使用 `enum`/`namespace`，用 `const` 对象或联合类型替代
  - `noUnusedLocals` / `noUnusedParameters` 开启 — 不允许未使用的局部变量和参数
- **测试**: Vitest，`globals: true`（不需手动 import describe/it），`environment: 'node'`（测试在 Node 环境运行，不依赖 DOM）
- **格式化**: Prettier — 单引号、分号、尾逗号、80 字符宽、2 空格缩进
- **ESLint**: TypeScript ESLint + Prettier 兼容
- **目标**: ES2023, DOM lib

## 命名约定

- 抽象类/基类: 无特殊前缀
- 文件: PascalCase 用于类/组件模块, camelCase 用于工具函数模块

## 开发规范

## 1. 编码前先思考

**不要假设。不要掩饰困惑。明确呈现权衡。**

在实现之前：
- 明确写出你的假设。如果不确定，就提问。
- 如果存在多种解释，先把它们列出来，不要默默自行选择。
- 如果有更简单的方法，就直接指出来。在有必要时提出异议。
- 如果有不清楚的地方，就停下来。说清楚困惑点，并提问。

## 2. 简单优先

**只写解决问题所需的最少代码。不做任何预设性扩展。**

- 不要加入超出需求范围的功能。
- 不要为一次性代码做抽象。
- 不要加入未被要求的“灵活性”或“可配置性”。
- 不要为不可能发生的场景写错误处理。
- 如果你写了 200 行，但 50 行就够，就重写。

问问自己：“一个资深工程师会认为这太复杂了吗？” 如果答案是会，那就继续简化。

## 3. 外科手术式修改

**只改必须改的内容。只清理你自己造成的问题。**

编辑现有代码时：
- 不要“顺手优化”相邻代码、注释或格式。
- 不要重构没有坏掉的部分。
- 保持现有风格，即使你个人会写成别的样子。
- 如果发现无关的死代码，可以指出，但不要删除。

当你的改动产生遗留项时：
- 删除那些因你的修改而变成未使用的 import、变量或函数。
- 不要删除原本就存在的死代码，除非被明确要求。

检验标准：每一行改动都应当能直接追溯到用户请求。

## 4. 目标驱动执行

**先定义成功标准，再循环推进，直到验证通过。**

把任务转换成可验证的目标：
- “添加校验” → “先为非法输入写测试，再让测试通过”
- “修复这个 bug” → “先写能复现它的测试，再让测试通过”
- “重构 X” → “确保改动前后测试都通过”

对于多步骤任务，先给出简短计划：
```
1. [步骤] → 验证：[检查项]
2. [步骤] → 验证：[检查项]
3. [步骤] → 验证：[检查项]
```

强有力的成功标准能让你独立闭环推进。弱成功标准（“把它弄好”）则会不断需要额外澄清。