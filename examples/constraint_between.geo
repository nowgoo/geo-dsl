/* v0.2 断言：介于约束 A-M-C —— M 在线段 AC 上且三点共线 */

canvas { width: 520 height: 300 padding: 40 }

A = (0, 0)
C = (8, 0)
M = mid(A, C)

AC
A-M-C

label A
label C
label M
mark equal_length(AM, MC)
