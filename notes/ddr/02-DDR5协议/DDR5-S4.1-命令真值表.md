# 4.1 命令真值表 (Command Truth Table)

> **协议原文**: JESD79-5D v1.41, Section 4.1, Table 30
> **阅读前提**: 建议先阅读 [DDR芯片存储原理-完整篇] 了解 DRAM 内部工作原理，以及 [DDR5-信号定义] 了解 CA 总线和各信号的物理含义。

---

## 4.1.0 概述：命令真值表是什么、为什么需要它

在深入表 30 之前，我们先回答三个最根本的问题。

### 这个表是干什么的？

在 DDR4 及之前的时代，内存控制器通过 RAS_n、CAS_n、WE_n、ACT_n 这四根控制信号的不同组合来表达不同的命令——ACT 是 RAS_n=0/CAS_n=1/WE_n=1，READ 是 RAS_n=1/CAS_n=0/WE_n=1，以此类推。这是一种"独立控制信号编码"的方式，每个控制信号有独立的物理含义（Row Address Strobe、Column Address Strobe、Write Enable）。

DDR5 摒弃了这种方式，改为使用 **CA[13:0]（Command/Address，命令地址总线）** 来统一编码所有的命令和地址信息。14 根 CA 信号线上的高低电平组合，就能表达几十种不同的命令，同时可以把 Bank Group 地址、Bank 地址、行地址、列地址、Mode Register 地址、操作码等信息嵌入其中。

**命令真值表（Table 30）就是 CA[13:0] 编码的"字典"**——它告诉你，内存控制器要发出一条特定的命令时，应该把 CA[13:0] 的每一根线分别驱动成什么电平。

### 为什么需要理解它？

如果你只使用 FPGA 厂商提供的 DDR 控制器 IP 核（如 Xilinx MIG 或紫光/安路的 DDR IP），你通常不需要直接跟 CA 编码打交道——IP 已经帮你封装好了。但在以下场景中，你必须理解命令真值表：

- **调试初始化失败**：控制器发出的 MRW（Mode Register Write）是否把正确的值写入了正确的 Mode Register？你需要看 CA 线上的 MR 地址和 OP 数据是否正确。
- **开发自己的 DDR 控制器**：你需要逐周期精确控制 CA[13:0] 的电平来生成每一个命令。
- **理解 DDR5 的新命令**：DDR5 引入的 SAME-BG-P、REFsb、RFM、MPC 等新命令的编码方式是什么？它们在 CA 总线上如何表达？
- **分析 ILA/SignalTap 波形**：当你抓取了 CA 总线的波形，需要把电平组合翻译成具体的命令名称。

### 表的整体结构

表 30 可以理解为按行排列的"命令字典"——每一行定义了一个命令的完整编码。列分为两组：

| 列分组 | 含义 |
|--------|------|
| **Function / Abbreviation** | 命令的名称（全称和缩写） |
| **CS_n** | Chip Select 信号的电平（第 1 + 第 2 周期的要求） |
| **CA[13:0]（第 1 周期）** | CS_n 为低电平的第一个 CK 上升沿时，CA[13:0] 各线的值 |
| **CA[13:0]（第 2 周期）** | CS_n 为低电平的第二个 CK 上升沿时，CA[13:0] 各线的值（仅 2-Cycle 命令） |
| **NOTES** | 指向表下方 26 个编号注释中的相关条目 |

表中使用的符号约定：

| 符号 | 含义 |
|------|------|
| **H** | 逻辑高电平（Logic High，通常 = VDDQ ≈ 1.1V） |
| **L** | 逻辑低电平（Logic Low，通常 = VSS ≈ 0V） |
| **V** | "Valid"——必须是一个确定的逻辑电平（H 或 L），但具体值取决于地址/操作数的内容 |
| **X** | "Don't Care"——可以是任意电平，甚至可以让信号浮空（floating），DRAM 不会采样这个位的值 |
| **BG[2:0]** | Bank Group 地址（3-bit，选择 0~7 号 Bank Group） |
| **BA[1:0]** | Bank 地址（2-bit，选择 0~3 号 Bank） |
| **R[16:0]** | Row 地址（行地址，位数取决于 DRAM 密度） |
| **C[10:0]** | Column 地址（列地址，位数取决于 DRAM 密度和 Burst 设置） |
| **MRA[7:0]** | Mode Register 地址（选择 256 个 MR 中的某一个） |
| **OP[7:0]** | Operand / Op Code（写入 MR 的数据，或 MPC 的操作码） |
| **CID[3:0]** | Chip ID（用于 3D Stacked / 3DS 封装，选择堆叠中的某颗 Die） |
| **CW** | Control Word（用于 MRW/MRR 的额外控制） |

