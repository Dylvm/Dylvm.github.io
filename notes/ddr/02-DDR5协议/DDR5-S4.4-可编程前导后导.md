# 4.4 可编程前导与后导 (Programmable Preamble and Postamble)

> **协议原文**: JESD79-5D v1.41, Section 4.4 (Page 123-129)
> **阅读前提**: [DDR5-读写时序]（DQS 与 DQ 的源同步关系——DQS 的上升沿和下降沿是 DQ 数据的采样基准）。

---

## 4.4.0 为什么 DQS 不能直接跳进数据里

DDR5 的数据传输靠的是**源同步时钟**——不是用全局 CK 去采样 DQ，而是用一条与数据并行的 DQS（Data Strobe）信号来"伴随"数据。DQS 的边沿告诉接收端"现在可以采样 DQ 了"。

但 DQS 不能一直翻转。在两次 Burst 之间的空闲期，没有数据要传输，DQS 需要回到一个确定的静态电平——否则接收端无法区分"空闲"和"有数据"。这就产生了一个问题：**DQS 从静态切到翻转模式，以及从翻转模式切回静态，中间需要过渡时间。** 这两个过渡期就是 Preamble（前导）和 Postamble（后导）。

过渡期的长度不是越长越好——太长了占用总线时间，太短了接收端可能来不及锁定 DQS 相位。DDR5 让这两个长度**可编程**（通过 MR8），Controller 可以根据工作频率和自身 PHY 的能力来权衡。

---

## 4.4.1 读 Preamble：DRAM 在"喊话"之前先"清嗓子"

读操作中，DQS 由 DRAM 驱动。在数据出现之前，DRAM 需要提前开始翻转 DQS——这就是 Read Preamble。它给 Controller PHY 一个"预热"窗口：Preamble 的翻转序列让 PHY 的 CDR（Clock Data Recovery）电路锁定 DQS 的相位，这样当真正的第一个数据采样沿到来时，PHY 已经准备好了。

### MR8 OP[2:0] 的五种配置

| MR8 OP[2:0] | Preamble 长度 | DQS 翻转 Pattern | 适用 Speed Bin | 为什么这样设计 |
|-------------|-------------|------------------|---------------|---------------|
| 000 | **1 tCK** | "10"——DQS 只在第一个 CK 内做一次 L→H 翻转 | DDR5-3200/3600 | 最低速时 1 个 CK 的 Preamble 足够了，节省带宽 |
| 001 | **2 tCK** | "0010"——先保持低电平 1 CK，再做 L→H 翻转 | DDR5-3200~4800 | 这是**默认模式**——"0010"的低电平开头给接收端一个清晰的"开始"标记 |
| 010 | **2 tCK (DDR4 风格)** | "1110"——先保持高电平 1 CK，再做 H→L→H | DDR5-3200~4800 | 兼容从 DDR4 升级的 PHY——DDR4 的读 Preamble 起始于高电平 |
| 011 | **3 tCK** | "000010"——低电平 4 拍 + 翻转 | DDR5-4000~6400 | 中速需要更多翻转让 PHY 锁定 |
| 100 | **4 tCK** | "00001010"——低电平 6 拍 + 两次翻转 | DDR5-5600~9200 | 高速时 DQS 眼图紧，PHY 需要最长的"热身" |

**Pattern 为什么长这样？** 每个 Pattern 都以连续的**低电平**开头（DDR4 风格的 "1110" 除外）。这是因为 DQS 在空闲态是**低电平**——上一笔 Burst 的 Postamble 结束后，DQS 停在低。Preamble 从低电平延续一段，然后做第一次翻转——接收端从这次翻转开始"数"："这就是 Preamble 的第一个有效沿，数据将在 tRPRE 时间后到达。"

**DDR4 风格 Preamble（"1110"）** 的存在纯粹是为了迁移兼容。如果你的 PHY 是从 DDR4 设计继承来的（DDR4 的读 DQS 起始于高电平），你可以选这个模式来避免修改 PHY 的 DQS 检测逻辑。

### 读 Postamble：数据结束了，给最后半拍收尾

