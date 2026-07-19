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

## git规范

## 1. 分支开发规范

- 1.1 核心原则

  - 禁止直接向 main（或 master）分支推送代码。
  - 所有开发均通过 分支 + 合并请求（Pull Request / Merge Request） 进行。
  - 合并前必须通过代码评审（Code Review）和 CI 检查。

- 1.2 分支命名与用途

  分支类型 命名格式 说明
  功能分支 feature/<short-description> 用于开发新功能。例：feature/user-login  
  修复分支 fix/<short-description> 用于修复常规 Bug。例：fix/api-timeout  
  热修复分支 hotfix/<short-description> 用于紧急修复生产环境问题，通常基于 main 创建，修复后需同时合并回 main 和 develop（如果有）  
  发布分支 release/<version> 用于准备发布版本，做最后的测试、文档更新等。完成后合并回 main 并打标签  
  杂项/优化 chore/<short-description> 用于构建、工具、依赖等非功能变动（如修改 ESLint 配置）  

  分支名使用小写字母、连字符（-）分隔，避免使用下划线或驼峰。

- 1.3 合并流程

  1. 从 main 拉出开发分支（如 feature/xxx）。
  2. 开发完成后，推送到远程仓库，并创建 PR/MR 请求合并到 main。
  3. 至少一名 Reviewer 批准，且 CI 全部通过后，由维护者执行 Squash and Merge 或 Rebase and Merge（保持历史线性）。
  4. 合并后删除该开发分支（可选）。

---

## 2. Commit Message 规范

基于 Conventional Commits 1.0.0，格式如下：

```
<type>(<scope>): <subject>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```

- 2.1 Header（必填）

  - type（必填）

    type 说明 是否触发版本更新  
    feat 新功能 是  
    fix 修复 Bug 是  
    docs 仅文档更改 否  
    style 代码格式（不影响运行，如空格、分号、缩进） 否  
    refactor 代码重构（不修改外部行为） 否  
    perf 性能优化 否  
    test 添加或修改测试 否  
    build 影响构建系统或外部依赖（如 npm、pip、gulp） 否  
    ci 修改 CI 配置文件或脚本（如 GitHub Actions） 否  
    chore 其他杂项（如修改 ESLint/Prettier 等工具配置） 否  
    revert 回滚之前的提交 否  

    特殊场景补充：

      - 删除依赖项 → 使用 build(deps): 移除...
      - 修改 ESLint/Prettier 配置 → 使用 chore(eslint): ... 或 chore(prettier): ...

  - scope（可选）

    本次改动影响的模块、文件或功能域，如 api、user、deps、config。

  - subject（必填）

    - 动词开头，现在时，如 add 而非 added。
    - 首字母小写。
    - 结尾不加句号（.）。
    - 长度 ≤ 50 字符。

- 2.2 Body（可选）

    - 详细描述为什么改以及怎么改，与之前行为的对比。
    - 每行不超过 72 字符。

- 2.3 Footer（可选）

  - Breaking Changes：以 BREAKING CHANGE: <描述> 开头。
  - 关闭 Issue：如 Closes #123 或 Fixes #456, #789。



