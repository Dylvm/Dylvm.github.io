# 4.28 VrefDQ 校准规范 (VrefDQ Calibration Specification)

> **协议原文**: JESD79-5D v1.41, Section 4.28 (Page 247-252)
> **阅读前提**: [DDR5-S4.17-读训练Pattern]（MPR 提供训练用的已知数据）、[DDR芯片存储原理-完整篇]（DRAM 内部用 VrefDQ 判别 DQ 上的 0 和 1）。

---

## 4.28.0 眼图的那条水平线应该放在哪里

在 DDR5 的高速接收端，数据（DQ）上的每一个 bit 是通过与一个参考电压比较来判别的：电压高于 VrefDQ → 逻辑 1，低于 VrefDQ → 逻辑 0。如果把 DQ 的眼图画出来——时间轴是眼图的宽度（UI），电压轴是眼图的高度——VrefDQ 就是那条决定 0 和 1 分界线的水平线。

如果 VrefDQ 偏高了，逻辑 0 的噪声裕度变大（0 离阈值更远），但逻辑 1 的噪声裕度变小（1 离阈值更近——一个小的电压跌落就可能被误判为 0）。如果 VrefDQ 偏低了，反过来。**最优的 VrefDQ 总是把这条水平线放在眼图的绝对垂直中心**——上下的裕度最大化。

但"最优 VrefDQ"对不同 DRAM 芯片、甚至同一芯片上不同 DQ pin 都可能不同。芯片工艺差异导致不同 DRAM 的晶体管阈值电压有几十 mV 的偏差；PCB 走线长度差异导致不同 DQ pin 的衰减不同；温度和电压还会让这个最优值随时间漂移。

---

## 4.28.1 VrefDQ 训练：画一条浴盆曲线

VrefDQ 训练的核心流程是 **Vref 扫描 + 误码统计**：

1. **准备已知 Pattern**：通过 MR25 配置 MPR 读训练 Pattern（固定 128-bit 数据——Controller 知道每一位的正确值）
2. **VrefDQ 扫描**：从 MR10 OP[6:0] 的最小值到最大值，逐级调整 VrefDQ（每步一个 LSB）
3. **每个 Vref 值**：发 MPR READ → DRAM 用当前 VrefDQ 判别 DQ 上的 Pattern → Controller 比较读回的值与已知值 → 记录哪些 bit 出错
4. **绘制浴盆曲线**：横轴是 VrefDQ 值，纵轴是误码数量。曲线两端（Vref 太低和太高）误码多，中间有一个"无错误区间"
5. **最优 VrefDQ = (VrefDQ_min_no_error + VrefDQ_max_no_error) / 2**——取无错误区间的中心

这个"无错误区间"的宽度就是眼图的**垂直裕量**（以 mV 为单位）。如果这个区间很窄（比如只有 20 mV），说明眼图在这个 DQ pin 上已经很"扁"了——可能是 PCB 衰减太大或者 Vref 步进不够细。

---

## 4.28.2 Per-Pin VrefDQ Offset：每根 DQ 有自己的微调

DRAM 内部的 VrefDQ 是由一个全局 DAC 产生的——所有 DQ pin 共享同一个基准电压。但每根 DQ pin 的实际最优 VrefDQ 可能略微偏离这个全局值（因为走线差异）。DDR5 提供了**Per-Pin VrefDQ Offset**——在全局 VrefDQ 的基础上，每根 DQ pin 可以有自己的微调偏置。

Offset 寄存器（MR133~MR254 范围，以及 MR118 DML, MR126 DMU）采用 6-bit + sign 的格式：
- OP[6:4]：Offset 步进值（0~7，0 表示禁用 Offset）
- OP[7]：符号位（0=正, 1=负）
- 步进大小：1 LSB
- 范围：-3 ~ +3 LSB

训练完全局 VrefDQ 后，Controller 可以做更精细的 Per-Pin 扫描——在同一时刻只读一根 DQ pin 的 Pattern，找到该 pin 的最优 VrefDQ 偏移。这在高速 DDR5-6400+ 下对眼图裕量有显著影响——特别是那些走线比其他 pin 长或衰减更大的 DQ。

> **图 1**: Figure 120 — VrefDQ Training Timing (JESD79-5D Page 248)
> **表 1**: Table 25 — VrefDQ Setting Range (JESD79-5D Page 43)

---

**协议原文**: JESD79-5D Section 4.28 (Page 247-252)
**关联笔记**: [DDR5-S4.17-读训练Pattern] | [DDR5-训练流程] | [DDR5-ModeRegister] (MR10, MR133-254)
