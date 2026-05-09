# 4.5 间隔导言 (Interamble)

> **协议原文**: JESD79-5D v1.41, Section 4.5 (Page 130-133)
> **阅读前提**: [DDR5-S4.4-可编程前导后导]（Preamble 和 Postamble 是 Interamble 的基本构件：Interamble 就是前一个 Postamble 和后一个 Preamble 相遇时发生的事）。

---

## 4.5.0 当两次 Burst 靠得太近：前导和后导"打架"了

在 [DDR5-S4.4-可编程前导后导] 中，我们讨论的都是**单次 Burst** 的 Preamble 和 Postamble——一次读或写操作中，DQS 怎么从静态过渡到翻转、再从翻转到静态。但在实际系统中，DDR 总线是一条流水线——前一个 Burst 的数据刚传完，后一个 Burst 的命令可能已经发出了。两次 Burst 之间的间隔如果很短，前一个 Burst 的 Postamble 还没来得及完全结束，后一个 Burst 的 Preamble 就已经开始了。

DQS 在这两个过渡带相遇时会发生什么？这就是 **Interamble** 要回答的问题。JEDEC 专门创造了这个词来描述"Burst 间的 DQS 过渡区"——它不是一个独立的可配置参数，而是由 Postamble 长度、Preamble 长度和命令间隔三者共同决定的**重叠行为**。

---

## 4.5.1 最理想的情况：无缝 Burst（Seamless Burst）

当两个读命令的间隔恰好等于 **tCCD = BL/2 = 8 tCK** 时，且两个 Burst 使用同一个 DQS（同一 Nibble），DRAM 可以实现"无缝 Burst"。

什么是无缝？就是**前一个 Burst 的 Postamble 和后一个 Burst 的 Preamble 都不出现**。第一个 Burst 的第 16 个数据拍（D15）的 DQS 采样沿刚结束，DQS 不停顿，直接进入下一个 Burst 的第 0 拍的 DQS 采样沿。中间没有 DQS 静态电平——DQS 就像一个连续翻转了 32 拍的"超长 Burst"。

这种模式要求两个读命令之间的间隔**恰好等于 8 tCK**（BL16 的一半）。如果第二条命令晚于 8 tCK 发出，DQS 就会在第 16 拍之后停顿——出现了缝隙。所以无缝 Burst 是 DDR5 达到**峰值读吞吐**的前提条件：Controller 必须有能力以 8 tCK 的节奏连续发出 RD 命令，且地址映射保证这些命令指向不同的 Bank（避免同 Bank 冲突）。

> **图 1**: Figure 23 — Example of Seamless Reads Operation: tCCD=Min (JESD79-5D Page 130)

---

## 4.5.2 当命令间隔略大：重叠、触碰和缝隙

如果命令间隔大于 8 tCK（tCCD + 1, tCCD + 2, ...），前后 Burst 之间就有了"缝"。这个缝的宽度决定了 Postamble 和 Preamble 的交互方式。

### tCCD = Min + 1：Preamble 被"吃掉"一点

Figure 24 展示了 tCCD = Min + 1（即 9 tCK 的命令间隔）的情况。这个间隙比 BL/2 多了 1 个 tCK，但不足以让 Postamble 完全结束。

JEDEC 的规则很明确：**当 Postamble 和 Preamble 在时间上重叠时，DQS 的翻转优先于静态电平**。也就是说，Preamble 的翻转信号会"覆盖"Postamble 的静态要求——DQS 不会傻傻地先做完 Postamble（回到低电平），然后再从头开始做 Preamble。它会在 Postamble 还没完全结束时就直接切入 Preamble 的翻转序列。

根据配置的 Postamble 和 Preamble 长度组合，可能出现三种子情况：
- **Post=1.5, Pre=4**：Postamble 和 Preamble 重叠了 2 个 tCK。重叠部分 Preamble 覆盖了 Postamble——Postamble 被截断。
- **Post=1.5, Pre=3**：重叠 1 个 tCK。Postamble 同样被 Preamble 覆盖。
- **Post=0.5, Pre=4 (或 3)**：Postamble 刚好在 Preamble 开始前结束——"触碰"（touching）但不重叠。

### tCCD = Min + 2：重叠减少，更多的情况是"刚好碰上"

Figure 25 展示了 tCCD = Min + 2（10 tCK 间隔）。间隙更大了，重叠情况减少。Post=1.5 的模式从"重叠 2 tCK"变成了"触碰"或"重叠 1 tCK"。

### 一个非常重要的协议保证

JEDEC 在 4.5 节的原文中写了一句非常重要的话：

> "the postamble and preamble configured size shall NOT force the HOST to add command gaps in the command interval just to satisfy postamble or preamble settings."

翻译过来就是：**无论你配置了多长的 Preamble 和 Postamble，JEDEC 保证你不需要因此把 tCCD 拉大到超过 BL/2**。即使你设了 4 tCK 的 Preamble + 1.5 tCK 的 Postamble（加起来 5.5 tCK 的过渡时间），你仍然可以用最小 8 tCK 的命令间隔发连续读命令——DRAM 内部的 DQS 控制逻辑会自动处理重叠，不会要求 Controller 额外增加间隙。

这个保证对调度器设计至关重要：它意味着 Controller 不需要因为 Preamble/Postamble 的配置改变而修改命令调度策略。

---

## 4.5.3 写操作的 Interamble：Host 掌握节奏

写操作的 Interamble 规则与读操作类似——DQS 由 Host 控制，Host 负责管理连续 Write 命令之间的 DQS 过渡。

但写操作有一个读操作没有的特殊情况：**Write-to-Read 切换**。当一笔写操作结束后，DQS 总线需要从"Host 驱动"切换回"DRAM 驱动"（为下一笔读操作做准备）。这个**总线方向反转**（turnaround）需要额外的时间——因为 Host 必须先释放 DQS 总线（让输出缓冲器进入高阻），然后 DRAM 才能安全地开始驱动。这个额外的等待时间由 **tWTR（Write to Read）** 参数保证。

> **图 2**: Figure 24 — Example of Consecutive Reads Operation: tCCD=Min+1 (JESD79-5D Page 130)
> **图 3**: Figure 25 — Example of Consecutive Reads Operation: tCCD=Min+2 (JESD79-5D Page 130)
> **图 4**: Figure 26-34 — Additional Interamble Timing Diagrams for Write Operations (JESD79-5D Page 131-133)

---

## 4.5.4 回顾与总结

Interamble 这个概念之所以存在，是因为 DDR5 的流水线太深了——命令间隔可以短到 8 tCK，而 Preamble+Postamble 可能长达 5.5 tCK。两者必须共存，所以 DQS 的过渡带必须能重叠。JEDEC 用了一个简单的原则解决所有冲突："翻转优先于静态"——只要 DQS 还在翻转（无论是因为前一个 Burst 的 Postamble 还是后一个 Burst 的 Preamble），DQS 就继续翻，不插入死区。

---

**协议原文**: JESD79-5D Section 4.5 (Page 130-133)
**下一节**: [DDR5-S4.6-激活命令] (4.6 Activate Command)
**关联笔记**: [DDR5-S4.4-可编程前导后导] | [DDR5-读写时序] | [DDR5-S4.7-读操作]
