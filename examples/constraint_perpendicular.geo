/* v0.2 断言：垂直约束 AB _|_ BC（直角在 B） */

canvas { width: 480 height: 360 padding: 40 }

A = (0, 0)
B = (3, 0)
C = (3, 2)

AB
BC
AC

AB _|_ BC

label A
label B
label C
mark right_angle(A, B, C)