---

## 4.1.1 命令的两级分类：1-Cycle 与 2-Cycle

DDR5 的命令按占用周期数分为两大类：**1-Cycle 命令**和 **2-Cycle 命令**。这是一个非常重要的设计决策，我们从"为什么"的角度来理解。

### 为什么需要两种不同长度的命令？

在 DDR4 中，所有命令都是 1 个 CK 周期的——一个 CS_n 脉冲就完成一条命令。但 DDR5 的 CA 总线是 14 根线，需要承载的信息远超 DDR4（DDR5 有更多的 Bank、更多的 Mode Register、更多的新命令类型）。如果所有命令都只用一个周期，14 根线不够同时表达命令类型 + 完整地址 + 操作数。

最自然的解决方案就是把命令分成两种：
- **信息量少的命令**（如 Power Down Entry/Exit、Deselect、NOP）→ 只需要 1 个周期，14 根线足够表达
- **信息量多的命令**（如 ACT 需要传完整的 Row Address，WRITE/READ 需要传 Column Address 和 Burst 配置）→ 需要 2 个周期，第一个周期传核心编码，第二个周期传附加数据

### 如何区分 1-Cycle 和 2-Cycle？—— CA1 的关键角色

JEDEC 委员会做了一个精巧的设计：**用 CA1 来区分 1-Cycle 和 2-Cycle 命令**。具体规则是：

```
第一个 CK 上升沿 (CS_n = L) 采样 CA1:
  CA1 = 0 (L) → 这是一个 1-Cycle 命令
  CA1 = 1 (H) → 这是一个 2-Cycle 命令
```

这个设计的巧妙之处在于：DRAM 的命令解码器只需要检查 CA1 的电平，就知道这个命令是否需要一个额外的 CK 周期来完成。不需要额外的控制信号，不需要在 MR 中预先设置——一切都在第一时间被判断。

**一个特例——CS_n 也帮助区分**：在 PDF 提取的表格中可以看到，1-Cycle 命令（如 PDE、PDX、NOP、DES、VrefCA、VrefCS）的 CS_n 在第一个周期为 L，且编码中使用特定 CA 组合使得 CA1=L；2-Cycle 命令（ACT、READ、WRITE、PRE、MRW 等）的 CA1=H。另外，DES（Deselect）命令只需要 CS_n=H 即可，CA 任意（X）。

**关于 1-Cycle 到 2-Cycle 的调整**：仔细看表 30 可以看到，实际上 Read/Write 系列的命令（RD, RDA, WR, WRA）以及 PRE、REF 等大多数功能命令都是 2-Cycle 的（CA1=H），而真正的 1-Cycle 命令（CA1=L）主要是 PDE、PDX、NOP、VrefCA、VrefCS、MPC 等少数命令。这种设计是因为 DDR5 的命令结构比 DDR4 复杂得多，绝大多数命令都需要两个周期来承载完整信息。

---

## 4.1.2 命令真值表 — Table 30 完整解析

下面我们逐个命令地解读 Table 30 的编码。每个命令我们都从三个角度来理解：**名字是什么意思、用来干什么、CA[13:0] 怎么编码**。

### 4.1.2.1 行操作命令

#### ACT (Activate) — 打开一行

ACT 是整个 DDR 访问流程的起点。在读写任何数据之前，你必须先用 ACT 命令把目标 Row 打开到 Sense Amplifier 中（回忆我们之前讲的：ACT → WL 导通 → Row 数据读到 SA）。DDR5 的 ACT 命令需要指定三个维度的地址：**哪一个 Bank Group、哪一个 Bank、哪一行**。

**编码**（Table 30 第 1-2 行）：

