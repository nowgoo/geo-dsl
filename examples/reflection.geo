/* 轴反射：D 是 C 关于直线 l 的镜像点。
   拖动 C（或 A/B）观察镜像与连线；CC' 恒被 l 垂直平分。 */

canvas { width: 600 height: 400 padding: 40 }

A = (0, 0)
B = (8, 0)

l = line(A, B)

C = (3, 4)
D = reflect(C, l)

CD

M = projection(C, l)

label A
label B
label C
label D
label M

style CD {
    stroke: #4a90d9
    width: 1.5
    dash: 6 4
}
