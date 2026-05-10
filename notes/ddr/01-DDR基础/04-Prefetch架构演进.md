# 04 Prefetch 架构演进 — DDR 提速的秘密武器

> 在 03 章中，我们看到 tRCD 的 ns 值趋近 ~14ns 的物理极限——SA 的模拟速度无法再快。但市场要求接口从 100MHz 一路涨到 4800MHz。**怎么让一个受限于模拟电路的"慢"内核，驱动一个 GHz 级别的"快"接口？** 答案是用面积换速度——Prefetch。

---

## 8.1 核心矛盾：内部阵列速度上限 vs 接口速率需求

DRAM 内部阵列的工作频率被**模拟电路**限制在约 **200-400 MHz**。这不是数字逻辑的限制——是 SA 需要时间来完成 Precharge→Access→Sense→Restore 四个阶段（tRCD ≈ 14ns → 极限约 71 MHz 行激活），是 BL 均衡需要时间（tRP ≈ 14ns），是 Row Decoder 驱动大 RC 负载的 WL 需要时间。

但市场对接口速率的要求呈指数增长——从 SDRAM 的 66 Mbps 到 DDR5 的 4800 Mbps，翻了 70 倍。怎么调和？

**Prefetch = 用面积换速度**。内部阵列以低频宽位宽操作，一次取出多位数据，在输出端用高速串行化逻辑（SERDES）逐个发出去。

---

## 8.2 各代 Prefetch 演进

| 代际 | Prefetch | 内部频率 (以接口速率为例) | 内部数据宽度 (x8) | Burst Length |
|------|---------|------------------------|-------------------|-------------|
| SDR | 1n | 100 MHz → 100 Mbps | 8-bit | 1 |
| DDR | 2n | 100 MHz → 200 Mbps | 16-bit | 2 |
| DDR2 | 4n | 100 MHz → 400 Mbps | 32-bit | 4 |
| DDR3 | 8n | 200 MHz → 1600 Mbps | 64-bit | 8 |
| DDR4 | 8n | 300 MHz → 2400 Mbps | 64-bit | 8 |
| DDR5 | 16n | 300 MHz → 4800 Mbps | 128-bit | 16 |

**规律：BL = Prefetch = 内部数据宽度 / 接口位宽**。一次内部预取产出的数据量，恰好被一次 Burst 完整输出。

以 **DDR5-4800 x8** 为例：
- 内部阵列频率：4800/16 = **300 MHz**（远低于 SA 的极限）
- 内部一次取出的数据：16n × 8-bit = **128-bit**
- 接口输出：128-bit → 8:1 SERDES → 每 DQ 在 8 CK 内输出 16 个数据拍

---

## 8.3 代价：访问粒度翻倍

"用空间换时间"不是免费的。每一代 Prefetch 翻倍 → Burst Length 翻倍 →**最小访问粒度翻倍**。

DDR5 BL16 = 16 拍 × 8-bit = **128-bit = 16 Bytes**。这意味着即使 Controller 只需要 8 Bytes 的数据——DRAM 也得读出 128-bit，然后把不需要的 64-bit 丢掉（BC8 模式就是用来处理这个场景的——但仍然不省内部操作时间）。

《Memory Systems》第 7.5.1 节提出了一个尖锐的问题：**"how far a cache block will scale before SRAM designers say enough: 128 B per block? 256 B? 1 KB?"**——处理器 Cache Block 的增长速度能否跟上 DRAM 访问粒度的增长速度？如果跟不上，那 Prefetch 带来的带宽增益就会被"读了不需要的数据"浪费掉。

---

## 8.4 为什么 DDR5 选 16n？

DDR4 已经是 8n Prefetch。DDR4-3200 需要内部阵列跑到 400 MHz——这对 DRAM 工艺来说已经接近极限。要进一步提速到 4800~6400 MT/s，8n 方案需要内部跑到 600~800 MHz——**不可行**。所以 DDR5 把 Prefetch 翻倍到 **16n**，让内部频率回到 ~300 MHz 这个舒适区间。

代价是 BL 从 8 增加到 16——但对于现代 CPU 以 64B Cache Line 为单位的访问模式来说，这不是问题。对于只需要 8B 的场景，BC8 提供了一种"砍掉一半"的选项。

> **图 8.1**: Fig 7.10 — Evolution of the DRAM architecture (Memory Systems, Page 323)
> **图 8.2**: Fig 8.16 — N-bit prefetch architecture (Memory Systems, Page 373)

---

## 8.5 本章总结与下章预告

Prefetch 是 DRAM 各代提速的"作弊码"——内部阵列保持 ~300MHz 的舒适速度，通过加宽内部数据通路来匹配外部接口的 GHz 级速率。代价是 BL 翻倍、最小访问粒度翻倍。

现在我们已经理解了单颗 DRAM 芯片的内部——从 1T1C 单元到 SA 到完整的读写流程到时序参数到 Prefetch。但一颗 x8 芯片只有 8-bit 宽的 DQ——而 CPU 的数据总线是 64-bit。**怎么用多颗芯片拼出完整的 DIMM？** 下一章，讨论从 Cell 到 DIMM 的完整层级架构。

---

**关联阅读**: [03-基本时序参数] | [05-层级架构] | [DDR5-S4.2-突发长度]