| 周期 | CS_n | CA0 | CA1 | CA2 | CA3 | CA4 | CA5 | CA6 | CA7 | CA8 | CA9 | CA10 | CA11 | CA12 | CA13 |
|------|------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|------|------|------|------|
| 1st | L | L | L | R0 | R1 | R2 | R3 | BA0 | BA1 | BG0 | BG1 | BG2 | CID0 | CID1 | CID2 |
| 2nd | H | R4 | R5 | R6 | R7 | R8 | R9 | R10 | R11 | R12 | R13 | R14 | R15 | R16 | CID3/R17 |

ACT 是 2-Cycle 命令（第 1 周期 CA1=L，这是少数几个 CA1=L 的 2-Cycle 命令，注意它的特殊性：CA0=L 且 CA1=L 时被识别为 ACT^^[注：表中 ACT 的 CA[1:0]=LL，而其他 1-Cycle 命令通常有不同的 CA0 编码。ACT 实际上通过 CA0 和 CS_n 第 2 周期的行为来区分]^^）。

**字段解读**：
- **R[16:0]**：17 位行地址，跨两个周期传输。R[3:0] 在第 1 周期（CA[5:2]），R[16:4] 在第 2 周期。不同密度的 DRAM 使用的 Row 位数不同（8Gb 用 R[15:0]，16Gb 用 R[16:0]），未使用的位设为"V"（Valid，可以是任意确定电平）。
- **BA[1:0]**：Bank 地址，在第 1 周期的 CA[7:6] 上。选中的是 Bank Group 中的哪个 Bank（0~3）。
- **BG[2:0]**：Bank Group 地址，在第 1 周期的 CA[10:8] 上。选中 0~7 号 Bank Group。
- **CID[3:0]**：Chip ID，用于 3D Stacked（3DS）封装。在非 3DS 的普通封装中，这些位设为 "V" 即可。注意 CID3 和 R17 在 CA13 上是复用的——16H 3DS 封装时用 CID3，高密度单片封装时用 R17，两者互斥（见 Note 17）。

> **图 1**: ACT 命令的 2-Cycle 时序示意图（CS_n 和 CA 总线的波形关系）

---

### 4.1.2.2 列操作命令

#### RD (Read) — 读数据

当目标 Row 已经被 ACT 打开（等待 tRCD 之后），就可以发 RD 命令来读取列数据了。DDR5 的 RD 命令需要指定 **Bank Group、Bank、起始 Column 地址**，同时通过 Burst Length 控制位来选择使用默认 BL16 还是备用的 Burst 模式。

**编码**（Table 30 第 8-9 行）：

| 周期 | CS_n | CA0 | CA1 | CA2 | CA3 | CA4 | CA5 | CA6 | CA7 | CA8 | CA9 | CA10 | CA11 | CA12 | CA13 |
|------|------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|------|------|------|------|
| 1st | L | L | H | H | H | H | BL*=L | BA0 | BA1 | BG0 | BG1 | BG2 | CID0 | CID1 | CID2 |
| 2nd | H | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | V | H | V | V | CID3 |

**字段解读**：
- **CA[4:2] = H, H, H**：这个组合（3'b111）是 RD 命令的核心标识符。注意这三位加上 CA0=L、CA1=H 一起构成了对 RD 命令的识别。
- **BL\***：Burst Length 选择。当 BL\*=L 时，使用 **MR0 OP[1:0]** 中配置的备用 Burst 模式（可以是 BC8 OTF、BL32 等），而不是默认的 BL16。这让控制器可以在默认 BL16 和备用 Burst 之间动态切换（"On The Fly"）。
- **C[10:2]**：Column 地址的高 9 位。注意 Col 地址并没有 C0 和 C1——因为 BL16 模式下最低 2 位列地址被用来做 Burst 内部的字节顺序选择（见 4.2 节 Burst Order）。
- **CA11 = H**（第 2 周期）：这个位在第 2 周期固定为 H，它和 VrefCA/VrefCS（第 2 周期 CA11=L）形成区分。

#### RDA (Read with Auto-Precharge) — 读 + 自动关闭行

RDA 与 RD 基本相同，唯一的区别是在读操作完成后**自动对该 Bank 执行 Precharge**（关闭当前行）。这消除了单独发 PRE 命令的需要，在随机访问场景中可以减少命令开销。

