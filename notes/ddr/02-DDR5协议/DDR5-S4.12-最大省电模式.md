# 4.12 最大省电模式 (Maximum Power Saving Mode, MPSM)

> **协议原文**: JESD79-5D v1.41, Section 4.12 (Page 165-166)
> **网络参考**: [CSDN: JESD79-5之4.12 MPSM](https://blog.csdn.net/m0_61126667/article/details/132095835)

---

## 4.12.0 比 Self Refresh 更极端

在 Self Refresh（[DDR5-S4.9-自刷新操作]）中，DRAM 自主维持刷新以保证数据不丢失。但还有一些场景——比如系统进入最深的休眠、电池几乎耗尽、或者 DRAM 被用作一个临时的大容量缓冲区（数据已经不需要了但硬件还没断电）——连刷新功耗都想省掉。

MPSM（Maximum Power Saving Mode）就是为这种极端场景设计的。它的核心特征是协议原文中的一句话：**"Data retention is not guaranteed when DRAM is in any of MPSM states."** 数据可能丢。只有 Mode Register 状态和软件 PPR 信息被保留。这是 DDR5 所有省电状态中功耗最低的模式——因为连刷新都停了。

### 进入条件

MPSM 通过 **MR2 OP[3] = 1**（MPSM Enable）使能，发 MRW 命令写入后 DRAM 进入 MPSM Idle 状态。如果还需要按特定 DRAM 芯片进入（通过 PDA），可以用 **MR2 OP[5] = 1**（Device 15 MPSM Enable）配合 PDA Enumerate ID = 15 来只让特定 DRAM 进入——这在多芯片 Rank 中提供了更精细的控制。

---

## 4.12.1 MPSM 三层状态

MPSM 有三个深度递增的子状态，分别对应正常模式下的 Idle、Power-Down、Self Refresh：

### MPSM Idle

进入 MPSM 后的默认状态。DRAM 在此状态下**忽略绝大多数命令**，只响应四种：
- **MRW**：Exit MPSM（通过写 MR2 OP[3] = 0 退出）
- **ODT**：正常执行终端控制
- **PDE**：进入 MPSM Power Down
- **SRE**：进入 MPSM Deep Power Down

DLL 保持与正常 IDLE 相同的状态。DRAM 继续驱动 CA ODT——所以同一 Rank 上的其他 DRAM（如果它们不在 MPSM 中）可以继续操作。**不需要满足 tREFI**——刷新被停止了。这也是"Data retention is not guaranteed"的直接原因。

### MPSM Power Down

通过 PDE 命令从 MPSM Idle 进入。与正常 Precharged Power Down 类似——DRAM 响应 ODT 命令。通过 PDX 命令退出回 MPSM Idle（经过 tXP 延迟）。

### MPSM Deep Power Down (DPD)

通过 SRE 命令从 MPSM Idle 进入。**DRAM 在此状态下不执行任何内部刷新操作**。输入信号要求与正常 Self Refresh 相同——外部时钟可以停止，CS_n 保持低。通过 SRX 命令退出回 MPSM Idle（经过 tXS，需满足 tXS_DLL 才能用 DLL 命令）。

---

## 4.12.2 退出 MPSM 和命令时序

通过 MRW 写 MR2 OP[3] = 0（或 MR2 OP[5] = 0）退出 MPSM Idle。退出后的第一个有效命令延迟 **tMPSMX ≥ tMRD**。

| 参数 | 最小值 | 说明 |
|------|--------|------|
| tMPSMX | tMRD | MPSM 退出到第一个有效命令 |

> **图 1**: Figure 67 — State Diagram for MPSM (JESD79-5D Page 165)
> **图 2**: Figure 68 — MPSM Exit Timings (JESD79-5D Page 166)
> **表 1**: Table 65 — MPSM Configuration Options (JESD79-5D Page 165)
> **表 2**: Table 66 — MPSM Timing Parameters (JESD79-5D Page 166)

---

**协议原文**: JESD79-5D Section 4.12 (Page 165-166)
**关联笔记**: [DDR5-S4.10-掉电模式] | [DDR5-S4.9-自刷新操作]
