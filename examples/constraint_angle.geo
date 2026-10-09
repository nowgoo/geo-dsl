/* v0.2 断言：角度约束 angle(B,A,C) = 2*angle(A,B,C)
   △ABC 中 ∠A = 2∠B：取 ∠A = 60°、∠B = 30°，则 ∠C = 90°。
   断言模式按 EPSILON 严格校验，坐标需全精度字面量（C.y = √3/2） */

canvas { width: 400 height: 400 padding: 48 }

A = (0, 0)
B = (2, 0)
C = (0.5, 0.8660254037844386)

ABC

angle(B, A, C) = 2 * angle(A, B, C)

label A
label B
label C
mark right_angle(A, C, B)