**编码区别**（与 RD 对比）：

| 周期 | RD | RDA |
|------|-----|------|
| 1st CA[11:0] | 相同 | 相同 |
| 2nd CA11 | H（固定） | AP=L（即 CA11=L 表示 Auto-Precharge 使能） |

**注意**：当 DRFM 功能使能时（MR58 OP[0]=1），RDA 的第 2 周期 CA11 的含义变为 "V or DRFM=L"，可能存在冲突。详见 Note 15。但实际上，在标准配置下 CA11=L 即表示 Auto-Precharge。

#### WR (Write) — 写数据

写操作的编码结构与读操作高度对称：

**编码**（Table 30 第 6-7 行）：

| 周期 | CS_n | CA0 | CA1 | CA2 | CA3 | CA4 | CA5 | CA6 | CA7 | CA8 | CA9 | CA10 | CA11 | CA12 | CA13 |
|------|------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|------|------|------|------|
| 1st | L | L | H | H | L | L | BL*=L | BA0 | BA1 | BG0 | BG1 | BG2 | CID0 | CID1 | CID2 |
| 2nd | H | V | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | V | H | WR_Partial=L | V | CID3 |

**RD 与 WR 的 CA[4:2] 对比**：

| 命令 | CA4 | CA3 | CA2 |
|------|-----|-----|-----|
| RD | H | H | H |
| WR | L | L | H |

CA[4:2] = 3'b110 是 WR 命令、3'b111 是 RD 命令——DRAM 解码器通过这三位就能区分读写。

**WR 特有的字段**：
- **WR_Partial**（第 2 周期 CA12）：当此位 = L 时，表示这是一个 **Partial Write** 命令——控制器只写部分列，DRAM 内部需要执行 Read-Modify-Write（先读出整行、修改目标列、再写回）。这是 DDR5 引入的新特性，用于支持更灵活的写操作。当 CA12=H 时，表示正常写操作。
- **C2** 在 RD 的第 2 周期 CA0 上出现，但在 WR 中 CA0 = V（任意）——这也是一个细微的不对称。

#### WRA (Write with Auto-Precharge) — 写 + 自动关闭行

与 RDA 同理——写操作完成后自动执行 Precharge。第 2 周期 CA11 的含义与 RDA 一样用于表示 Auto-Precharge。

---

### 4.1.2.3 Precharge 命令（预充电/关闭行）

当一行访问完毕后，需要关闭它——SA 中的数据回写到 Cs，WL 关断，BL 均衡——这个过程叫 Precharge。DDR5 提供了**三种不同粒度的 Precharge 命令**：

#### PREpb (Precharge Per Bank) — 关闭指定 Bank

关闭由 **BG[2:0]** 和 **BA[1:0]** 指定的那一个 Bank。这是最精细粒度的 Precharge。

**编码**：CA[5:4] = HH（第 1 周期），CA10 = H（第 2 周期）

#### PREsb (Precharge Same Bank) — 关闭所有 BG 中的同名 Bank

关闭**所有 Bank Group 中编号为 BA[1:0] 的那一个 Bank**。例如，PREsb with BA=0 会同时关闭 BG0 的 Bank0、BG1 的 Bank0、…、BG7 的 Bank0。

**编码**：CA[5:4] = HL（第 1 周期），CA10 = H（第 2 周期），CA[7:6] = BA[1:0]

#### PREab (Precharge All Banks) — 关闭所有 Bank

关闭**所有 Bank Group 中的所有 Bank**。一般在进入 Self Refresh 之前或做全局状态重置时使用。

**编码**：CA[5:4] = HL（第 1 周期），CA10 = L（第 2 周期）

> **表 1**: Table 36 完整复现了这三种 Precharge 命令的 CA 编码对比，建议对照阅读（见 4.3 节）。

---

### 4.1.2.4 Refresh 命令（刷新）

DDR5 的刷新体系比 DDR4 复杂得多。除了传统的全 Bank 刷新，DDR5 增加了 Same Bank Refresh（单 Bank 刷新）和 Refresh Management（刷新管理）两类新命令。

#### REFab (Refresh All Banks) — 全 Bank 刷新

