# 第二章 DDR5 SDRAM 封装、引脚定义与寻址

> **协议原文**: JESD79-5D v1.41, Section 2 (Page 3-8)

---

## 2.1-2.5 封装概要

DDR5 使用 **MO-210 BGA 封装**，0.80mm 焊球间距。x4/x8 为 13 行 × 6 列电气焊球，x16 为 16 行 × 6 列。x4 只有 DQ[3:0] 且不支持 DM/TDQS；x8 有 DQ[7:0] + DM_n/TDQS_t 复用；x16 分两组对称 Nibble（Lower: DQL[7:0]+DQSL_t/c+DML_n, Upper: DQU[7:0]+DQSU_t/c+DMU_n）。SDP/3DS 封装的 TEN 焊球在 DDP 中被复用为 CS1_n；CAI 在 DDP 中接地不可用，焊球复用为 Top Die 的 ZQ1。完整的焊球位置表见 Table 1-2（JESD79-5D Page 3-4），下面直接进入引脚功能和寻址部分。

> **图 1**: Table 1 — x4/x8 Ballout (JESD79-5D Page 3)
> **图 2**: Table 2 — x16 Ballout (JESD79-5D Page 4)

---

## 2.6 引脚功能描述（Table 3 完整翻译与解读）

Table 3 是第二章的核心——它定义了 DDR5 芯片**每一个引脚的电气功能、方向和关键约束**。下面逐类解读。

### 2.6.1 时钟信号

**CK_t, CK_c（差分时钟，Input）**

所有地址和控制信号（CA[13:0], CS_n, ODT, CKE）在 **CK_t 上升沿与 CK_c 下降沿的交叉点**被采样。CK 必须始终运行——Power-Down 期间不能停，只有 Self Refresh 期间可以停止。DDR5-3200 下 CK = 1600 MHz，DDR5-6400 下 CK = 3200 MHz。

### 2.6.2 芯片选择

**CS_n（Chip Select，Input）——还可复用为 CS1_n（DDP 封装下选择 Rank 1）**

CS_n 是命令系统的"总开关"。**CS_n = H 时所有命令被屏蔽**——DRAM 忽略 CA 总线。CS_n = L 时命令有效。多 Rank 系统中，Controller 通过拉低不同 Rank 的 CS_n 来选择通信对象。DDR5 废除 CKE 引脚后，CS_n 也接管了 Power-Down 进出控制（[DDR5-S4.10-掉电模式]）。

### 2.6.3 数据掩码

**DM_n / DMU_n / DML_n（Data Mask，Input）**

DDR5 的 DM 是**独立引脚**（与 DDR4 中 DM/DBI 共用不同，也与 DDR5 中 DBI 无专用引脚不同）。协议原文："Input data is masked when DM_n is sampled LOW."

- **DM = L → 屏蔽该数据拍**（不写入 SA）
- **DM = H → 正常写入**

DM_n 在 DQS 双沿均被采样——Burst 的每一位与 DQ 的对应位一一配对。x8 器件由 **MR5 OP[5] = 1** 使能。**x4 器件不支持 DM**。x16 器件有独立的 DMU_n（Upper Nibble）和 DML_n（Lower Nibble）。

### 2.6.4 命令地址总线

**CA[13:0]（Command/Address，Input）**

14 根命令地址输入。命令和地址统一编码在 CA[13:0] 上，依照 [DDR5-S4.1-命令真值表] 中的编码规则。Table 3 特别提醒：**"Since some commands are Multi-Cycle, the pins may not be interchanged between devices on the same bus"**——2-Cycle 命令要求 CA 引脚在总线上的位置固定，不能为了 PCB 布线方便而任意交换。CA 在 CK 上升沿被锁存。

### 2.6.5 异步复位

**RESET_n（Active Low Asynchronous Reset，Input）**

RESET_n = L → DRAM 进入复位（异步，不依赖 CK）。RESET_n = H → 正常操作。CMOS 轨至轨信号——DC 高电平 ≥ 80% VDDQ，低电平 ≤ 20% VDDQ。

### 2.6.6 数据 I/O

**DQ（Data Input/Output，双向）**

双向数据总线。x4: DQ[3:0]，x8: DQ[7:0]，x16: DQL[7:0] + DQU[7:0]。CRC 使能时，CRC 校验位附加在 Data Burst 末尾。

### 2.6.7 数据选通

**DQS_t/c, DQSU_t/c, DQSL_t/c（Data Strobe，双向）**

DQS 是 DDR5 最核心的源同步信号。**读时由 DRAM 驱动**（边沿对齐数据），**写时由 Host 驱动**（数据中心对齐数据——DRAM 内部再将 DQS 延迟 90° 对齐边沿）。x16 器件有两组独立的 DQS：DQSL_t/c 对应 DQL[7:0]，DQSU_t/c 对应 DQU[7:0]。**DDR5 仅支持差分 DQS**——不支持单端模式（DDR4 低速档允许单端）。

### 2.6.8 终端数据选通

