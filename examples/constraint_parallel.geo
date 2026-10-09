/* v0.2 断言：平行约束 —— 平行四边形 ABCD 的两组对边 */

canvas { width: 520 height: 360 padding: 40 }

A = (0, 0)
B = (5, 0)
C = (6.5, 3)
D = translate(A, 1.5, 3)

ABCD

AB // DC
AD // BC

label A
label B
label C
label D
mark parallel(AB, DC)
