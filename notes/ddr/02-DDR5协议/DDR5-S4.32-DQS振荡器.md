# 4.32 DQS 间隔振荡器 (DQS Interval Oscillator)

> **协议原文**: JESD79-5D v1.41, Section 4.32 (Page 269-273)

---

## 4.32.0 不靠查表，直接测量——DDR5 的"自举"时钟检测

DDR5 Controller 需要知道精确的 tCK（时钟周期）来设置时序参数。CL = 34 tCK、tRCD = 34 tCK——这些"多少个 tCK"只有在你知道 tCK 是多少纳秒的前提下才有意义。传统方式是查 DRAM 的 SPD（Serial Presence Detect）EEPROM——里面记录了这颗 DRAM 在各个 Speed Bin 下的 tCK 值。但如果 SPD 读错了、或者 DRAM 被降频使用了、或者需要动态验证——查表就不够了。

DDR5 内置了一个**自由运行的 DQS 振荡器**。通过 MPC 命令（OP = Start）启动后，DRAM 将内部的振荡波形直接输出到 DQS 引脚上。Controller 测量 DQS 的振荡周期——比如用内部的高精度计数器测量 N 个周期的总时间 → 除以 N → 得到精确的振荡周期 → 反推出 DRAM 当前的内部时钟频率（因为振荡器的频率与内部时钟有固定的比例关系）。

振荡频率的计数值也可以通过 **MR46（LSB）+ MR47（MSB）** 这 16-bit 寄存器通过 MRR 读取——Controller 不一定要做外部测量，可以直接读这两个寄存器来做频率换算。

> **关联笔记**: [DDR5-S4.15-多功能命令] | [DDR5-ModeRegister] (MR46-47)