**TDQS_t, TDQS_c（Termination Data Strobe，Output）**

仅适用 x8 器件。**MR5 OP[4] = 1** 使能时，DRAM 在 TDQS_t/c 上提供与 DQS_t/c 相同的终端阻抗。**MR5 OP[4] = 0** 禁用时，**DM_n/TDQS_t 共享物理焊球**提供 Data Mask（取决于 MR5 OP[5]），TDQS_c 不连接。x4/x16 必须将 MR5 OP[4] 设为 0。TDQS 的物理意义：多 Rank 系统中闲置 Rank 的 DQS 引脚通过 TDQS 打开终端，吸收 DQS 总线反射。

### 2.6.9 告警信号

**ALERT_n（Alert，双向——正常为 Output，CT Mode 为 Input）**

CRC 错误（写校验失败）或 CA Parity 错误时，ALERT_n 拉低脉冲（≥ 2 CK），然后自动恢复。Connectivity Test Mode 中反转方向为 input。如果系统不用 ALERT_n，PCB 上必须**上拉至 VDDQ**。

### 2.6.10 测试使能

**TEN（Test Enable，Input）——DDP 封装中为 CS1_n**

x4/x8/x16 器件**必须支持**。TEN = H → 进入 Connectivity Test Mode（[DDR5-S4.22-连通性测试]），DRAM 正常功能完全旁路。TEN 内部有弱下拉到 VSS。在 DDP（双芯片）封装中该焊球复用为 **CS1_n**（Rank 1 的 Chip Select）——DDP 不支持 TEN。

### 2.6.11 配置 Strap 信号

以下三个引脚不是运行时动态翻转的控制信号——它们是 PCB 设计阶段通过**固定上拉或下拉**来配置硬件选项的 Strap 信号：

**MIR（Mirror，Input）**
- 接 **VDDQ** → **Mirrored Mode**（CA[2]↔CA[3], CA[4]↔CA[5] 等偶数-奇数对内部互换）。用于 DIMM 正反两面布局时简化 PCB 走线——两面的 DRAM 使用镜像模式后 CA 走线可以不交叉。
- 接 **VSS** → 标准模式（无镜像）。

**CAI（Command & Address Inversion，Input）**
- 接 **VDDQ** → DRAM 内部**反转所有 CA 信号的逻辑电平**。用于 DIMM 上通过 Register 芯片后 CA 极性可能反转的场景。
- 接 **VSS** → 不反转。

**CA_ODT（CA ODT Control，Input）**
- 接 **VSS** → 应用 **Group A** CA ODT 设置
- 接 **VDDQ** → 应用 **Group B** CA ODT 设置

两组预设值允许 DIMM 上不同位置的 DRAM（近端 vs 远端）用硬件 Strap 而非 MR 来选不同的 CA ODT。详见 [DDR5-S4.40-CA_ODT配置]。

### 2.6.12 Loopback 专用引脚

**LBDQ（Loopback Data Output，Output）** 和 **LBDQS（Loopback Data Strobe，Output）**

专用于 Loopback 模式（[DDR5-S4.39-环回]）。Loopback 使能时 LBDQ 驱动输出数据，LBDQS 提供单端 Strobe（上升沿边沿对齐，下降沿中心对齐）。Loopback 禁用时由 MR36 OP[2:0] 控制端接或高阻。

### 2.6.13 电源引脚

| 电源 | 电压 | 用途 |
|------|------|------|
| **VDD** | 1.1V | 核心逻辑（CA 解码器、Decoder、DLL） |
| **VDDQ** | 1.1V | DQ/DQS I/O 供电 |
| **VSS** | 0V | 地 |
| **VPP** | 1.8V | **DRAM 激活电源**——Word Line 升压驱动 |

VPP 是 DDR5 新增的独立电源域（DDR4 内部升压，不需外部 VPP）。用途：驱动 Word Line 打开时需要比 VDD 更高的电压来克服 NMOS Access Transistor 的阈值损失。在 DIMM 上由 PMIC 统一管理（[DDR5-PMIC]）。

### 2.6.14 ZQ 校准基准

**ZQ / ZQ1（Reference）**

ZQ 引脚连接 **240Ω ±1%** 外部精密电阻到 VSS——这是 DDR5 系统中最精密的元件。ZQ 校准（[DDR5-S4.23-ZQ校准]）将内部阻抗与这个外部基准比较来校准 Ron 和 RTT。DDP 封装中 ZQ1 专为 Top Die 服务（Bottom Die 用 ZQ）。

---

## 2.7 DDR5 SDRAM 寻址（Addressing）

Tables 4-8 定义了不同密度 DDR5 芯片的地址空间分配——决定了命令真值表中 BG[2:0], BA[1:0], R[17:0], C[10:0] 这些字段的**实际有效范围**。

### 2.7.1 四个寻址维度

一次完整的 DDR5 寻址包含四个层级：

