# 4.3 预充电命令 (Precharge Command)

> **协议原文**: JESD79-5D v1.41, Section 4.3
> **阅读前提**: 建议先阅读 [DDR芯片存储原理-完整篇] 第 6-7 章（读操作四阶段中的 Precharge 和 Restore 阶段的物理过程），以及 [DDR5-S4.1-命令真值表]（PRE 命令的 CA 编码）。

---

## 4.3.0 概述：Precharge 在 DDR 操作流中的位置

回忆 [DDR芯片存储原理-完整篇]：一次完整的 DRAM 访问流程是 **ACT → READ/WRITE → PRE**。ACT 打开一行，READ/WRITE 在 Sense Amplifier 中读写数据，PRE 关闭这一行——SA 中的数据回写到电容，Word Line 关断，Bit Line 被均衡到 Vref（Vcc/2）。

Precharge 有三个物理后果：
1. **SA 中的数据被回写**到存储电容（Restore 完成）
2. **WL 关断**，Access Transistor 关闭，电容隔离
3. **BL 对被均衡**到 Vref，为下一次 ACT 做好准备

从协议层面看，**PRE 命令是 Bank 状态转移的关键节点**——发出 PRE 后，该 Bank 从 ACTIVE 状态回到 IDLE 状态。在 IDLE 状态下，Bank 可以接受新的 ACT 命令（打开任意 Row）。PRE 到下一个 ACT 的最小间隔由 **tRP（Row Precharge Time）** 规定——因为 BL 均衡需要时间。

---

## 4.3.1 三种粒度的 Precharge 命令

DDR5 提供了三种 Precharge 命令变体，适应不同场景的需求：

### Table 36 — Precharge Encodings

| 命令 | 缩写 | 作用范围 | CA 关键编码 |
|------|------|---------|------------|
| **Precharge** | PREpb | 单个 Bank（BG + BA 指定） | CA[5:4]=HH, CA10=H |
| **Precharge All** | PREab | 所有 Bank Group 的所有 Bank | CA[5:4]=HL, CA10=L |
| **Precharge Same Bank** | PREsb | 所有 BG 中同号 Bank（BA 指定） | CA[5:4]=HL, CA10=H |

> **表 1**: Table 36 — Precharge Encodings（JESD79-5D Page 122）

### PREpb (Precharge Per Bank) — 逐 Bank 关闭

最精细的粒度。关闭由 **BG[2:0]** 和 **BA[1:0]** 指定的那一个 Bank。这是最常用的 Precharge 命令——当你完成对某个 Bank 的读写后，只关闭它，不影响其他 Bank。

**使用场景**：正常的 Bank 关闭流程。控制器在 Bank Tracker 中维护每个 Bank 的状态，当某个 Bank 不再被需要或需要切换到不同 Row 时，发 PREpb 关闭它。

### PREab (Precharge All Banks) — 全局关闭

最粗的粒度。**同时关闭所有 Bank Group 中的所有已打开 Bank**。不管之前打开了多少个 Bank、每个 Bank 处于什么状态——PREab 一刀切全部关闭。

**使用场景**：
- **进入 Self Refresh 之前**：Self Refresh 要求所有 Bank 处于 IDLE 状态
- **系统复位或重新初始化**：清理所有 Bank 状态
- **刷新调度中的"全局冲突"**：如果太多 Bank 同时 Active 且都需要刷新，控制器可能选择 PREab 全部关掉

代价是 tRP 之后才能重新 ACT 任何一个 Bank——全局的"苏醒"时间较长。

### PREsb (Precharge Same Bank) — 跨 BG 同名 Bank 关闭

中等粒度。关闭**所有 Bank Group 中由 BA[1:0] 指定的那个编号的 Bank**。例如 PREsb with BA=2 → BG0 Bank2、BG1 Bank2、…、BG7 Bank2，共 8 个 Bank 同时被关闭。

**使用场景**：刷新管理。REFsb 命令刷新的是所有 BG 中的同号 Bank——刷新前需要先把这些 Bank 关闭（如果它们处于 Active 状态）。PREsb 恰好匹配这个需求——一次命令关闭 REFsb 需要刷新的全部 Bank。

---

## 4.3.2 Auto-Precharge（自动预充电）— 隐藏在读写中的 PRE

除了显式的 PRE 命令，DDR5 还支持 **Auto-Precharge（自动预充电）**——将 PRE 操作嵌入到 READ 或 WRITE 命令中。

### 如何触发

