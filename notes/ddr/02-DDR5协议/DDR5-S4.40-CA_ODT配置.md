# 4.40 CA_ODT Strap 操作 (CA_ODT Strap Operation)

> **协议原文**: JESD79-5D v1.41, Section 4.40 (Page 296-300)

---

## 4.40.0 CA 总线也需要终端——而且在芯片内部

在 [DDR5-PHY层] 中我们讨论了 DQ 总线上的 ODT（On-Die Termination）——在读写操作中动态切换终端阻抗来吸收信号反射。但 ODT 不只是 DQ 的事。**CA（命令地址）总线同样需要终端**——而且在多 Rank 系统中，CA 总线的终端可能比 DQ 更重要。

为什么？以一个双 Rank DIMM 为例：当 Controller 向 Rank 0 发送读命令时，Rank 1 虽然空闲，但它的 CA 输入引脚并不是完全"断开"的。CA 信号在传输线上传播到 Rank 1 的位置时，如果没有合适的终端，一部分信号能量会反射回来——干扰 Rank 0 正在接收的命令。这个反射在 DDR5 的高速率下（CA 总线以 CK 频率的 DDR 速率传输——DDR5-4800 下相当于 2400 Mbps per CA line）足以引起误码。

DDR4 时代在 PCB 上放一颗外部终端电阻就解决了。DDR5 把 CA 的终端移到了**芯片内部**——由 **CA_ODT 引脚**和 MR 配置共同控制。

---

## 4.40.1 CA_ODT 的两组配置

CA_ODT 引脚是一个"Strap"信号——它不在运行中动态翻转，而是在硬件设计时通过上拉/下拉固定到一个电平（接 VSS = Group A，接 VDDQ = Group B）。这为不同 PCB 布局下的 CA ODT 调优提供了两个预设值——Controller 可以通过 CA_ODT 引脚告诉 DRAM"你在 DIMM 的近端还是远端，用哪一组 ODT 配置"。

**MR32** 控制 CK_t/CK_c 和 CS_n 的终端阻抗——CK 和 CS_n 的终端可以有独立于 CA[13:0] 的配置。**MR33** 控制 CA[13:0] 总线和 DQS_PARK（DQS 空闲态）的终端阻抗。

通过 PDA（[DDR5-S4.16-按DRAM寻址]），Controller 还可以为每颗 DRAM 芯片分别配置 CA ODT——近端的芯片和远端的芯片用不同的终端值，最大程度吸收反射。

> **表 1**: Table 162 — CA_ODT Pinlist (JESD79-5D Page 297)
> **表 2**: Table 163 — MR32 Definition (JESD79-5D Page 297)
> **表 3**: Table 164 — MR33 Definition (JESD79-5D Page 297)

---

**协议原文**: JESD79-5D Section 4.40 (Page 296-300)
**关联笔记**: [DDR5-PHY层] | [DDR5-S4.16-按DRAM寻址]