对所有 Bank 同时执行一次刷新操作。这是最传统的刷新方式。刷新地址由 DRAM 内部计数器自动维护，控制器不需要提供 Row 地址。

**编码**：CA[5:3] = LLH（第 1 周期），CA[10:9] = LH（第 2 周期）

**关键参数**：
- 执行时间 = **tRFCab**（DDR5-4800 16Gb 约 295 ns）
- 两次 REFab 之间的间隔由 **tREFI** 决定（1x 模式 = 3.9 μs）

**CA8 和 CA9 的作用**（Notes 23-24）：
- 如果 **MR4 OP[3]=0**（刷新间隔指示器禁用）：CA8 只要设为 "V" 即可；CA9 同样。
- 如果 **MR4 OP[3]=1**（刷新间隔指示器使能）：CA8=H 表示 1x 刷新间隔（tREFI = 3.9 μs），CA8=L 表示 2x 刷新间隔（tREFI = 1.95 μs）。这让 DRAM 能"知道"控制器用的是哪种刷新频率。
- 如果 **MR58 OP[0]=0**（RFM 禁用）：CA9 只需为 "V"，REF 和 RFM 在 DRAM 看来是同一种命令。
- 如果 **MR58 OP[0]=1**（RFM 使能）：REF 命令必须 CA9=H，以区别于 RFM 命令。

#### REFsb (Refresh Same Bank) — 单 Bank 刷新

只刷新**所有 BG 中编号为 BA[1:0] 的 Bank**。刷新粒度比 REFab 细得多——一次只刷新 8 个 Bank（所有 BG 中的同号 Bank），而不是全部 32 个。对应的死区时间 **tRFCsb**（约 120 ns）远小于 tRFCab（约 295 ns）。

**编码**：与 REFab 的核心区别在于第 2 周期的 CA[10:9] = HH（REFab 是 LH），以及 CA[7:6] 承载 BA[1:0]。

这是 DDR5 推荐的刷新方式——将大块的刷新死区分割成小片，分散到不同时间点，显著降低刷新对正常访问的阻塞。

#### RFMab / RFMsb (Refresh Management) — 刷新管理命令

DDR5 全新引入的刷新管理框架。当 DRAM 检测到 Row Hammer（行锤击）风险时，会通过 ALERT_n 信号或内部计数器告知控制器。控制器发送 RFM 命令来执行额外的"管理刷新"。

RFM 命令的编码结构与对应的 REF 命令非常相似，区别在于第 2 周期 CA[10:9] 的编码：
- **RFMab**：CA[10:9] = LL（与 REFab 的 LH 不同，与 REFsb 的 HH 也不同）
- **RFMsb**：CA[10:9] = LH（具体编码见 Table 30）

---

### 4.1.2.5 Mode Register 命令

DDR5 有多达 256 个 Mode Register（详见 [DDR5-ModeRegister]），需要通过专门的 MRW（写）和 MRR（读）命令来访问。

#### MRW (Mode Register Write) — 写 Mode Register

这是 **DDR5 初始化过程中最重要的命令之一**。控制器用它来配置 DRAM 的所有可编程参数：CAS Latency、Burst Length、ODT 值、Vref 电平、DFE 系数……一切都在 MRW 中完成。

**编码**：

| 周期 | CS_n | CA0 | CA1 | CA2 | CA3 | CA4 | CA5 | CA6 | CA7 | CA8 | CA9 | CA10 | CA11 | CA12 | CA13 |
|------|------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|------|------|------|------|
| 1st | L | L | H | L | L | MRA0 | MRA1 | MRA2 | MRA3 | MRA4 | MRA5 | MRA6 | MRA7 | V | V |
| 2nd | H | OP0 | OP1 | OP2 | OP3 | OP4 | OP5 | OP6 | OP7 | V | V | CW | V | V | V |

**字段解读**：
- **MRA[7:0]**（第 1 周期 CA[11:4]）：Mode Register Address——选择要写入的是哪个 MR（0~255）。MRA0 在 CA4 上，MRA7 在 CA11 上。
- **OP[7:0]**（第 2 周期 CA[7:0]）：Operand——写入 MR 的 8-bit 数据。MR 中各个位的含义见 Section 3.5 的 MR 定义。
- **CW**（第 2 周期 CA11）：Control Word。如果 CW=L，DRAM 执行 MRW 命令，写 Mode Register。如果 CW=H，DRAM **忽略** MRW 命令，Mode Register 保持不变。这是一个非常有用的"条件写入"机制（见 Note 13）。