最后一个数据采样沿之后，DQS 需要再做一小段翻转才能安全地回到静态。这个收尾就是 Read Postamble（由 **MR8 OP[6]** 控制）：

- **OP[6] = 0 → 0.5 tCK**：最后半拍翻转。适合低速模式——0.5 tCK 足够了，多余的翻转只会延迟下一次 Burst。
- **OP[6] = 1 → 1.5 tCK**：最后 1.5 拍翻转。在高速模式下（>4800 MT/s），接收端可能需要额外的翻转来"确认" Burst 确实结束了——1.5 tCK 提供了更充裕的关闭时间。

> **图 1**: Figure 12 — Example of Read Preamble Modes with 0.5 tCK Postamble (JESD79-5D Page 123)
> **图 2**: Figure 13 — Example of Read Preamble Modes with 1.5 tCK Postamble (JESD79-5D Page 123)

---

## 4.4.2 写 Preamble：Host 掌握主动权

写操作中，DQS 由 Host（Controller）驱动。Host 对自己什么时候开始翻转 DQS 有精确的控制——它不需要像 DRAM 那样用 Preamble 来"提醒"对端"数据快来了"（因为 Host 自己的计时就是标准）。所以写 Preamble **不存在 1 tCK 选项**——最快的起步就是 2 tCK。

### MR8 OP[4:3] 的三种配置

| MR8 OP[4:3] | Preamble 长度 | 适用场景 |
|------------|-------------|---------|
| 00 | **2 tCK** | DDR5-3200~4800，默认模式 |
| 01 | **3 tCK** | DDR5-4000~6400 |
| 10 | **4 tCK** | DDR5-5200~9200 |
| 11 | RFU | — |

**为什么写 Preamble 不需要 1 tCK？** 因为写操作中 DRAM 是接收端——DRAM 不需要"提前热身"来锁定 DQS 相位（DQS 是 Host 驱动的，Host 保证它的时序）。Preamble 的作用纯粹是给 DRAM 的 DQS 接收电路一个"启动标记"——2 tCK 就是最低要求。

### 写 Postamble

写 Postamble 与读 Postamble 对称，由 **MR8 OP[7]** 控制（0 → 0.5 tCK, 1 → 1.5 tCK）。但有一个写操作特有的考量：**tWPST 的长短会直接影响 Write-to-Read turnaround 的时间**（因为 DQS 总线需要从 Host 驱动模式切换到 DRAM 驱动模式）。Postamble 越长，总线释放得越晚，tWTR（Write-to-Read）就需要额外的等待时间。

### Read DQS Offset（Figure 14）：提前 DQS 但不移数据

在 4.4.1 的读 Preamble 之后，Figure 14 引入了 **MR40 OP[2:0]——Read DQS Offset Timing** 的概念。这个参数告诉 DRAM："把 DQS 的翻转**提前 x 个 tCK** 开始——但数据不要提前。"效果是 Preamble 被拉长了，但第一个有效数据采样沿的位置不变。[DDR5-S4.7-读操作] §4.7.1.3 详细解释了这种机制在跨 Rank 读操作中的实际用途。

> **图 3**: Figure 14 — Read Preamble Modes with 3tCK DQS Offset and 1.5 tCK Postamble (JESD79-5D Page 124)
> **图 4**: Figure 15 — Example of Write Preamble Modes with 0.5tCK Postamble (JESD79-5D Page 124)
> **图 5**: Figure 16 — Example of Write Preamble Modes with 1.5tCK Postamble (JESD79-5D Page 124)

---

## 4.4.3 把这些选择变成精确的数字：时序参数

前面我们一直在说"2 tCK""4 tCK"，但 JEDEC 规范中的时序参数并不是精确的整数倍 tCK——因为实际的模拟电路有上升/下降时间、有过冲、有抖动。Table 37 和 Table 38 分低速和高速两档定义了每一个 Preamble/Postamble 参数的**最小允许值**。

### Table 37 — 低速（DDR5-3200~4800）

以 DDR5-4800 这一列为例：

