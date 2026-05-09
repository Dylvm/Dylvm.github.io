# 4.6 激活命令 (Activate Command)

> **协议原文**: JESD79-5D v1.41, Section 4.6
> **阅读前提**: 建议先阅读 [DDR芯片存储原理-完整篇] 第 6 章（Access 阶段）和 [DDR5-S4.1-命令真值表]（ACT 的 CA 编码）。

---

## 4.6.0 ACT 在 DDR 操作流中的核心地位

ACT（Activate）是**所有 DDR 读写操作的起点**。在发出任何 READ 或 WRITE 命令之前，目标 Row 必须先被 ACT 打开——数据从存储电容阵列搬运到 Sense Amplifier 中。没有 ACT，READ/WRITE 没有操作对象。

ACT 的物理过程我们在 [DDR芯片存储原理-完整篇] 第 6 章已经详细讲述过：
1. Row Decoder 选中一根 WL → 驱动为高电平
2. 整行所有存储单元的 Access Transistor 导通
3. 电容与 BL 电荷共享 → 微小的差分电压建立
4. SA 感知、放大、回写 → 该行数据在 SA 中就绪

从命令角度看，ACT 需要提供**三维地址**：
- **BG[2:0]**：选择目标 Bank Group（0~7）
- **BA[1:0]**：选择 Bank Group 内的目标 Bank（0~3）
- **R[16:0]**：选择目标 Row（行地址，位数取决于密度）

---

## 4.6.1 ACT 命令的 CA 编码回顾

ACT 是 2-Cycle 命令，CA[1:0] = LL（这是 2-Cycle 中少见的 CA1=L 编码，见 Table 30）：

| 周期 | 关键 CA 位 | 字段 |
|------|-----------|------|
| 1st | CA[10:8] | BG[2:0] — Bank Group 地址 |
| 1st | CA[7:6] | BA[1:0] — Bank 地址 |
| 1st | CA[5:2] | R[3:0] — Row 地址低 4 位 |
| 2nd | CA[12:2] | R[14:4] — Row 地址中段 |
| 2nd | CA13 (复用) | CID3 或 R17（取决于 3DS 和高密度配置） |

---

## 4.6.2 非二进制密度下的地址注意事项

DDR5 支持非 2 的幂次密度——如 **24Gb** 和 **48Gb**。这些密度下，Row 地址和 Column 地址的位数不再遵循严格的 2^n 关系。

以 24Gb 为例（Table 6, JESD79-5D Page 7）:
- Row 地址：R[16:0] 中的部分位有特殊映射
- 某些 Row 地址组合是无效的——对应不存在的物理行

控制器的地址映射必须处理这些"空洞"。如果你对 24Gb DRAM 发出了一个映射到不存在 Row 的 ACT 命令，行为是未定义的——可能导致数据误写或误读。

---

## 4.6.3 ACT 的关键时序约束

| 参数 | 含义 | DDR5-4800 典型值 |
|------|------|-----------------|
| **tRCD** | ACT → READ/WRITE 最小间隔 | ~14 ns (34 tCK) |
| **tRAS** | ACT → PRE 最小间隔 | ~32 ns (77 tCK) |
| **tRC** | 同一 Bank ACT → ACT 最小间隔 (= tRAS + tRP) | ~46 ns (111 tCK) |
| **tFAW** | 四激活窗口（连续 4 次 ACT 的最小时间窗） | ~21 ns |
| **tRRD** | 两次 ACT 之间的最小间隔 | 取决于同/不同 BG |

---

**协议原文**: JESD79-5D Section 4.6 (Page 134)
**下一节**: [DDR5-S4.7-读操作] (4.7 Read Operation)
**关联笔记**: [DDR芯片存储原理-完整篇] | [DDR5-S4.1-命令真值表] | [DDR5-时序参数速查]
