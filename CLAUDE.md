# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目约定

详见 `AGENTS.md`，涵盖：项目概述、命令、技术约束、命名约定、开发规范、测试规范、git 规范。本文档仅补充 AGENTS.md 未覆盖的内容。

## 架构

VNEngine — 基于 TypeScript + PixiJS v8 的视觉小说引擎。架构文档见 `doc/architecture.md`，脚本 DSL 规范见 `doc/script-dsl.md`。

路径别名：`@/*` → `./src/*`（tsconfig paths）。

## 提交规则

- Agent 不直接提交代码（见 AGENTS.md）
- 生成 commit message 时 **不要** 添加 `Co-Authored-By:` 尾缀