- **tRPRE2 = 1.800 tCK**（2 tCK 的 Read Preamble）：注意最小值不是 2.000 tCK——因为 DRAM 实际输出的 Preamble 可能因为抖动而略短。1.800 tCK 是规格允许的**最差情况**——只要你的 PHY 能在 1.8 tCK 的翻转内锁定 DQS 相位，就安全。
- **tRPST0.5 = 0.450 tCK**（0.5 tCK 的 Read Postamble）：同理，0.5 tCK 的标称值对应的最差情况是 0.45 tCK。
- **tDQSH_pre / tDQSL_pre**：这两个参数是 DQS Preamble 期间的高/低脉冲最小宽度。它们确保 Preamble 的每一个翻转都有足够的脉冲宽度让接收端可靠采样。

### Table 38 — 高速（DDR5-5200~9200）

高速下 1 tCK 和 2 tCK Preamble 不再使用——最低是 3 tCK。到了 DDR5-6800 以上，甚至 3 tCK 也不够用，必须切换到 4 tCK。

一个值得注意的趋势：**随着速度升高，tDQSH_pre 和 tDQSL_pre 的范围收窄了**（从 0.395-0.605 收窄到 0.450-0.550 tCK）。这是因为高速下 1 UI 更短，DQS 脉冲的占空比必须更精确才能保证足够的建立/保持时间。

> **表 1**: Table 37 — Strobe Preamble and Postamble Timing Parameters DDR5-3200 to 4800 (JESD79-5D Page 127)
> **表 2**: Table 38 — Strobe Preamble and Postamble Timing Parameters DDR5-5200 to 9200 (JESD79-5D Page 128)

---

## 4.4.4 怎么测量 Preamble 和 Postamble？

JEDEC 定义了统一的测量方法（Sections 4.4.4-4.4.5）：

**tRPRE 和 tWPRE 的测量**：起点是 DQS 差分信号从静态电平开始翻转穿越 **VswM**（Swing Measurement Voltage——差分信号摆幅测量电压）的时刻；终点是第一个 Burst 数据 bit 对应的 DQS 差分交叉点。VswM HIGH = VIHdiffDQS（差分输入高阈值），VswM LOW = VILdiffDQS（差分输入低阈值）。

**tRPST 和 tWPST 的测量**：起点是最后一个 Burst 数据 bit 对应的 DQS 差分交叉点；终点是 DQS 差分信号穿越回 VswM 的时刻。

> **图 6**: Figure 21 — Method for Measuring Preamble Start and End Points (JESD79-5D Page 129)
> **图 7**: Figure 22 — Method for Measuring Postamble Start and End Points (JESD79-5D Page 129)

---

## 4.4.5 回顾与总结

Preamble 和 Postamble 是 DQS 从"沉默"到"说话"和从"说话"到"沉默"的过渡带。选择合适的长度是一个工程权衡：更长的 Preamble 给 PHY 更多的时间锁定 DQS 相位，但占用总线时间；更短的 Preamble 节省带宽，但在高速下 PHY 可能来不及锁定。

DDR5 用 MR8 的 8 个 OP 位把所有这些选择集中到一个寄存器里——Read Preamble、Read Postamble、Write Preamble、Write Postamble 各占 2-3 位。再配合 MR40（Read DQS Offset），Controller 可以精细地控制 DQS 的每一个翻转相位。

选择策略没有"唯一正确答案"——取决于 PHY 设计和眼图扫描结果。下表是一个经验性参考：

| Speed Bin | 推荐 Read Preamble | 推荐 Write Preamble | 推荐 Postamble |
|-----------|-------------------|---------------------|---------------|
| DDR5-4800 | 2 tCK (0010) | 2~3 tCK | 0.5 tCK |
| DDR5-5600 | 3~4 tCK | 3~4 tCK | 1.5 tCK |
| DDR5-6400+ | 4 tCK | 4 tCK | 1.5 tCK |

---

**协议原文**: JESD79-5D Section 4.4 (Page 123-129)
**下一节**: [DDR5-S4.5-间隔导言] (4.5 Interamble)
**关联笔记**: [DDR5-读写时序] | [DDR5-S4.7-读操作] | [DDR5-ModeRegister] (MR8, MR40)