**MRW 是 2-Cycle 命令，且属于"无 ODT 控制"类型**（Note 11）：如果 DRAM 在 MRW 的第 2 个周期检测到 CS_n=L（而不是预期的 H），就不会执行该命令。这被称为 **Command Cancel（命令取消）**——详见 4.1.1 节。

**为什么需要两个周期？** 因为 MR 地址（8-bit）和写入数据（8-bit）加起来有 16-bit 的信息量，加上命令类型标识，一个 14-bit 的 CA 周期不够用。所以第 1 周期传 MR 地址，第 2 周期传写入数据。

#### MRR (Mode Register Read) — 读 Mode Register

MRR 是 MRW 的"镜像"操作——控制器读取某个 Mode Register 的当前值。这在训练过程中非常重要：比如 DFE 训练完成后，控制器需要通过 MRR 读出 DRAM 内部自动调整的 DFE 系数。

**编码**：与 MRW 高度相似，第 1 周期 CA[5:4] = LH（MRW 是 LL），第 2 周期 CA[1:0] = LL（用于 Burst Ordering，Note 21）。

MRR 的结果通过 **DQ 总线**输出（不是 CA 总线）——DRAM 将 MR 的值放到 DQ[7:0] 上，伴随 DQS 同步输出。如果启用了 CRC（MR5 OP[5]=1），读出的数据还会附带 CRC 校验位（Note 22）。

---

### 4.1.2.6 电源管理命令

#### PDE (Power Down Entry) — 进入省电模式

1-Cycle 命令。CKE 在 PDE 后拉低，DRAM 进入 Power Down 状态——内部时钟门控关闭，大部分电路休眠，功耗大幅下降。但 DRAM 仍然保留所有 Bank 的状态（打开的 Row 不会关闭）。

**编码特征**：CS_n = L（仅持续 1 个周期），CA1 = H，CA[4:2] = HHL，第 1 周期 CA10 = H 且携带 ODT 控制。

**Note 16**：CA10 在 PDE 命令中用于控制 ODT 行为。ODT=L 表示即使在 Power Down 期间也保持 ODT 终端——这允许同一 Rank 上的其他 DRAM 继续正常操作。

#### PDX (Power Down Exit) — 退出省电模式

1-Cycle 命令。CKE 在 PDX 后拉高，DRAM 退出 Power Down 状态。PDX 后需要等待 **tXP** 时间才能发下一个有效命令。

#### SRE (Self Refresh Entry) — 进入自刷新

2-Cycle 命令。DRAM 进入 Self Refresh 状态——与 Power Down 的区别在于，Self Refresh 期间 **DRAM 内部自行执行刷新**，外部时钟可以完全停止。这是系统休眠（如 S3 睡眠）时内存维持数据的机制。

**编码**：第 1 周期 CA[5:3] = HHL，CA[10:9] = HL

SRE 发出后，控制器需要等待 **tCKSRE** 时间，然后才可以停止 CK 时钟。

#### SRX (Self Refresh Exit) — 退出自刷新

退出 Self Refresh。先恢复 CK 时钟，再发 SRX 命令。SRX 后需要等待 **tXS** 时间（通常等于 tRFCab + 10ns），DRAM 才能接受下一个有效命令。

#### SREF (Self Refresh Entry with Frequency Change) — 进入自刷新并切换频率

与 SRE 类似，但同时允许控制器在 DRAM 自刷新期间**改变 CK 时钟频率**——这在系统动态调频场景中非常有用。编码区别在第 2 周期：SREF 的 CA10 = L（SRE 的 CA10 也是 L，但低频切换相关的编码在 CA9 上体现）。

---

### 4.1.2.7 其他命令

#### MPC (Multi-Purpose Command) — 多功能命令

1-Cycle 命令。DDR5 引入的"通用容器"命令——通过 OP[7:0] 扩展出几十种子功能，包括 ZQ Calibration、DQS Oscillator、RFM 管理等。

