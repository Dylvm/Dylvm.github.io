# 4.9 自刷新操作 (Self Refresh Operation)

> **协议原文**: JESD79-5D v1.41, Section 4.9 (Page 156-160)
> **网络参考**: [CSDN: JESD79-5之4.9 Self Refresh Operation](https://blog.csdn.net/m0_61126667/article/details/132090558)
> **阅读前提**: [DDR芯片存储原理-完整篇] 第 15 章（刷新的物理根源——电容漏电，tREF ≈ 64ms）；基本的 Bank 状态概念（IDLE vs ACTIVE）。

---

## 4.9.0 场景：当系统需要睡一觉，但内存里的数据不能丢

DDR5 的正常工作模式要求 Controller 持续运行、CK 时钟持续翻转、每隔 tREFI（3.9 μs）就要发一次 REF 命令。这种模式下，即使没有任何读写请求，Controller 也不能完全关闭——它必须维持刷新。

但有些场景——笔记本电脑合盖休眠、手机息屏待机——需要让整个系统（包括 Controller 和时钟）进入最深度的睡眠。内存里的数据必须保留（唤醒后要继续用），但你不能期望 Controller 还在定时发 REF。**Self Refresh 就是为这个两难设计的**：Controller 发出一条 SRE 命令后，就可以关闭时钟、关闭自己的 DDR 接口——DRAM 内部会用自己的振荡器和刷新逻辑自主维持所有数据。当系统唤醒时，恢复时钟、发 SRX 命令，DRAM 恢复到正常状态。

Self Refresh 与 Power-Down（[DDR5-S4.10-掉电模式]）的根本区别就在于此：Power-Down 期间外部时钟仍然运行，刷新仍需 Controller 管理；**Self Refresh 期间外部时钟可以完全停止**，刷新由 DRAM 自主完成。一个是用"浅睡眠"换取低退出延迟（~8nCK），一个是用"深睡眠"换取最低功耗（时钟可以关），但退出延迟长（~tRFC）。

---

## 4.9.1 进入 Self Refresh：从活跃到沉睡的五步

进入 Self Refresh 不是发一条命令就完事的——它需要经过五个精确定时的阶段，确保 DRAM 在时钟停止前已经安全地切换到自主刷新模式。

### 第一步：SRE 命令发出前——确保 Bank 全部关闭

Self Refresh 要求所有 Bank 处于 IDLE 状态（已经 Precharge 完毕）。如果有 Bank 还开着，SA 中锁存的数据在时钟停止后会因为无法刷新而丢失。Controller 在发 SRE 之前必须通过 PREab（或逐个 PRE）关闭所有 Bank，并确保所有正在进行的 Burst 操作已经完成、所有时序约束（tMRD、tRFC 等）已经满足。DLL 应该处于锁定状态——这确保退出时最快恢复。

### 第二步：发出 SRE 命令，等待 tCPDED

SRE 是 2-Cycle 命令。在 CK 上升沿，CS_n 拉低，CA 总线承载 SRE 编码。这是 Controller 在"正常模式"下发的最后一条命令。

命令被 DRAM 锁存后，不是立即生效。DRAM 需要一段**命令传递禁用延迟**——tCPDED（Command Pass Disable Delay，最小值 = max(5ns, 8nCK)）——来完成内部模式切换。在这个窗口内，时钟必须继续运行（DRAM 还没完全进入自主模式），CS_n 必须保持高电平（Deselect），CA 总线可以任意。

### 第三步：CS_n 持续拉低——进入自刷新的信号

tCPDED 之后，Controller 将 CS_n 驱动为**持续低电平**。这个 CS_n = L 的状态就是 DRAM 的"进入自刷新"信号。从此刻起，CS_n 会一直保持低电平直到退出 Self Refresh——这是 Self Refresh 区别于 Power-Down（CS_n 保持高）的关键特征。

CS_n 的低脉冲必须至少维持 tCSL ≥ 10 ns。在此期间，DRAM 可能将内部接收器从正常模式切换到基于 CMOS 的低功耗接收器——进一步降低功耗。

### 第四步：等待 tCKLCS，然后可以停止时钟

CS_n 拉低后，Controller 还需要等待 **tCKLCS ≥ tCPDED + 1nCK**。这个额外的等待确保 DRAM 已经完全切换到自刷新模式、不再依赖外部时钟。

tCKLCS 满足后，Controller 可以**停止时钟**。时钟可以拉低、拉高、或完全关闭——DRAM 内部的振荡器接管了刷新定时的职责。从这一刻起，DRAM 进入真正的"自刷新状态"。

### 第五步：自刷新期间 DRAM 的行为

在 Self Refresh 期间：外部 CK 停止、CS_n 保持低电平、DRAM 内部自动按照**内置温度传感器**的指示调整刷新频率、所有 Mode Register 状态和软件 PPR 信息被保留。唯一例外是 PASR（部分阵列自刷新）掩码段的数据——这些段被明确标记为"不刷新"，所以不保证保留。

---

## 4.9.2 退出 Self Refresh：从沉睡到苏醒

退出流程比进入更复杂——因为需要重新建立时钟同步、命令解码，以及处理 Self Refresh 期间可能积累的"刷新债务"。

### 恢复时钟：给 DRAM 的闹钟

在退出之前，Controller 必须先恢复 CK 时钟。时钟必须稳定运行至少 **tCKSRX ≥ max(3.5ns, 8tCK)** 后才能发 SRX 命令。这段时间是给 DRAM 内部 PLL/DLL 的"锁定窗口"——从无时钟到有时钟，PLL 需要若干个周期来重新锁定。

### 发出 SRX 命令：上升沿是"起床铃"

Controller 将 CS_n 从持续低电平拉回高电平，满足 **tCSH_SRexit**（13 ns ≤ tCSH_SRexit ≤ 200 ns）。这个上升沿触发了 DRAM 的退出序列。

200 ns 的上限很重要——CS_n 不能在高电平停留太久，因为 DRAM 需要在 200 ns 内看到后续的 NOP 序列来确认退出。

### NOP 序列：确认退出

SRX 命令后，CS_n 需要保持一段低电平——**tCSL_SRexit ≥ 3nCK 且 ≤ 30ns**。在这个"低脉冲窗口"内，CA 总线上必须出现至少 **3 个 NOP**（No Operation）。这确保 DRAM 内部状态机能可靠识别退出命令——而不是把噪声或误码当成 CS_n 的跳变。

在 2N 模式下（[DDR5-S4.34-2N模式]），tCSL_SRexit 期间的 CS_n 不是静态低电平，而是**每 2 周期脉冲一次**（NOP-DES-NOP-DES-NOP 交替），最小持续 6nCK。

### 等待恢复：两段等待时间

退出 Self Refresh 后，DRAM 不能立即接受所有命令。需要两段恢复时间：

| 等待参数 | 时长 | 之后可用的命令 |
|---------|------|--------------|
| **tXS** | tRFC1（= tRFCab 值，密度相关） | 不需要 DLL 的命令：ACT、PRE、REF、MRW、PDE、PDX、MPC 等 |
| **tXS_DLL** | tDLLK（512~1024 tCK） | 全部命令，包括需要 DLL 的 READ、WRITE |

tXS 的"等于 tRFC1"反映了这样一个事实：退出 Self Refresh 后 DRAM 内部可能正在进行一次尚未完成的刷新操作。tXS 就是给这次"残留刷新"足够的时间来完成。高密度 DDR5 的 tRFC1 更长，所以 tXS 也更长。

---

## 4.9.3 退出后的额外刷新：同步刷新计数器

退出 Self Refresh 后有一个容易被忽略但非常重要的协议要求：Controller 必须在**正常的定期刷新之外**，额外发一次补充刷新。

为什么需要这个额外刷新？因为在 Self Refresh 期间，DRAM 内部的刷新计数器在自主运行——它和 Controller 的 tREFI 计数器失去了同步。退出后的额外刷新确保所有行的刷新相位重新对齐。

规则如下：额外刷新由**单次 REFab 或 n 次 REFsb**（n = 一个 Bank Group 的 Bank 数）组成，不计入 tREFI 的平均计算，必须在退出后的**第一个 tREFI 周期内**发出。如果 Controller 打算在发正常周期性刷新之前再次进入 Self Refresh，必须先把额外刷新发了。FGR（Fine Granularity Refresh）模式下可能还需要额外的刷新命令（详见 Section 4.13.7）。

---

## 4.9.4 SRX/NOP Clock-Sync：对齐内部时钟相位

这是 DDR5 引入的一个可选高级功能。要理解它为什么存在，需要先知道一个背景：DDR5 高速 PHY 内部使用 4 相位时钟（ICLK/QCLK/IBCLK/QBCLK）来产生精确的 DQS 时序。DCA（Duty Cycle Adjuster）训练确定了每个 DQ pin 应该对齐到哪个时钟相位。

问题在于：Self Refresh 期间时钟停止了。退出后，内部 4 相位时钟的起始相位是"随机"的——取决于时钟恢复时 CK 的第一个沿落在哪个相位上。如果 Clock-Sync 被使能（**MR13 OP[5] = 1**），DRAM 会检测 SRX 后第一个 NOP 到达的时钟管道是否与 DCA 训练时的一致。如果不一致，DRAM 自动调整内部时钟相位以匹配训练时的状态。

使用 Clock-Sync 的前提是 Host 系统能保证 SRX 后第一个 NOP 的时钟相位与 DCA 训练时始终一致。如果系统在 Self Refresh 期间会停止系统时钟（大多数休眠场景），这个前提不成立——Clock-Sync 不应被使能。

> **图 1**: Figure 62 — Self-Refresh Entry/Exit Timing with 2-Cycle Exit Command (JESD79-5D Page 158)
> **图 2**: Figure 63 — Self-Refresh Entry/Exit Timing with 1-Cycle Exit Command (JESD79-5D Page 158)
> **图 3**: Figure 64 — Self-Refresh Entry/Exit Timing in 2N Mode (JESD79-5D Page 159)

---

## 4.9.5 PASR：部分阵列自刷新（已废弃）

PASR（Partial Array Self Refresh）允许 Controller 在 Self Refresh 期间只刷新 DRAM 的一部分 Bank 段，以降低自刷新功耗。每个 Bank 按最高 3 位行地址划分为 6 或 8 个段，MR60 的每一位控制一个段的刷新与否。

> **注意**：PASR 从 JESD79-5C v1.30 开始已被废弃。不支持 PASR 的器件上 MR60 所有位表现为 RFU。下表保留供参考：

| 密度 | PASR 行地址位 | 段数 |
|------|-------------|------|
| 8 Gb | R[15:13] | 8 |
| 16 Gb | R[15:13] | 8 |
| 24 Gb | R[16:14] | 6 |
| 32 Gb | R[16:14] | 8 |
| 48 Gb | R[17:15] | 6 |
| 64 Gb | R[17:15] | 8 |

---

## 4.9.6 关键时序参数汇总

| 参数 | 最小值 | 最大值 | 含义 |
|------|--------|--------|------|
| tCPDED | max(5ns, 8nCK) | — | SRE 后到 CS_n 可变低 |
| tCSL | 10 ns | — | Self Refresh 期间 CS_n 低脉冲宽度 |
| tCKLCS | tCPDED + 1nCK | — | CS_n 拉低后到时钟可停止 |
| tCKSRX | max(3.5ns, 8tCK) | — | 恢复时钟到可发 SRX |
| tCSH_SRexit | 13 ns | 200 ns | 退出时 CS_n 高脉冲宽度 |
| tCSL_SRexit | 3nCK | 30 ns | 退出时 CS_n 低脉冲宽度 |
| tXS | tRFC1 | — | 退出到非 DLL 命令 |
| tXS_DLL | tDLLK | — | 退出到需要 DLL 的命令 |

> **表 1**: Table 57 — Self-Refresh Timing Parameters (JESD79-5D Page 159)
> **表 2**: Table 58 — MR60 Definition (JESD79-5D Page 160)
> **表 3**: Table 59 — PASR Segment Row Address Bits (JESD79-5D Page 160)

---

**协议原文**: JESD79-5D Section 4.9 (Page 156-160)
**下一节**: [DDR5-S4.10-掉电模式] (4.10 Power-Down Mode)
**关联笔记**: [DDR5-刷新机制] | [DDR5-S4.13-刷新操作] | [DDR5-S4.34-2N模式] | [DDR5-S4.11-时钟频率变更]