| 维度 | 编码字段 | 选择什么 |
|------|---------|---------|
| **Bank Group** | BG[2:0]（3-bit） | 8 个 BG 中的一个（x16 只有 4 个 BG） |
| **Bank** | BA[1:0]（2-bit） | 选定 BG 内的 1~4 个 Bank |
| **Row** | R[17:0]（最多 18-bit） | 选定 Bank 内的某一行 |
| **Column** | C[10:0]（最多 11-bit） | 选定 Row 内的起始列/Burst 起始点 |

### 2.7.2 完整寻址表

| 配置 | BG 地址 | BA | #BG / #Bk/BG / Total Bk | Row 地址 | Col (x4/x8) | Col (x16) | Page Size | CID |
|------|--------|-----|------------------------|---------|------------|----------|-----------|-----|
| 8 Gb x8 | BG0~2 | BA0~1 | 8/4/32 | R0~R15 | C0~C9 | C0~C9 | 1KB | CID0~3/16H |
| 16 Gb x8 | BG0~2 | BA0~1 | 8/4/32 | R0~R16 | C0~C9 | C0~C9 | 1KB | CID0~3/16H |
| 24 Gb x8 | BG0~2 | BA0~1 | 8/4/32 | R0~R16* | C0~C9 | C0~C9 | 1KB | CID0~3/16H |
| 32 Gb x8 | BG0~2 | BA0~1 | 8/4/32 | R0~R16 | C0~C9 | C0~C9 | 1KB | CID0~3/16H |
| 64 Gb x8 | BG0~2 | BA0~1 | 8/4/32 | R0~R17 | C0~C9 | C0~C9 | 1KB | CID0~2/8H |

**\* 非二进制密度（24 Gb 等）的特殊约束见 2.7.4。**

### 2.7.3 关键规律

**Bank Group 数量**：x4/x8 为 8 BG，x16 为 4 BG。x16 的 I/O 面积是 x8 的两倍，为控制芯片总面积，减少了一半的 Bank Group。Bank 总数：x4/x8 = 8 × 4 = **32 Banks**，x16 = 4 × 4 = **16 Banks**——与 DDR4（最高 4BG × 4Bk = 16 Banks）相比，x8 DDR5 的 Bank 数量翻倍。

**Row 位宽随密度增长**：8Gb 用 16-bit Row（65536 行），16Gb/32Gb 用 17-bit，64Gb 用 18-bit（262144 行）。Row 数量的增长是密度的主要驱动力——Column 和 Bank 数量基本不变。

**Column 位宽**：x4 器件用 11-bit（C0~C10），支持 BL32 大列空间；x8/x16 用 10-bit（C0~C9）。这与 [DDR5-S4.2-突发长度] 中 BL32 仅 x4 支持的规则一致——x4 的列空间更大以容纳双倍 Burst 的寻址需求。

**Page Size**：一次 ACT 打开的数据量 = Column 数 × 接口位宽。x4 = 2048 cols × 4b = 8Kb = **1KB**，x8 = 1024 cols × 8b = 8Kb = **1KB**，x16 = 1024 cols × 16b = 16Kb = **2KB**。Page Size 越大，ACT 的"最小操作粒度"越大——反映在 Row 激活功耗（一次 ACT 不管后面读多少数据，整行都会被读到 SA）。

### 2.7.4 非二进制密度的特殊约束

Table 6（24 Gb）中 Note 1："For non-binary memory densities, a quarter of the row address space is invalid. When the MSB address bit is 'HIGH', the MSB-1 address bit shall be 'LOW'."

非二进制密度（6/12/24/48 Gb）的 Row 地址中**1/4 空间不可用**。约束规则：当 Row 地址最高位（MSB）= 1 时，次高位（MSB-1）必须 = 0。如果 MSB=1 且 MSB-1=1 → 指向不存在的物理存储。ACT 到非法地址后读写行为与合法地址一致，但数据不可预测。实际有效 Row = (3/4) × 2^(Row bits)。

### 2.7.5 CID 与 3DS 堆叠

**CID[3:0]** 是 4-bit 芯片 ID——在 3DS（3D Stacked）封装中用于选择堆叠中的哪一层 Die。单片封装（SDP/DDP）下 CID 为 V（Don't Care）。最大堆叠高度：8~32Gb 为 16H（用全 CID[3:0]），64Gb 为 8H（用 CID[2:0]）。

### 2.7.6 寻址实例验证

以 **16 Gb x8**（表格行 BG0~2, BA0~1, R0~R16, C0~C9, Page Size=1KB）计算总容量：

```
8 BG × 4 Bank × 2^17 Rows × 1024 Cols × 8-bit = 8 × 4 × 131072 × 8192-bit
= 34,359,738,368 bit = 32 Gb (×8 颗 = 256 Gb per DIMM Rank = 32 GB per Rank)
```

> **表 1-5**: Tables 4-8 — DDR5 Addressing Tables (JESD79-5D Page 7-8)

---

**协议原文**: JESD79-5D Section 2 (Page 3-8)
**关联笔记**: [DDR5-S4.1-命令真值表] | [DDR5-信号定义] | [DDR5-架构总览] | [DDR5-S4.2-突发长度]