**编码**：第 1 周期 CA[5:3] = HHL，OP[7:0] 位于 CA[11:4]。MPC 是 CA1=L 的典型 1-Cycle 命令。

#### WRP / WRPA (Write Pattern) — 写固定 Pattern

DDR5 新引入的训练辅助命令。让 DRAM 用固定的 Pattern 代替实际写数据执行写操作，用于 Write Leveling 和其他训练流程。支持 BL16 和 BL32 模式（Note 18）。

#### VrefCA / VrefCS — 参考电压校准命令

1-Cycle 命令，用于在运行中动态调整 CA 总线和 CS_n 信号的参考电压（Vref）。OP[6:0] 指定具体的 Vref 值。

#### NOP (No Operation) — 空操作

1-Cycle 命令。与 DES（Deselect）不同，**NOP 被认为是一个"有效命令"**——也就是说，NOP 和上一个命令之间必须满足时序约束（如 tMRD 等）。而 DES 不是"有效命令"，不需要满足命令间的时序约束（Note 26）。

#### DES (Deselect) — 取消选择

最简单的"命令"——CS_n = H，CA 任意（X）。DRAM 不执行任何操作。在 CS_n = H 期间，DRAM 忽略 CA 总线上的所有信息。

---

## 4.1.3 表 30 的关键注释解读

JEDEC 在表 30 下方附了 26 个注释。这些注释不是"额外信息"——它们是准确理解命令行为的关键。我们选取最重要的几个来解读：

### Note 2: Bank Group 和 Bank 地址的作用域

> BG[2:0] 和 BA[1:0] 确定操作的目标是哪一个 Bank Group 中的哪一个 Bank。

这个注释看起来平淡无奇，但隐含了一个重要信息：**BANK 本身不是全局唯一的**。Bank 0 同时存在于 BG0、BG1、...、BG7 中。要唯一确定一个 Bank，你**必须同时提供 BG 和 BA**。这也是为什么 ACT、READ、WRITE、PREpb 命令都需要同时提供 BG[2:0] 和 BA[1:0]。

### Note 3-6: 全局命令的作用范围

- **Note 3**：REFab 和 RFMab 作用于**所有 Bank Group 中的所有 Bank**（全局刷新）。CA6 和 CA7 必须为 "V"（Valid）。
- **Note 4**：REFsb 和 RFMsb 作用于**所有 Bank Group 中 BA[1:0] 指定编号的那个 Bank**。例如 REFsb with BA=2 → BG0~BG7 中每个的 Bank 2 都被刷新。
- **Note 5**：PREab 作用于**所有 Bank Group 中的所有已打开 Bank**（全局预充电）。
- **Note 6**：PREsb 作用于**所有 BG 中的同号 Bank**。

理解这些作用范围是实现正确的 Bank 状态管理和刷新调度器的前提。

### Note 8: 第 2 周期 CS_n 控制非目标 Rank 的 ODT

> WR、RD 和 MRR 命令的第 2 个周期，CS_n = LOW 用于控制**非目标 Rank** 的 ODT。

这是一个非常精巧的设计。在 Multi-Rank 系统中（比如双 Rank DIMM），当控制器对 Rank 0 发出读命令时，Rank 1 虽然不是命令的目标，但它需要知道在 Rank 0 输出数据期间自己应该打开什么 ODT 值——否则开放的总线上会产生反射。DDR4 用专门的 ODT 引脚来控制这个行为，而 DDR5 直接把 ODT 控制信息嵌入到了命令的第 2 个周期中——如果 CS_n 在第 2 周期是低电平，非目标 Rank 就知道要调整自己的 ODT。

### Note 11 + 4.1.1: 2-Cycle 命令取消

> ACT、WRP、WRPA 和 MRW 是"无 ODT 控制"的 2-Cycle 命令。如果 DRAM 在第 2 个周期检测到 CS_n = L，则不执行该命令。

这个机制叫 **Command Cancel（命令取消）**。它的主要应用场景是 **CA Parity Error**（命令地址奇偶校验错误）：

1. RCD（Registering Clock Driver，DIMM 上的缓冲芯片）持续监测 CA 总线上的 Parity
2. 当 RCD 发现某个 2-Cycle 命令的第 1 或第 2 周期存在 Parity 错误
3. RCD 在第 2 个周期故意把 CS_n 保持为低电平（而不是正常情况下的高电平）
4. DRAM 检测到 CS_n 在第 2 周期 = L → 不执行该命令 → 避免了基于错误地址或错误数据执行命令