在 RD 或 WR 命令的第 2 个周期，**CA11（即 AP 位）= L** 时，该读写命令会在传输完数据后**自动执行一次 PREpb**（关闭当前 Bank）。

```
标准流程:  ACT → READ → 等待 tRTP → PRE → 等待 tRP → 可再 ACT
Auto-Precharge:  ACT → READ (AP=L) → 数据出来 → 自动 PRE（隐藏了部分时间）
```

### 为什么能"隐藏"

Auto-Precharge 利用了 **tRAS 的锁存电路**（RAS Lockout Circuit）：即使在数据还没传输完的时候就发 RD+AP 命令，DRAM 内部的 Precharge 操作也要等到 tRAS 满足（SA 数据已经安全回写到电容）之后才会真正执行。这样一来，控制器可以提前"预约"关闭 Bank，而不需要等数据全部传输完再单独发一条 PRE 命令。

**对性能的影响**：在随机访问场景（同一个 Bank 反复访问不同的 Row），Auto-Precharge 可以减少单独发 PRE 的命令开销，提升总线利用率。但在连续的同一个 Row 访问场景，不应该用 Auto-Precharge（因为它会关闭你还要继续用的 Row）。

### Auto-Precharge 与 Write Recovery

对于写操作（WRA），Auto-Precharge 必须等 **最后一个写数据被安全存储到电容** 之后才能开始执行。这意味着 Auto-Precharge 的时机受到 tWR（Write Recovery Time）的约束——如果写数据还在传输中，PRE 不能提前执行。DRAM 内部的时序控制电路会自动处理这个约束。

---

## 4.3.3 Precharge 相关的时序参数

### tRP (Row Precharge Time)

**含义**：PRE 命令到下一个 ACT 命令的最小时间。

**物理原因**：SA 数据回写到电容 + WL 关断 + BL 均衡到 Vref。这个过程不是瞬间的——BL 有大寄生电容，均衡需要时间（见 [DDR芯片存储原理-完整篇] 第 6 章）。

**DDR5-4800 典型值**：~14 ns ≈ 34 tCK。

### tRAS (Row Active Time)

**含义**：ACT 到 PRE 的最小时间。也就是说，打开一行后必须等 tRAS 才能关闭它。

**物理原因**：SA 需要时间把数据充分放大并回写到电容。如果 tRAS 不够，回写不完整，数据可能丢失。这个约束对 Auto-Precharge 同样有效——如果 RD+AP 发得太早，内部锁存电路会延迟 Precharge 直到 tRAS 满足。

### tPPD (Precharge to Precharge Delay)

**含义**：两次 PRE 命令之间的最小间隔。

**DDR5 规定**：tPPD 适用于 PREab、PREsb、PREpb 之间的任意组合。对于 3DS，tPPD 还适用于不同 Die 的 Precharge 命令。

---

## 4.3.4 一个容易忽略的细节：对已经 IDLE 的 Bank 发 PRE

JEDEC 明确规定：**允许对没有打开 Row 的 Bank（即已经处于 IDLE 状态）发 PRE 命令**。在这种情况下，PRE 被当作一个"冗余操作"——不会出错，Bank 继续保持 IDLE。但有一个微妙之处：tRP 周期由**最后一次**对该 Bank 发出的 PRE 命令决定。也就是说，如果你对一个 IDLE 的 Bank 发了 PRE，然后立即 ACT，你可能需要等 tRP——虽然 Bank 已经是 IDLE 了。

> 在实际控制器设计中，应该通过 Bank Tracker 避免对 IDLE Bank 发 PRE，以消除无谓的时序等待。

---

## 4.3.5 本节总结

| 命令 | 作用范围 | 数据回写 | 主要使用场景 |
|------|---------|---------|------------|
| PREpb | 单个 Bank | 只有目标 Bank | 正常 Bank 关闭 |
| PREab | 全部 Bank | 全部 Bank | 进入 Self Refresh / 全局复位 |
| PREsb | 所有 BG 同号 Bank | 目标 Bank 组 | REFsb 刷新前关闭 |
| Auto-Precharge | 单个 Bank（嵌入 R/W） | 目标 Bank | 随机访问减少命令开销 |

**关键约束**：PRE → ACT ≥ tRP（等 BL 均衡）；ACT → PRE ≥ tRAS（等 SA 回写完成）。

---

**协议原文**: JESD79-5D Section 4.3 (Page 122)
**下一节**: [DDR5-S4.4-可编程前导后导] (4.4 Preamble and Postamble)
**关联笔记**: [DDR芯片存储原理-完整篇] | [DDR5-S4.1-命令真值表]
