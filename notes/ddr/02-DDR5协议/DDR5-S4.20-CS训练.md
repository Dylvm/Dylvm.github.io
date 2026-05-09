# 4.20 CS 训练模式 (CS Training Mode, CSTM)

> **协议原文**: JESD79-5D v1.41, Section 4.20 (Page 214-217)

---

## 4.20.0 为什么训练的第一步是 CS_n 而不是 CA

在 Vref 设定好之后，训练流程就正式开始了。第一个训练目标不是 CA[13:0]（14 根命令地址线），而是只有**一根线**的 CS_n。这个顺序看似反常——CS_n 只有一根线，CA 有 14 根，为什么要先训练"更简单"的那个？

因为 CS_n 是所有后续操作的"总开关"。在 DDR5 中，只有 CS_n = L 时 DRAM 才会解码 CA 总线上的命令。如果 CS_n 的下降沿没有落在 CK 的建立/保持时间窗口内，整个命令都无法被正确锁存——CA 总线的时序再完美也没有意义。所以 CSTM 是训练的**第一步**：在 Controller 能向 DRAM 发送任何有意义命令之前，必须先保证 CS_n 能被正确识别。

并且 14 根 CA 线的训练本身就要依赖 CS_n——Controller 通过发送 CA Training Pattern（在 CATM 中），而这些 Pattern 的捕获需要 CS_n 已经正确对齐。所以必须先训练 CS_n，再训练 CA。

---

## 4.20.1 CSTM 的工作原理：一根线的二分搜索

CSTM 的核心思路很直接：Controller 不断发送 CS_n 的翻转 Pattern（比如持续的 L-H-L-H...），DRAM 在每个 CK 上升沿采样 CS_n 的电平值，然后通过 DQ 引脚的组合逻辑把采样值反馈给 Controller。Controller 比较"我发的 CS_n Pattern"和"DRAM 反馈的 CS_n 采样值"——如果一致，说明 CS_n 被正确捕获了；如果不一致，说明 CS_n 的延迟需要调整。

具体流程是：

- **进入 CSTM**：通过 MPC 命令（OP = Enter CSTM）进入。所有 Bank 必须 IDLE——因为训练期间内部逻辑被重新配置，正常的 Bank 操作不可用
- **发送 CS_n Pattern**：Controller 按照已知的 Pattern 驱动 CS_n 信号（比如每 2 个 CK 翻转一次）
- **DRAM 采样并反馈**：DRAM 在每个 CK 上升沿采样 CS_n 电平 → 采样的值通过 DQ 的硬件 Loopback 逻辑反馈给 Controller（不需要 DRAM 的 CA 解码器参与——反馈是纯硬件的）
- **Controller 扫描延迟**：Controller 逐步调整自己发送 CS_n 的延迟值，每个延迟点发 Pattern → 读反馈 → 记录 pass/fail。找到 pass 区间（反馈 = 发送）的两个边界，取中心值——这就是 CS_n 的最优延迟
- **退出 CSTM**：MPC 命令退出

二分法搜索在这里是标准操作：先从中间点测，如果 pass 就往左半区搜，如果 fail 就往右半区搜——每次搜索砍掉一半范围，对数复杂度，几个回合就收敛。

---

## 4.20.2 CSTM 完成后：命令入口打通了

CS_n 对齐后，Controller 就可以可靠地向 DRAM 发送 1-Cycle 命令（在 Multi-Cycle CS 模式下）——包括进入 CATM 的 MPC 命令。但 2-Cycle 命令仍然不可靠——因为 CA 总线的 14 根线还没有对齐，2-Cycle 命令的第二段信息可能被错采。所以下一步就是 CA Training。

> **表 1**: Output Signals for CS Training (JESD79-5D Page 217)

---

**协议原文**: JESD79-5D Section 4.20 (Page 214-217)
**关联笔记**: [DDR5-S4.19-CA训练] | [DDR5-S4.24-VrefCA命令] | [DDR5-训练流程]