**区分处理**：
- 如果被取消的是 **RD、WR 或 MRR** 命令：DRAM 将其转换为"非目标终止命令"（Non-Target Termination）——不执行数据操作，但仍处理 ODT 相关行为。
- 如果被取消的是 **ACT、WRP、WRPA 或 MRW**：命令直接取消，DRAM 回到空闲状态。

**一个容易踩的坑**：Command Cancel 的时序约束（tCMD_cancel = 8 nCK）。被取消的命令和下一个有效命令之间必须满足至少 8 个 CK 周期的间隔。更关键的是，控制器在发下一个命令之前，必须考虑被取消的命令是否影响了 DRAM 的状态——例如，一个 ACT 被取消了，但控制器侧可能以为 Bank 已经打开了，这时直接发 READ 就会出错。协议要求在这种情况下先发 PRE 再发 ACT（见 4.1.1 节原文）。

### Note 13: CW (Control Word) 的条件执行

> MRW: 如果 CW = L，DRAM 执行命令，Mode Register 被写入。如果 CW = H，DRAM 忽略 MRW 命令。MRR: 如果 CW = L，DRAM 必须执行。如果 CW = H，DRAM 可以执行也可以不执行。

CW 位提供了一个**条件执行**机制。在多 Rank 系统中，你可以发一条 MRW 命令但通过 CW=H 让某些 Rank 忽略它——这使得 Per-DRAM Addressability（PDA，按芯片寻址）成为可能。在 PDA 模式下，不同 DRAM 芯片可以根据自己的 ID 决定是否执行 MRW/MRR 命令。

### Note 14: CID[3:0] 用于 3DS

> CID[3:0] 位用于 3DS 堆叠支持。在不使用 CID 时，这些位设为 "V"（Valid）。

3DS（3D Stacked）是 DDR5 支持的芯片堆叠技术——多层 DRAM Die 通过 TSV（Through-Silicon Via）垂直堆叠。CID 就是用来选择堆叠中哪一层 Die 的。对于普通的单片 DRAM，只需把这些位设为任意确定电平即可。

### Notes 23-24: CA8 和 CA9 的双重含义

这两个注释是理解 REF 命令编码的关键，我们在 REFab 部分已经详细解读过了。它们展示了 DDR5 一条命令在不同 MR 配置下会有不同行为——**命令的行为不仅取决于 CA 编码，也取决于 Mode Register 的状态**。这是 DDR5 命令系统的一个重要特征。

---

## 4.1.4 本章总结

DDR5 的命令真值表是一张 30 多行的"字典"，定义了从 ACT 到 DES 的所有命令在 CA[13:0] 总线上的编码。理解这张表的关键认知是：

1. **CA1 区分 1-Cycle 和 2-Cycle 命令**：这是 DRAM 命令解码器第一时间做出的判断。
2. **命令信息分布在两个周期上**：第 1 周期承载命令类型 + 基础地址，第 2 周期承载扩展地址 + 附加控制。两个周期合在一起，为 DDR5 的丰富命令集提供了足够的编码空间。
3. **同一组 CA 位在不同命令中有不同的含义**：例如 CA[7:6] 在 ACT 中是 BA[1:0]，在 REFsb 中也是 BA[1:0]，但在 MRW 中它是 MRA[3:2]。解码器根据命令类型来决定每个位的含义。
4. **Mode Register 的状态会影响命令行为**：例如 CA8 在 REF 中的含义取决于 MR4 OP[3]，CA9 的含义取决于 MR58 OP[0]。
5. **Command Cancel 机制保障了可靠性**：通过 CA Parity + 2nd Cycle CS_n 的低电平，错误的命令可以被取消而不会被执行。

---

**协议原文**: JESD79-5D Section 4.1, Table 30 (Page 118-119)
**下一节**: [DDR5-S4.2-突发长度] (4.2 Burst Length, Type, and Order)
**关联笔记**: [DDR5-命令集] | [DDR5-信号定义] | [DDR芯片存储原理-完整篇]
