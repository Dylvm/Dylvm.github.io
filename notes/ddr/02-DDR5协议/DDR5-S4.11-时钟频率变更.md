# 4.11 输入时钟频率变更 (Input Clock Frequency Change)

> **协议原文**: JESD79-5D v1.41, Section 4.11 (Page 163-164)
> **阅读前提**: [DDR5-S4.9-自刷新操作]（频率变更依托 Self Refresh 机制——SREF 是 SRE 的变体，进入/退出流程与 Self Refresh 共享相同的骨架）。

---

## 4.11.0 从一个实际问题开始：动态调频怎么做到？

现代系统经常需要动态调整内存频率——从 DDR5-6400（高性能模式）降到 DDR5-3200（省电模式），或者反过来。但 DDR5 的几乎所有操作都依赖于一个精确且稳定的 CK 时钟：DLL 用它产生 DQS 的精细延迟、时序参数（tRCD、tCL 等）用它做 tCK 换算、内部数据通路用它做同步。

如果 Controller 在正常操作期间突然改变时钟频率——哪怕只是从 3200 MHz 变成 2400 MHz——DLL 会瞬间失锁，所有基于 DLL 的时序都会错乱，正在传输的数据会变成垃圾。所以 DDR5 规定：**时钟频率只能在 Self Refresh with Frequency Change（SREF）模式下改变**。

SREF 是 SRE 的一个变体——命令编码中 **CA9 = L**（普通 SRE 的 CA9 = H 或任意）。进入 SREF 后，DRAM 进入 Self Refresh，时钟可以安全地停止和变更。但有一个关键问题：**新频率下需要的 Mode Register 配置值（tCCD_L、tDLLK、Vref、ODT 等）和旧频率下的值不同**。如果在频率变更之后再慢慢写 MR，在 MR 生效之前 DRAM 会短暂地用旧配置运行在新频率上——这可能导致时序违例。DDR5 用**影子寄存器（Shadow Register）**优雅地解决了这个问题。

---

## 4.11.1 影子寄存器：提前埋伏，到时自动切换

影子寄存器的逻辑很简单：Controller 在**进入 SREF 之前**，就将新频率所需的配置值预写到 MR11/MR12/MR13/MR32/MR33 的"影子副本"中。这些值不会被立即采纳——它们只是"暂存"在后台。当 SREF（CA9=L）触发频率变更时，DRAM 在退出 Self Refresh 的 tCSL_FreqChg 期间**自动**把影子寄存器值加载到对应的主 MR 中。

五个影子寄存器覆盖了新频率下需要变更的所有关键参数：

| 影子寄存器 | 对应参数 | 为什么新频率需要不同值 |
|-----------|---------|---------------------|
| **MR13 OP[3:0]** | tCCD_L, tCCD_L_WR, tCCD_L_WR2, tDLLK | 这些参数以 tCK 为单位——tCK 变了，tCK 计数也要变 |
| **MR11** | VrefCA | 不同频率下 CA 总线的最佳参考电压不同 |
| **MR12** | VrefCS | 同上，CS_n 的参考电压 |
| **MR32** | CK/CS ODT | 终端阻抗与频率相关——频率高了可能需要更低的 RTT |
| **MR33** | CA/DQS_PARK ODT | 同上 |

当 SREF 退出时，DRAM 自动将 MR11←影子MR11、MR12←影子MR12、...——这五个 MR 在新频率下的配置一次性全部生效，不需要 Controller 退出后再逐条发 MRW。

---

## 4.11.2 完整频率变更的八步流程

**第一步：预加载影子寄存器。** 在 DRAM 处于 IDLE 状态时，Controller 通过 MRW 命令将新频率对应的值写入上述五个 MR。注意此时写入的是**影子寄存器**，不是 MR 的主副本——DRAM 的行为还没有任何变化。

**第二步：进入 SREF。** 发 SREF 命令（SRE with CA9 = L）。CA9 = L 是关键——它告诉 DRAM："这次 Self Refresh 期间要变频率，请在退出时加载影子寄存器"。

**第三步到第五步：进入 Self Refresh。** 与普通 Self Refresh 完全相同——等待 tCPDED、CS_n 拉低、等待 tCKLCS、停止时钟。

**第六步：变更时钟频率。** 此时 DRAM 已经进入 Self Refresh。**改变外部时钟频率**——新频率必须在后续 tCKSRX 之前稳定下来。频率变更的范围受限于 Speed Bin 定义的最小和最大工作频率。

**第七步：恢复时钟并退出。** 恢复新频率的 CK 时钟 → 等待 tCKSRX → CS_n 拉高 → NOP 序列。在 **tCSL_FreqChg** 期间，DRAM 自动将五个影子寄存器值加载到主 MR 中。

**tCSL_FreqChg = VrefCA_time**——这个时间比普通 Self Refresh 退出时的 tCSL_SRexit 要长，因为 Vref 的变更需要时间来稳定（模拟电压不能瞬间跳变）。Protocol Table 64 中规定 tCSL_FreqChg 的最小值 = VrefCA_time。

**第八步：等待恢复，补写其他 MR。** tXS 后可以发不需要 DLL 的命令；tXS_DLL 后可以发所有命令。**在 tXS 之后、tXS_DLL 之前**这个窗口内，Controller 可以补写那些不在影子寄存器中、但也需要为新频率调整的 MR——例如 CL、CWL、Preamble 设置、DFE 系数、DCA 值。这些参数依赖于 DLL，所以必须在 DLL 重新锁定之前写完——一旦 DLL 锁定，旧的 CL 值就会以新频率生效，导致错误的延迟。

---

## 4.11.3 Clock-Sync 在频率变更中的角色

如果使能了 SRX/NOP Clock-Sync 功能（[DDR5-S4.9-自刷新操作] §4.9.4），多频率操作时需要特别注意：每个频率的 DCA 训练前，都需要先做一次对应的 SRE/SRX/Clock-Sync 序列。确保每次频率变更后，第一个 NOP 的时钟相位与这个频率的 DCA 训练时一致。

> **图 1**: Figure 66 — Frequency Change during Self Refresh (JESD79-5D Page 164)
> **表 1**: Table 63 — Self Refresh with Frequency Change (JESD79-5D Page 164)
> **表 2**: Table 64 — Self-Refresh Frequency Change Timing Parameters (JESD79-5D Page 164)

---

**协议原文**: JESD79-5D Section 4.11 (Page 163-164)
**下一节**: [DDR5-S4.12-最大省电模式]
**关联笔记**: [DDR5-S4.9-自刷新操作] | [DDR5-ModeRegister] (MR11-13, 32-33)
