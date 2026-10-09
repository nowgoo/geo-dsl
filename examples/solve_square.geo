/* v0.2 求解：正方形构造 —— 6 条约束、4 个未知坐标（冗余但一致，rank = 4）
   C、D 的坐标完全由约束链 AB = BC = CD = DA 与两组垂直定出 */

canvas { width: 440 height: 440 padding: 48 }

A = (0, 0)
B = (4, 0)
C = ?
D = ?

ABCD

AB = BC
BC = CD
CD = DA
AB _|_ BC
BC _|_ CD

label A
label B
label C
label D
mark right_angle(A, B, C)
mark equal_length(AB, BC)
